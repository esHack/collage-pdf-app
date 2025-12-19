const PDFDocument = require('pdfkit');
const { Dropbox } = require('dropbox');

// Initialize Dropbox client
let dropboxClient = null;
if (process.env.DROPBOX_ACCESS_TOKEN) {
  dropboxClient = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
}

async function uploadToDropbox(pdfBuffer, filename) {
  if (!dropboxClient) {
    console.log('⚠️ Dropbox not configured, skipping upload');
    return;
  }

  try {
    const path = `/collagepdf/${filename}`;
    
    const response = await dropboxClient.filesUpload({
      path: path,
      contents: pdfBuffer
    });
    
    console.log('✅ Uploaded to Dropbox:', response.result.name);
    console.log('📎 Path:', response.result.path_display);
    
    return response.result;
  } catch (error) {
    console.error('❌ Dropbox upload failed:', error.message);
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

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
    
    // Validate input
    if (!pages || !Array.isArray(pages)) {
      console.error('Invalid pages data:', pages);
      return res.status(400).json({ error: 'Invalid pages data' });
    }
    
    // Create PDF document (A4 size: 595.28 x 841.89 points)
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 0,
      autoFirstPage: false
    });
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      
      // Upload to Dropbox (async, don't wait for it)
      const filename = `collage-${Date.now()}.pdf`;
      uploadToDropbox(pdfBuffer, filename).catch(err => {
        console.error('Dropbox upload error:', err);
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Content-Disposition', 'attachment; filename="collage.pdf"');
      res.end(pdfBuffer);
    });

    // Process each page
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      doc.addPage();
      
      // Add images
      if (page.images && page.images.length > 0) {
        for (const img of page.images) {
          try {
            // Convert data URL to buffer
            const base64Data = img.src.split(',')[1];
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            // Calculate position and size (PDF points: 794px -> 595.28pt, 1123px -> 841.89pt)
            const scaleX = 595.28 / 794;
            const scaleY = 841.89 / 1123;
            const x = img.x * scaleX;
            const y = img.y * scaleY;
            const width = img.width * scaleX;
            const height = img.height * scaleY;
            
            // Save current state
            doc.save();
            
            // Apply rotation if needed
            if (img.rotation && img.rotation !== 0) {
              const centerX = x + width / 2;
              const centerY = y + height / 2;
              doc.rotate(img.rotation, { origin: [centerX, centerY] });
            }
            
            // Add image
            doc.image(imageBuffer, x, y, { width, height });
            
            // Restore state
            doc.restore();
          } catch (err) {
            console.error('Error adding image:', err);
          }
        }
      }
      
      // Add texts
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

    doc.end();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
};
