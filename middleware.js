import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Social media bot user agents
const SOCIAL_BOTS = [
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'whatsapp',
  'telegrambot'
];

function isSocialBot(userAgent) {
  if (!userAgent) return false;
  const lowerUA = userAgent.toLowerCase();
  return SOCIAL_BOTS.some(bot => lowerUA.includes(bot));
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  
  // Extract site ID from URL
  const hostname = new URL(request.url).hostname;
  let siteId;
  
  if (hostname.includes('entrynets.com') && hostname !== 'entrynets.com') {
    siteId = hostname.split('.')[0];
  } else {
    siteId = searchParams.get('siteId') || 'default';
  }

  // Check if this is a social media bot
  if (isSocialBot(userAgent)) {
    try {
      // Get site data from Redis
      const clientData = await redis.get(`site:${siteId}:client`);
      
      if (!clientData) {
        return new Response('Site not found', { status: 404 });
      }

      const siteTitle = clientData.siteTitle || 'EntryNets Website';
      const description = (clientData.about?.description || clientData.hero?.subheadline || 'Professional business website')
        .replace(/<[^>]*>/g, '')
        .replace(/\n/g, ' ')
        .trim()
        .substring(0, 160);
      
      // Use client logo if available, otherwise fall back to EntryNets default
      const logoUrl = clientData.logoUrl || 'https://entrynets.com/images/entrynets-logo-social.png';
      const siteUrl = `https://${siteId}.entrynets.com`;

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
</head>
<body>
  <h1>${siteTitle}</h1>
  <img src="${logoUrl}" alt="${siteTitle}" style="max-width: 300px;">
  <p>${description}</p>
  <a href="${siteUrl}">Visit ${siteTitle}</a>
</body>
</html>`;

      return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
      });
    } catch (error) {
      console.error('Error generating social preview:', error);
      return new Response('Error', { status: 500 });
    }
  }

  // For regular users, continue to the normal site
  return fetch(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
