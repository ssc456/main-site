/******************************************************************************************
 * CreateSite API Route  (JavaScript version)
 * --------------------------------------------------
 * – Duplicates the *latest production deployment* from a Vercel template project
 *   (ID held in VERCEL_TEMPLATE_ID) into a brand-new project named `siteId`.
 * – New project is not linked to GitHub; it simply re-deploys the compiled build output.
 * – Copies Redis content from tenant “coastal-breeze” and saves customised versions.
 * – Adds three environment variables to the new project.
 * – Extra `console.log` statements make each step visible in logs.
 ******************************************************************************************/

import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

/* ---------- 1. Redis client ---------- */
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  if (!url || !token) {
    console.error('[Init] Missing Redis credentials');
    return null;                    // early-exit path for Redis failures
  }
  return new Redis({ url, token });
})();

/* ---------- 2. API handler ---------- */
export default async function handler(req, res) {
  /* ----- CORS pre-flight ----- */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ----- Bearer-token auth ----- */
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  /* ----- Parse body ----- */
  const { siteId, businessName, businessType = '', password } = req.body;
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
    /* ---------- 3. Redis tenant provisioning ---------- */
    if (!redis) throw new Error('Redis connection not available');

    if (await redis.get(`site:${siteId}:client`)) {
      return res.status(409).json({ error: 'Site ID already exists' });
    }

    const templateData = await redis.get('site:coastal-breeze:client');
    if (!templateData) throw new Error('Template site data not found in Redis');

    const newSiteData = { ...templateData, siteTitle: businessName, businessType };
    const passwordHash = await bcrypt.hash(password, 12);

    await redis.set(`site:${siteId}:client`, newSiteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: passwordHash,
      adminEmail: req.body.email ?? '',
      createdAt: new Date().toISOString(),
      businessType
    });
    console.log('[Redis] Stored content and settings for', siteId);

    /* ---------- 4. Vercel duplication flow ---------- */
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const templateProjectId = process.env.VERCEL_TEMPLATE_ID;   // ID of your template project

    if (!vercelToken || !templateProjectId) throw new Error('Missing Vercel credentials');
    const vcHeaders = { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' };

    /* 4.1  Create an empty project shell */
    const projectResp = await axios.post(
      'https://api.vercel.com/v11/projects',
      { name: siteId },
      { headers: vcHeaders }
    );
    const newProjectId = projectResp.data.id;
    console.log('[Vercel] Created project shell:', siteId, '| id:', newProjectId);

    /* 4.2  Add environment variables */
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, type: 'plain', target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID',        value: siteId,                type: 'plain', target: ['production', 'preview', 'development'] }
    ];
    await Promise.all(
      envVars.map(v =>
        axios.post(`https://api.vercel.com/v10/projects/${newProjectId}/env?upsert=true`, v, { headers: vcHeaders })
      )
    );
    console.log('[Vercel] Added environment variables');

    /* 4.3  Get the latest production deployment from the template project */
    const listResp = await axios.get(
      'https://api.vercel.com/v6/deployments',
      { params: { projectId: templateProjectId, target: 'production', state: 'READY', limit: 1 }, headers: vcHeaders }
    );
    const templateDeploymentId = listResp.data.deployments?.[0]?.uid;
    if (!templateDeploymentId) throw new Error('No READY deployment found on template project');
    console.log('[Vercel] Template deployment selected:', templateDeploymentId);

    /* 4.4  Re-deploy that build *into* the new project */
    const deployResp = await axios.post(
      'https://api.vercel.com/v13/deployments',
      { deploymentId: templateDeploymentId, name: siteId, project: newProjectId, target: 'production', files: [] },
      { headers: vcHeaders }
    );
    console.log('[Vercel] Redeployment started:', deployResp.data.id);

    /* ---------- 5. Success response ---------- */
    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });
  } catch (err) {
    /* log both Axios and generic errors */
    console.error('[CreateSite] Failure:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to create site', detail: err.response?.data || err.message });
  }
}
