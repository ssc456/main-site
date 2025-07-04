import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inline Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  
  console.log('[GetData API] Redis env vars:', {
    url: url ? 'Found' : 'Not found',
    token: token ? 'Found' : 'Not found'
  });

  if (!url || !token) {
    console.error('[GetData API] Missing Redis credentials');
    return null;
  }

  return new Redis({ url, token });
})();

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get site ID from query param
    const { siteId } = req.query;
    console.log('[Get Data API] Request for site:', siteId);
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }
    
    // First try Redis if available
    if (redis) {
      try {
        const clientData = await redis.get(`site:${siteId}:client`);
        
        if (clientData) {
          console.log('[Get Data API] Data found in Redis for site:', siteId);
          return res.status(200).json(clientData);
        }
      } catch (redisError) {
        console.error('[Get Data API] Redis error:', redisError);
      }
    }
    
    // Redis failed or no data found, try local fallback
    console.log('[Get Data API] Trying local fallback...');
    try {
      const fallbackPath = path.join(__dirname, '..', 'public', 'client.json');
      const localData = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      
      console.log('[Get Data API] Using local fallback data');
      return res.status(200).json(localData);
    } catch (fallbackError) {
      console.error('[Get Data API] Fallback error:', fallbackError);
      return res.status(404).json({ error: 'Site not found and fallback unavailable' });
    }
  } catch (error) {
    console.error('[Get Data API] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch client data: ' + error.message });
  }
  
  // Add CSRF validation similar to save-client-data.js

  // Extract token from cookie
  const cookies = req.cookies || {};
  const authToken = cookies.adminToken;
  const { siteId } = req.query;

  // Additional security check - token must be for the requested site
  const tokenSiteId = await redis.get(`auth:${authToken}`);
  if (!tokenSiteId || tokenSiteId !== siteId) {
    return res.status(403).json({ error: 'Not authorized to access this site' });
  }

  // Verify CSRF token for sensitive operations (you can decide if this is needed for GET)
  const csrfHeader = req.headers['x-csrf-token'];
  const storedCsrfToken = await redis.get(`csrf:${authToken}`);

  if (!csrfHeader || !storedCsrfToken || csrfHeader !== storedCsrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
}