require('dotenv').config();

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const { Dropbox } = require('dropbox');
const app = express();

app.use(cors({ exposedHeaders: ['X-Dropbox-Upload'] }));
app.use(express.json({ limit: '50mb' }));

// Dropbox configuration. Prefer the refresh-token flow: the SDK mints its own
// access tokens, so nothing expires. A bare DROPBOX_ACCESS_TOKEN still works,
// but `sl.` tokens stop authenticating ~4 hours after they are generated.
let dropboxClient = null;

function initializeDropbox() {
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
}

// Initialize Dropbox on startup
initializeDropbox();

// Dropbox SDK errors carry the useful detail in `.status` and `.error`,
// not in `.message` (which is just "Response failed with a NNN code").
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

app.post('/generate-pdf', async (req, res) => {
  const { pages } = req.body;
  
  let browser;
  try {
    console.log('Generating PDF with', pages?.length || 0, 'pages');
    console.log('Request body:', JSON.stringify(req.body).substring(0, 200));
    
    // Validate input
    if (!pages || !Array.isArray(pages)) {
      console.error('Invalid pages data:', pages);
      return res.status(400).json({ error: 'Invalid pages data' });
    }
    
    // Generate HTML for all pages
    const pagesHTML = pages.map(page => {
      const { images = [], texts = [] } = page;
      return `
        <div class="page">
          ${images.map(img => `
            <div style="position: absolute; left: ${img.x}px; top: ${img.y}px; width: ${img.width}px; height: ${img.height}px; transform: rotate(${img.rotation || 0}deg); transform-origin: center center;">
              <img class="image" src="${img.src}" 
                style="width: 100%; height: 100%;" />
            </div>
          `).join('')}
          ${texts.map(txt => `
            <div class="text" style="left: ${txt.x}px; top: ${txt.y}px; font-size: ${txt.fontSize}px; color: ${txt.color};">
              ${txt.content}
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
    
    // Generate HTML from the collage data
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { margin: 0; padding: 0; }
            .page {
              position: relative;
              width: 794px;
              height: 1123px;
              background: white;
              overflow: hidden;
              page-break-after: always;
            }
            .page:last-child {
              page-break-after: auto;
            }
            .image {
              position: absolute;
              object-fit: contain;
              display: block;
            }
            .text {
              position: absolute;
              white-space: nowrap;
              font-family: Arial, sans-serif;
            }
            @page { 
              size: A4; 
              margin: 0; 
            }
          </style>
        </head>
        <body>
          ${pagesHTML}
        </body>
      </html>
    `;

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Wait for images to load with timeout
    try {
      await page.evaluate(() => {
        return Promise.all(
          Array.from(document.images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => resolve(), 5000); // 5 second timeout per image
              img.addEventListener('load', () => {
                clearTimeout(timeout);
                resolve();
              });
              img.addEventListener('error', () => {
                clearTimeout(timeout);
                console.error('Image failed to load:', img.src.substring(0, 50));
                resolve(); // Continue even if image fails
              });
            });
          })
        );
      });
      console.log('All images loaded');
    } catch (imgError) {
      console.warn('Image loading error:', imgError);
      // Continue anyway
    }
    
    // Small delay to ensure rendering
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    console.log('PDF generated successfully, size:', pdf.length, 'bytes');
    
    // Upload to Dropbox. Awaited so the reported status is accurate — this is
    // the dev server, where knowing the upload result beats shaving latency.
    const filename = `collage-${Date.now()}.pdf`;
    let uploadStatus = 'skipped';
    try {
      uploadStatus = (await uploadToDropbox(pdf, filename)) ? 'ok' : 'skipped';
    } catch (err) {
      uploadStatus = 'failed';
      console.error('❌ Dropbox upload failed:', describeDropboxError(err));
    }
    
    // Respond with the PDF. It is still returned on upload failure — the
    // header reports what happened.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', 'attachment; filename="collage.pdf"');
    res.setHeader('X-Dropbox-Upload', uploadStatus);
    res.end(pdf, 'binary');
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});