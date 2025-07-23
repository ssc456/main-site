import { Redis } from '@upstash/redis';

// Setup Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { siteId } = req.query;
    
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
    const description = clientData.about?.description || clientData.hero?.subheadline || 'Professional business website powered by EntryNets';
    const logoUrl = clientData.logoUrl || '';
    const siteName = clientData.siteTitle || 'EntryNets Website';
    const siteUrl = `https://${siteId}.entrynets.com`;

    // Clean description (remove HTML tags and limit length)
    const cleanDescription = description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .trim()
      .substring(0, 160); // Limit to 160 chars for meta description

    const metaTags = {
      title: siteTitle,
      description: cleanDescription,
      image: logoUrl,
      url: siteUrl,
      siteName: siteName,
      type: 'website'
    };

    return res.status(200).json(metaTags);
  } catch (error) {
    console.error('Error generating meta tags:', error);
    return res.status(500).json({ error: 'Failed to generate meta tags' });
  }
}
