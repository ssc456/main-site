import { Redis } from '@upstash/redis';

// Setup Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// List of social media bot user agents
const SOCIAL_BOTS = [
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'whatsapp',
  'telegrambot',
  'skypeuripreview',
  'vkshare',
  'redditbot',
  'applebot',
  'flipboard',
  'tumblr',
  'pinterestbot',
  'yahoo',
  'google',
  'bingbot'
];

function isSocialBot(userAgent) {
  if (!userAgent) return false;
  const lowerUA = userAgent.toLowerCase();
  return SOCIAL_BOTS.some(bot => lowerUA.includes(bot));
}

export default async function handler(req, res) {
  try {
    const { siteId, action } = req.query;
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    // Get site data from Redis
    const clientData = await redis.get(`site:${siteId}:client`);
    
    if (!clientData) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Extract meta information
    const siteTitle = clientData.siteTitle || 'EntryNets Website';
    const rawDescription = clientData.about?.description || clientData.hero?.subheadline || 'Professional business website powered by EntryNets';
    const logoUrl = clientData.logoUrl || 'https://entrynets.com/images/entrynets-logo-social.png';
    const siteUrl = `https://${siteId}.entrynets.com`;
    
    // Clean description for meta tags
    const description = rawDescription
      .replace(/<[^>]*>/g, '')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 160);

    // If this is a request for meta tags only
    if (action === 'meta') {
      return res.status(200).json({
        title: siteTitle,
        description,
        image: logoUrl,
        url: siteUrl,
        siteName: siteTitle
      });
    }

    // Check if this is a social bot request for HTML preview
    const userAgent = req.headers['user-agent'] || '';
    
    if (isSocialBot(userAgent) || action === 'preview') {
      const html = `<!DOCTYPE html>
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
  <meta property="og:image" content="${logoUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${siteTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${logoUrl}">
  
  <!-- LinkedIn -->
  <meta property="linkedin:title" content="${siteTitle}">
  <meta property="linkedin:description" content="${description}">
  <meta property="linkedin:image" content="${logoUrl}">
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      line-height: 1.6;
    }
    .logo {
      max-width: 200px;
      margin: 20px 0;
    }
    .cta {
      display: inline-block;
      background: #007bff;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${siteTitle}</h1>
  <img src="${logoUrl}" alt="${siteTitle}" class="logo">
  <p>${description}</p>
  <a href="${siteUrl}" class="cta">Visit ${siteTitle}</a>
  
  <script>
    // Redirect to actual site after a brief delay (for bots that execute JS)
    setTimeout(() => {
      if (!navigator.userAgent.match(/bot|crawler|spider|crawling/i)) {
        window.location.href = '${siteUrl}';
      }
    }, 2000);
  </script>
</body>
</html>`;

      return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Default JSON response
    return res.status(200).json({
      title: siteTitle,
      description,
      image: logoUrl,
      url: siteUrl,
      siteName: siteTitle,
      clientData
    });
    
  } catch (error) {
    console.error('Error in social handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
