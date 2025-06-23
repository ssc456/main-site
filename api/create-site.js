import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

// Initialize Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  
  console.log('[CreateSite API] Redis env vars:', {
    url: url ? 'Found' : 'Not found',
    token: token ? 'Found' : 'Not found'
  });

  if (!url || !token) {
    console.error('[CreateSite API] Missing Redis credentials');
    return null;
  }

  return new Redis({ url, token });
})();

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { siteId, businessName, businessType, password } = req.body;
  
  if (!siteId || !businessName || !password) {
    return res.status(400).json({ error: 'Missing required fields (siteId, businessName, password)' });
  }
  
  // Validate siteId format (lowercase, no spaces, only letters, numbers, and hyphens)
  if (!/^[a-z0-9-]+$/.test(siteId)) {
    return res.status(400).json({ error: 'Site ID must contain only lowercase letters, numbers, and hyphens' });
  }
  
  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    if (!redis) {
      throw new Error('Redis connection not available');
    }
    
    // Check if site already exists
    const existingSite = await redis.get(`site:${siteId}:client`);
    if (existingSite) {
      return res.status(409).json({ error: 'Site ID already exists' });
    }
    
    // 1. Copy template from coastal-breeze
    console.log(`[CreateSite API] Copying template from coastal-breeze for new site: ${siteId}`);
    const templateData = await redis.get('site:coastal-breeze:client');
    
    if (!templateData) {
      return res.status(500).json({ error: 'Template site data not found' });
    }
    
    // 2. Create new site data with updated information
    const newSiteData = {
      ...templateData,
      siteTitle: businessName,
      businessType: businessType || ''
    };
    
    // 3. Create password hash
    const passwordHash = await bcrypt.hash(password, 12);
    
    // 4. Store site settings in Redis
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: passwordHash,
      createdAt: new Date().toISOString(),
      adminEmail: req.body.email || '',
      businessType: businessType || ''
    });
    
    // 5. Store site content in Redis
    await redis.set(`site:${siteId}:client`, newSiteData);
    
    // 6. Create project on Vercel without GitHub integration
    try {
      const vercelTemplateId = process.env.VERCEL_TEMPLATE_ID;
      const vercelToken = process.env.VERCEL_API_TOKEN;
      
      if (!vercelTemplateId || !vercelToken) {
        throw new Error('Missing Vercel credentials');
      }
      
      console.log(`[CreateSite API] Using template ID: ${vercelTemplateId}`);
      
      // Create project by cloning Vercel template directly
      try {
        // Create project using "clone" API
        const vercelResponse = await axios({
          method: 'post',
          url: 'https://api.vercel.com/v6/projects',
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json'
          },
          data: {
            name: siteId,
            environmentVariables: [
              { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, target: ['production', 'preview', 'development'] },
              { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, target: ['production', 'preview', 'development'] },
              { key: 'VITE_SITE_ID', value: siteId, target: ['production', 'preview', 'development'] }
            ],
            template: vercelTemplateId
          }
        });
        
        console.log(`[CreateSite API] Created Vercel project: ${siteId}`);
        console.log(`[CreateSite API] Project creation response:`, vercelResponse.data);
        
        // Trigger a deployment for the new project
        await axios({
          method: 'post',
          url: `https://api.vercel.com/v13/deployments`,
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json'
          },
          data: {
            name: siteId,
            project: siteId,
            target: 'production'
          }
        });
        
        console.log(`[CreateSite API] Triggered deployment for: ${siteId}`);
        
        return res.status(201).json({
          success: true,
          siteId,
          url: `https://${siteId}.vercel.app`,
          adminUrl: `https://${siteId}.vercel.app/admin`
        });
      } catch (vercelError) {
        console.error('[CreateSite API] Vercel API error:', vercelError.response?.data || vercelError.message);
        throw vercelError;
      }
    } catch (vercelError) {
      console.error('[CreateSite API] Vercel error:', vercelError.response?.data || vercelError.message);
      
      // Site was created in Redis but failed on Vercel
      return res.status(201).json({
        success: true,
        siteId,
        vercelError: true,
        message: 'Site created in database but Vercel deployment failed. You can still access your site content and manually deploy later.'
      });
    }
  } catch (error) {
    console.error('[CreateSite API] Error:', error);
    return res.status(500).json({ error: 'Failed to create site' });
  }
}