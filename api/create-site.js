import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

// ---------- Redis ----------
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

// ---------- Route ----------
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ----- Auth -----
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { siteId, businessName, businessType, password } = req.body;

  if (!siteId || !businessName || !password) {
    return res.status(400).json({ error: 'Missing required fields (siteId, businessName, password)' });
  }
  if (!/^[a-z0-9-]+$/.test(siteId)) {
    return res.status(400).json({ error: 'Site ID must contain only lowercase letters, numbers, and hyphens' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    if (!redis) throw new Error('Redis connection not available');

    // ----- Duplicate content in Redis -----
    const existingSite = await redis.get(`site:${siteId}:client`);
    if (existingSite) {
      return res.status(409).json({ error: 'Site ID already exists' });
    }

    const templateData = await redis.get('site:coastal-breeze:client');
    if (!templateData) {
      return res.status(500).json({ error: 'Template site data not found' });
    }

    const newSiteData = {
      ...templateData,
      siteTitle: businessName,
      businessType: businessType || ''
    };

    const passwordHash = await bcrypt.hash(password, 12);

    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: passwordHash,
      createdAt: new Date().toISOString(),
      adminEmail: req.body.email || '',
      businessType: businessType || ''
    });
    await redis.set(`site:${siteId}:client`, newSiteData);

    // ---------- VER​CEL ----------
    const vercelTemplateProject = process.env.VERCEL_TEMPLATE_ID;      // the “source” project
    const vercelToken           = process.env.VERCEL_API_TOKEN;

    if (!vercelTemplateProject || !vercelToken) {
      throw new Error('Missing Vercel credentials');
    }

    const vcHeaders = {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json'
    };

    // 1️⃣  Create an **empty** project with the desired name
    await axios.post(
      'https://api.vercel.com/v9/projects',
      { name: siteId, framework: 'vite' },   // supply any starter framework
      { headers: vcHeaders }
    );

    // 2️⃣  Get the most recent successful deployment of the template project
    const list = await axios.get(
      `https://api.vercel.com/v6/deployments?projectId=${vercelTemplateProject}&limit=1&state=READY`,
      { headers: vcHeaders }
    );
    const templateDeploymentId = list.data.deployments?.[0]?.uid;
    if (!templateDeploymentId) {
      throw new Error('No successful deployment found on template project');
    }

    // 3️⃣  Re-deploy that build **into the new project**
    await axios.post(
      'https://api.vercel.com/v13/deployments',
      {
        deploymentId: templateDeploymentId,   // “clone” the build output
        name: siteId,
        project: siteId,
        target: 'production'
      },
      { headers: vcHeaders }
    );

    // 4️⃣  Push environment variables
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID', value: siteId, target: ['production', 'preview', 'development'] }
    ];

    for (const envVar of envVars) {
      await axios.post(
        `https://api.vercel.com/v10/projects/${siteId}/env`,
        envVar,
        { headers: vcHeaders }
      );
    }

    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });
  } catch (error) {
    console.error('[CreateSite API] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create site' });
  }
}
