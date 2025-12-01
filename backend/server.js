const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
    
    // Set proper headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', 'attachment; filename="collage.pdf"');
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