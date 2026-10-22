const PDFDocument = require('pdfkit');
const { Dropbox } = require('dropbox');

let dropboxClient = null;

const {
  DROPBOX_APP_KEY,
  DROPBOX_APP_SECRET,
  DROPBOX_REFRESH_TOKEN,
  DROPBOX_ACCESS_TOKEN,
} = process.env;

if (DROPBOX_APP_KEY && DROPBOX_APP_SECRET && DROPBOX_REFRESH_TOKEN) {
  dropboxClient = new Dropbox({
    clientId: DROPBOX_APP_KEY,
    clientSecret: DROPBOX_APP_SECRET,
    refreshToken: DROPBOX_REFRESH_TOKEN,
  });
  console.log('✅ Dropbox initialized (refresh token)');
} else if (DROPBOX_ACCESS_TOKEN) {
  dropboxClient = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });
  console.log('✅ Dropbox initialized (static access token)');
  if (DROPBOX_ACCESS_TOKEN.startsWith('sl.')) {
    console.log('⚠️ Short-lived token in use — it expires ~4h after generation. Set DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN instead.');
  }
} else {
  console.log('⚠️ Dropbox not configured');
}

function describeDropboxError(error) {
  const parts = [];
  if (error && error.status) parts.push(`HTTP ${error.status}`);
  const body = error && error.error;
  if (typeof body === 'string') parts.push(body);
  else if (body && body.error_summary) parts.push(body.error_summary);
  else if (body) parts.push(JSON.stringify(body));
  else if (error && error.message) parts.push(error.message);
  return parts.join(' — ') || String(error);
}

async function uploadToDropbox(pdfBuffer, filename) {
  if (!dropboxClient) {
    console.log('⚠️ Dropbox not configured, skipping upload');
    return null;
  }

  const path = `/collagepdf/${filename}`;

  const response = await dropboxClient.filesUpload({
    path: path,
    contents: pdfBuffer
  });

  console.log('✅ Uploaded to Dropbox:', response.result.name);
  console.log('📎 Path:', response.result.path_display);

  return response.result;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Access-Control-Expose-Headers', 'X-Dropbox-Upload, X-Image-Errors');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pages } = req.body;
  
  try {
    console.log('Generating PDF with', pages?.length || 0, 'pages');
    
    if (!pages || !Array.isArray(pages)) {
      console.error('Invalid pages data:', pages);
      return res.status(400).json({ error: 'Invalid pages data' });
    }

    const renderablePages = pages.filter(page =>
      page && ((page.images && page.images.length > 0) || (page.texts && page.texts.length > 0))
    );

    if (!renderablePages.length) {
      return res.status(400).json({ error: 'No content to render in PDF' });
    }
    
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 0,
      autoFirstPage: false
    });
    
    const chunks = [];
    const imageErrors = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = `collage-${Date.now()}.pdf`;
      let uploadStatus = 'skipped';
      try {
        uploadStatus = (await uploadToDropbox(pdfBuffer, filename)) ? 'ok' : 'skipped';
      } catch (err) {
        uploadStatus = 'failed';
        console.error('❌ Dropbox upload failed:', describeDropboxError(err));
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Content-Disposition', 'attachment; filename="collage.pdf"');
      res.setHeader('X-Dropbox-Upload', uploadStatus);
      res.end(pdfBuffer);
    });

    for (let i = 0; i < renderablePages.length; i++) {
      const page = renderablePages[i];
      doc.addPage();
      
      if (page.images && page.images.length > 0) {
        for (const img of page.images) {
          try {
            if (!img || typeof img.src !== 'string') {
              throw new Error(`Invalid image object on page ${i + 1}`);
            }

            const match = img.src.match(/^data:(image\/(png|jpeg|jpg));base64,/i);
            if (!match) {
              throw new Error(`Unsupported image format for page ${i + 1}: ${img.src.slice(0, 40)}`);
            }

            const base64Data = img.src.split(',')[1];
            if (!base64Data) {
              throw new Error(`Missing image data for page ${i + 1}`);
            }

            const imageBuffer = Buffer.from(base64Data, 'base64');
            if (!imageBuffer.length) {
              throw new Error(`Empty image buffer for page ${i + 1}`);
            }

            const scaleX = 595.28 / 794;
            const scaleY = 841.89 / 1123;
            const x = img.x * scaleX;
            const y = img.y * scaleY;
            const width = img.width * scaleX;
            const height = img.height * scaleY;
            
            doc.save();
            
            if (img.rotation && img.rotation !== 0) {
              const centerX = x + width / 2;
              const centerY = y + height / 2;
              doc.rotate(img.rotation, { origin: [centerX, centerY] });
            }
            
            doc.image(imageBuffer, x, y, { width, height });
            doc.restore();
          } catch (err) {
            imageErrors.push(`Page ${i + 1}: ${err.message}`);
            console.error('Error adding image:', err);
          }
        }
      }
      
      if (page.texts && page.texts.length > 0) {
        for (const txt of page.texts) {
          try {
            const scaleX = 595.28 / 794;
            const scaleY = 841.89 / 1123;
            const x = txt.x * scaleX;
            const y = txt.y * scaleY;
            const fontSize = txt.fontSize * Math.min(scaleX, scaleY);
            
            doc.fillColor(txt.color || '#000000')
               .fontSize(fontSize)
               .text(txt.content, x, y, { lineBreak: false });
          } catch (err) {
            console.error('Error adding text:', err);
          }
        }
      }
    }

    if (imageErrors.length > 0) {
      console.error('Image rendering errors:', imageErrors);
      res.setHeader('X-Image-Errors', String(imageErrors.length));
      return res.status(422).json({
        error: 'One or more images could not be rendered into the PDF.',
        details: imageErrors.slice(0, 10)
      });
    }

    doc.end();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
};

