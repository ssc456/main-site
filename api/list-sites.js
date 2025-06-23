import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  
  console.log('[ListSites API] Redis env vars:', {
    url: url ? 'Found' : 'Not found',
    token: token ? 'Found' : 'Not found'
  });

  if (!url || !token) {
    console.error('[ListSites API] Missing Redis credentials');
    return null;
  }

  return new Redis({ url, token });
})();

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    if (!redis) {
      throw new Error('Redis connection not available');
    }
    
    // Scan for site:*:client keys to find all sites
    console.log('[ListSites API] Scanning for site keys');
    const keys = await redis.keys('site:*:client');
    const siteIds = keys.map(key => key.split(':')[1]);
    
    console.log(`[ListSites API] Found ${siteIds.length} sites`);
    
    // Get details for each site
    const sites = await Promise.all(
      siteIds.map(async (siteId) => {
        try {
          const clientData = await redis.get(`site:${siteId}:client`) || {};
          const settings = await redis.get(`site:${siteId}:settings`) || {};
          
          return {
            siteId,
            businessName: clientData.siteTitle || siteId,
            businessType: clientData.businessType || '',
            email: settings.adminEmail || '',
            createdAt: settings.createdAt || '',
            lastUpdated: clientData.lastUpdated || settings.createdAt || ''
          };
        } catch (err) {
          console.error(`[ListSites API] Error fetching data for site ${siteId}:`, err);
          return { siteId, error: 'Failed to load site data' };
        }
      })
    );
    
    return res.status(200).json({ sites });
  } catch (error) {
    console.error('[ListSites API] Error:', error);
    return res.status(500).json({ error: 'Failed to list sites' });
  }
}