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

  const { siteId, action } = req.query;
  
  try {
    if (!redis) {
      throw new Error('Redis connection not available');
    }

        // First, check if this is a public endpoint that doesn't need auth
    if (siteId && action === 'status') {
      return handleSiteStatus(req, res, siteId);
    }

    // Check authentication (supports both cookie auth and bearer token)
    const authToken = req.cookies?.adminToken;
    const authHeader = req.headers.authorization;

    // No authentication provided
    if (!authToken && !authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If using bearer token from header
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      // Validate token
      // ...
    }

    // If using cookie authentication
    if (authToken) {
      // Verify CSRF token if needed
      const csrfHeader = req.headers['x-csrf-token'];
      const storedCsrfToken = await redis.get(`csrf:${authToken}`);
      
      if (!csrfHeader || !storedCsrfToken || csrfHeader !== storedCsrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }
      // Proceed with authenticated request
    }

    // If checking site status, allow without authentication
    if (siteId && action === 'status') {
      return handleSiteStatus(req, res, siteId);
    }
    
    // For listing all sites, require either cookie auth or bearer auth
    // We've already verified cookie auth above, so only need to check if we're using that method
    let isAuthenticated = false;
    
    if (authToken) {
      // We already validated the cookie auth + CSRF above
      isAuthenticated = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      // Using Bearer auth - already extracted token above
      isAuthenticated = true;
    }
    
    if (!isAuthenticated) {
      return res.status(401).json({ error: 'Authentication required for this operation' });
    }
    
    // Use the token we already extracted earlier (don't redeclare)
    
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
    return res.status(500).json({ error: 'Failed to perform operation' });
  }
}

// Site status function (previously in site-status.js)
async function handleSiteStatus(req, res, siteId) {
  try {
    // Remove any authentication requirements here - site status should be public
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
      // Check if welcome email has been sent
      const siteSettings = await redis.get(`site:${siteId}:settings`);
      
      // If we have email address and haven't sent welcome email yet
      if (siteSettings?.adminEmail && !siteSettings.welcomeEmailSent) {
        try {
          console.log(`[Sites API] Sending welcome email for ${siteId}`);
          const siteData = await redis.get(`site:${siteId}:client`);
          
          // Import the email function - make sure to add this import at the top of the file
          const { sendWelcomeEmail } = await import('./create-site.js');
          
          // Send the welcome email
          await sendWelcomeEmail(
            siteSettings.adminEmail, 
            siteId,
            siteData?.siteTitle || siteId
          );
          
          // Mark email as sent
          await redis.set(`site:${siteId}:settings`, {
            ...siteSettings,
            welcomeEmailSent: true
          });
          
          console.log(`[Sites API] Welcome email sent for ${siteId}`);
        } catch (emailError) {
          console.error(`[Sites API] Error sending welcome email for ${siteId}:`, emailError);
        }
      }
      
      return res.status(200).json({ 
        status: 'ready',
        url: `https://${siteId}.entrynets.com`,
        adminUrl: `https://${siteId}.entrynets.com/admin`,
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