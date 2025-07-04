import { Redis } from '@upstash/redis';
import axios from 'axios';

// Initialize Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  
  console.log('[Sites API] Redis env vars:', {
    url: url ? 'Found' : 'Not found',
    token: token ? 'Found' : 'Not found'
  });

  if (!url || !token) {
    console.error('[Sites API] Missing Redis credentials');
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
  const { siteId, action } = req.query;
  
  try {
    if (!redis) {
      throw new Error('Redis connection not available');
    }

    // If siteId and action=status, return site status
    if (siteId && action === 'status') {
      return handleSiteStatus(req, res, siteId);
    }
    
    // Otherwise list all sites (original list-sites functionality)
    // Scan for site:*:client keys to find all sites
    console.log('[Sites API] Scanning for site keys');
    const keys = await redis.keys('site:*:client');
    
    const siteIds = keys.map(key => key.split(':')[1]);
    
    console.log(`[Sites API] Found ${siteIds.length} sites`);
    
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
          console.error(`[Sites API] Error fetching data for site ${siteId}:`, err);
          return { siteId, error: 'Failed to load site data' };
        }
      })
    );
    
    return res.status(200).json({ sites });
  } catch (error) {
    console.error('[Sites API] Error:', error);
    return res.status(500).json({ error: 'Failed to list sites' });
  }
}

// Site status function (previously in site-status.js)
async function handleSiteStatus(req, res, siteId) {
  try {
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const headers = { Authorization: `Bearer ${vercelToken}` };
    
    // Check if the site exists on Vercel and has a successful deployment
    const deploymentsResponse = await axios.get(
      `https://api.vercel.com/v6/deployments?app=${siteId}&target=production&limit=1`,
      { headers }
    );
    
    if (!deploymentsResponse.data || !deploymentsResponse.data.deployments || deploymentsResponse.data.deployments.length === 0) {
      return res.status(200).json({ status: 'building', message: 'Site is still being deployed' });
    }
    
    const deployment = deploymentsResponse.data.deployments[0];
    
    if (deployment.state === 'READY') {
      return res.status(200).json({ 
        status: 'ready',
        url: `https://${siteId}.vercel.app`,
        adminUrl: `https://${siteId}.vercel.app/admin`,
        deployedAt: deployment.created
      });
    } else if (deployment.state === 'ERROR') {
      return res.status(200).json({ 
        status: 'error',
        message: 'There was an error deploying the site'
      });
    } else {
      return res.status(200).json({ 
        status: 'building',
        message: 'Site is still being deployed' 
      });
    }
  } catch (error) {
    console.error('[Sites API] Error checking site status:', error.response?.data || error);
    return res.status(500).json({ 
      status: 'unknown',
      error: 'Failed to check site status' 
    });
  }
}