import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

/* ---------- 1️⃣ – Redis client ---------- */
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);

  if (!url || !token) {
    console.error('[Init] Missing Redis credentials');
    return null;
  }

  return new Redis({ url, token });
})();

/* ---------- 2️⃣ – API handler ---------- */
export default async function handler(req, res) {
  /* CORS */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* Auth */
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const bearer = authHeader.slice('Bearer '.length);
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

    /* 3 – Check that the site doesn’t already exist */
    if (await redis.get(`site:${siteId}:client`)) {
      return res.status(409).json({ error: 'Site ID already exists' });
    }

    /* 4 – Copy template data from coastal-breeze */
    console.log('[Redis] Copying template from coastal-breeze');
    const templateData = await redis.get('site:coastal-breeze:client');
    if (!templateData) {
      return res.status(500).json({ error: 'Template site data not found' });
    }

    const newSiteData = {
      ...templateData,
      siteTitle: businessName,
      businessType: businessType ?? ''
    };

    /* 5 – Persist content + settings */
    await redis.set(`site:${siteId}:client`, newSiteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: await bcrypt.hash(password, 12),
      adminEmail: req.body.email ?? '',
      createdAt: new Date().toISOString(),
      businessType: businessType ?? ''
    });
    console.log('[Redis] Stored content and settings for', siteId);

    /* ---------- 6️⃣ – Vercel work ---------- */
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const templateProjectId = process.env.VERCEL_TEMPLATE_ID; // prj_…
    if (!vercelToken || !templateProjectId) throw new Error('Missing Vercel credentials');

    /* 6.1 Create an empty shell project */
    const createProjectResponse = await axios.post(
      'https://api.vercel.com/v11/projects',
      { name: siteId },
      { headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' } }
    );
    const newProjectId: string = createProjectResponse.data.id;
    console.log('[Vercel] Created project shell:', siteId, '| id:', newProjectId);

    /* 6.2 Add environment variables */
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID', value: siteId, target: ['production', 'preview', 'development'] }
    ];
    await Promise.all(
      envVars.map(v =>
        axios.post(`https://api.vercel.com/v9/projects/${newProjectId}/env`, v, {
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' }
        })
      )
    );
    console.log('[Vercel] Added environment variables');

    /* 6.3 Find the latest production deployment of the template project */
    const deploymentsRes = await axios.get('https://api.vercel.com/v6/deployments', {
      params: { projectId: templateProjectId, target: 'production', limit: 1 },
      headers: { Authorization: `Bearer ${vercelToken}` }
    });
    const templateDeploymentId: string | undefined = deploymentsRes.data.deployments?.[0]?.uid;
    if (!templateDeploymentId) throw new Error('No deployment found on template project');
    console.log('[Vercel] Template deployment selected:', templateDeploymentId);

    /* 6.4 Re-deploy that build into the new project */
    const redeployRes = await axios.post(
      'https://api.vercel.com/v13/deployments',
      {
        deploymentId: templateDeploymentId,
        name: siteId,
        project: newProjectId,
        target: 'production',
        files: [] // empty array tells the API to use the files from `deploymentId`
      },
      { headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' } }
    );
    console.log('[Vercel] Redeployment started:', redeployRes.data.id);

    /* 6.5 Done */
    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });
  } catch (err) {
    console.error('[Error]', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to create site' });
  }
}
