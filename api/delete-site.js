import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  
  console.log('[DeleteSite API] Redis env vars:', {
    url: url ? 'Found' : 'Not found',
    token: token ? 'Found' : 'Not found'
  });

  if (!url || !token) {
    console.error('[DeleteSite API] Missing Redis credentials');
    return null;
  }

  return new Redis({ url, token });
})();

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    return res.status(200).end();
  }
  
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { siteId } = req.query;
  
  if (!siteId) {
    return res.status(400).json({ error: 'Site ID is required' });
  }
  
  try {
    if (!redis) {
      throw new Error('Redis connection not available');
    }

    if (siteId == "entry-nets" || siteId == "coastal-breeze") {
      return res.status(403).json({ error: 'Cannot delete the entry-nets or coastal-breeze site' });
    }
    
    console.log(`[DeleteSite API] Attempting to delete site: ${siteId}`);
    
    // Check if site exists
    const clientData = await redis.get(`site:${siteId}:client`);
    if (!clientData) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    // Delete all site-related keys
    const keys = [
      `site:${siteId}:client`,
      `site:${siteId}:settings`,
      `site:${siteId}:media`,
      `site:${siteId}:status`
    ];
    
    // Delete each key
    for (const key of keys) {
      await redis.del(key);
    }
    
    console.log(`[DeleteSite API] Successfully deleted site: ${siteId}`);
    
    return res.status(200).json({ 
      success: true,
      message: `Site ${siteId} successfully deleted` 
    });
  } catch (error) {
    console.error('[DeleteSite API] Error:', error);
    return res.status(500).json({ error: 'Failed to delete site' });
  }
}