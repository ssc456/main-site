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

function generateSocialHTML(metaTags, siteId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${metaTags.title}</title>
  <meta name="title" content="${metaTags.title}">
  <meta name="description" content="${metaTags.description}">
  <link rel="canonical" href="${metaTags.url}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${metaTags.type}">
  <meta property="og:url" content="${metaTags.url}">
  <meta property="og:title" content="${metaTags.title}">
  <meta property="og:description" content="${metaTags.description}">
  <meta property="og:site_name" content="${metaTags.siteName}">
  ${metaTags.image ? `<meta property="og:image" content="${metaTags.image}">` : ''}
  ${metaTags.image ? `<meta property="og:image:width" content="1200">` : ''}
  ${metaTags.image ? `<meta property="og:image:height" content="630">` : ''}
  
  <!-- Twitter -->
  <meta property="twitter:card" content="${metaTags.image ? 'summary_large_image' : 'summary'}">
  <meta property="twitter:url" content="${metaTags.url}">
  <meta property="twitter:title" content="${metaTags.title}">
  <meta property="twitter:description" content="${metaTags.description}">
  ${metaTags.image ? `<meta property="twitter:image" content="${metaTags.image}">` : ''}
  
  <!-- LinkedIn -->
  <meta property="linkedin:title" content="${metaTags.title}">
  <meta property="linkedin:description" content="${metaTags.description}">
  ${metaTags.image ? `<meta property="linkedin:image" content="${metaTags.image}">` : ''}
  
  <!-- Additional social media tags -->
  <meta property="article:author" content="${metaTags.siteName}">
  <meta property="article:published_time" content="${new Date().toISOString()}">
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/vite.svg">
  
  <!-- Redirect to actual site for human visitors -->
  <script>
    // Only redirect if this is not a bot/crawler
    if (!/bot|crawler|spider|crawling/i.test(navigator.userAgent)) {
      window.location.href = '${metaTags.url}';
    }
  </script>
</head>
<body>
  <!-- Content for social media previews -->
  <div style="max-width: 800px; margin: 50px auto; padding: 20px; font-family: Arial, sans-serif;">
    <h1>${metaTags.title}</h1>
    ${metaTags.image ? `<img src="${metaTags.image}" alt="${metaTags.title}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;">` : ''}
    <p style="font-size: 18px; line-height: 1.6; color: #333;">${metaTags.description}</p>
    
    <div style="margin-top: 30px; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
      <p><strong>Visit our website:</strong> <a href="${metaTags.url}" style="color: #0066cc;">${metaTags.url}</a></p>
      <p style="font-size: 14px; color: #666;">Powered by EntryNets</p>
    </div>
  </div>
  
  <!-- Auto-redirect after 3 seconds for human visitors -->
  <script>
    setTimeout(function() {
      if (!/bot|crawler|spider|crawling/i.test(navigator.userAgent)) {
        window.location.href = '${metaTags.url}';
      }
    }, 3000);
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    const userAgent = req.headers['user-agent'] || '';
    const { siteId } = req.query;
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    // Check if this is a social media bot
    if (isSocialBot(userAgent)) {
      console.log(`Social bot detected: ${userAgent}`);
      
      // Get site data from Redis
      const clientData = await redis.get(`site:${siteId}:client`);
      
      if (!clientData) {
        return res.status(404).send('Site not found');
      }

      // Generate meta tags
      const siteTitle = clientData.siteTitle || 'EntryNets Website';
      const description = clientData.about?.description || clientData.hero?.subheadline || 'Professional business website powered by EntryNets';
      const logoUrl = clientData.logoUrl || '';
      const siteName = clientData.siteTitle || 'EntryNets Website';
      const siteUrl = `https://${siteId}.entrynets.com`;

      // Clean description
      const cleanDescription = description
        .replace(/<[^>]*>/g, '')
        .replace(/\n/g, ' ')
        .trim()
        .substring(0, 160);

      const metaTags = {
        title: siteTitle,
        description: cleanDescription,
        image: logoUrl,
        url: siteUrl,
        siteName: siteName,
        type: 'website'
      };

      // Generate and return HTML with proper meta tags
      const html = generateSocialHTML(metaTags, siteId);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    // For regular users, redirect to the main site
    return res.redirect(301, `https://${siteId}.entrynets.com`);
    
  } catch (error) {
    console.error('Error in social preview:', error);
    return res.status(500).send('Internal Server Error');
  }
}
