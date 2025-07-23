import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { siteId } = req.body;
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    // Get site data from Redis
    const clientData = await redis.get(`site:${siteId}:client`);
    
    if (!clientData) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const siteTitle = clientData.siteTitle || 'EntryNets Website';
    const description = (clientData.about?.description || clientData.hero?.subheadline || 'Professional business website')
      .replace(/<[^>]*>/g, '')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 160);
    const logoUrl = clientData.logoUrl || '';
    const siteUrl = `https://${siteId}.entrynets.com`;

    // Generate static HTML for the site
    const staticHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteTitle}</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${siteUrl}">
  <meta property="og:title" content="${siteTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:site_name" content="${siteTitle}">
  ${logoUrl ? `<meta property="og:image" content="${logoUrl}">` : ''}
  ${logoUrl ? `<meta property="og:image:width" content="1200">` : ''}
  ${logoUrl ? `<meta property="og:image:height" content="630">` : ''}
  
  <!-- Twitter -->
  <meta name="twitter:card" content="${logoUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${siteTitle}">
  <meta name="twitter:description" content="${description}">
  ${logoUrl ? `<meta name="twitter:image" content="${logoUrl}">` : ''}
  
  <!-- LinkedIn -->
  <meta property="linkedin:title" content="${siteTitle}">
  <meta property="linkedin:description" content="${description}">
  ${logoUrl ? `<meta property="linkedin:image" content="${logoUrl}">` : ''}
  
  <link rel="canonical" href="${siteUrl}">
  <link rel="icon" type="image/svg+xml" href="/vite.svg">
  
  <!-- Redirect to dynamic site -->
  <script>
    // Redirect to the main site for actual functionality
    setTimeout(function() {
      window.location.href = '${siteUrl}';
    }, 100);
  </script>
</head>
<body style="font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px;">
  <header>
    ${logoUrl ? `<img src="${logoUrl}" alt="${siteTitle}" style="max-width: 200px; height: auto; margin-bottom: 20px;">` : ''}
    <h1>${siteTitle}</h1>
  </header>
  
  <main>
    <p style="font-size: 18px; line-height: 1.6; color: #333;">${description}</p>
    
    ${clientData.hero ? `
      <section style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2>${clientData.hero.headline || ''}</h2>
        <p>${clientData.hero.subheadline || ''}</p>
      </section>
    ` : ''}
    
    ${clientData.services && clientData.services.items ? `
      <section>
        <h2>${clientData.services.title || 'Our Services'}</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0;">
          ${clientData.services.items.slice(0, 6).map(service => `
            <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
              <h3>${service.title || ''}</h3>
              <p>${service.description || ''}</p>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}
    
    ${clientData.contact ? `
      <section style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2>${clientData.contact.title || 'Contact Us'}</h2>
        ${clientData.contact.email ? `<p><strong>Email:</strong> ${clientData.contact.email}</p>` : ''}
        ${clientData.contact.phone ? `<p><strong>Phone:</strong> ${clientData.contact.phone}</p>` : ''}
        ${clientData.contact.address ? `<p><strong>Address:</strong> ${clientData.contact.address}</p>` : ''}
      </section>
    ` : ''}
  </main>
  
  <footer style="text-align: center; margin-top: 40px; padding: 20px; border-top: 1px solid #eee;">
    <p><a href="${siteUrl}" style="color: #0066cc; text-decoration: none;">Visit our full website →</a></p>
    <p style="font-size: 12px; color: #666;">Powered by EntryNets</p>
  </footer>
  
  <!-- Auto-redirect for interactive users -->
  <script>
    // Only redirect if this seems to be an interactive session
    if (document.referrer && !document.referrer.includes('linkedin.com') && !document.referrer.includes('facebook.com') && !document.referrer.includes('twitter.com')) {
      window.location.href = '${siteUrl}';
    }
  </script>
</body>
</html>`;

    // Store the static HTML for this site
    await redis.set(`site:${siteId}:static-html`, staticHTML, { ex: 3600 }); // Cache for 1 hour

    return res.status(200).json({ 
      success: true, 
      message: 'Static HTML generated successfully',
      previewUrl: `/api/social-preview?siteId=${siteId}`
    });

  } catch (error) {
    console.error('Error generating static HTML:', error);
    return res.status(500).json({ error: 'Failed to generate static HTML' });
  }
}
