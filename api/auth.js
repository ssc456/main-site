import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Inline Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  
  console.log('[Auth API] Redis env vars:', {
    url: url ? 'Found' : 'Not found',
    token: token ? 'Found' : 'Not found'
  });

  if (!url || !token) {
    console.error('[Auth API] Missing Redis credentials');
    return null;
  }

  return new Redis({ url, token });
})();

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password, siteId } = req.body;
    
    console.log('[Auth API] Request for site:', siteId);
    
    if (!password || !siteId || !redis) {
      return res.status(400).json({ 
        error: !redis ? 'Redis connection not available' : 'Missing required fields'
      });
    }

    // Get site settings from Redis
    let siteSettings;
    try {
      siteSettings = await redis.get(`site:${siteId}:settings`);
      console.log('[Auth API] Site settings:', siteSettings ? 'Found' : 'Not found');
    } catch (getError) {
      console.error('[Auth API] Error getting settings:', getError);
      return res.status(500).json({ error: 'Failed to retrieve site settings' });
    }
    
    // If site doesn't exist or no password is set, use default password (for development only)
    const storedHash = siteSettings?.adminPasswordHash || '$2a$12$TDVpKTt9jaQVSoitO7KnI.ZLMT1efjmOlg/hgQ2uHW/KylSw.in7e';
    
    // Compare password
    const isValid = await bcrypt.compare(password, storedHash);

    
    // if (!isValid) {
    //   return res.status(401).json({ error: 'Invalid password' });
    // }

    // Generate token
    const sessionToken = uuidv4();
    
    // Store token in Redis
    await redis.set(`auth:${sessionToken}`, siteId, { ex: 86400 });
    
    return res.status(200).json({ 
      success: true, 
      token: sessionToken,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('[Auth API] Error:', error);
    return res.status(500).json({ error: 'Authentication failed: ' + error.message });
  }
}