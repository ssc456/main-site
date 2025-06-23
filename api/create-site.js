/******************************************************************************************
 *  CreateSite API Route
 *  ---------------------------------------------------------------------------------------
 *  • Makes a new tenant in Redis (content cloned from “coastal-breeze”)
 *  • Spins up a brand-new Vercel project named `siteId`  **without Git**
 *  • Copies three env-vars to the project
 *  • Redeploys the latest production build from VERCEL_TEMPLATE_ID
 *  • All major steps are logged for easy debugging
 ******************************************************************************************/

import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

/* ---- 1.  Redis bootstrap ------------------------------------------------------------- */
const redis = (() => {
  const url   = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  console.log('[Init] Redis URL:', !!url, '| token:', !!token);
  if (!url || !token) {
    console.error('[Init] Missing Redis credentials');
    return null;
  }
  return new Redis({ url, token });
})();

/* ---- 2.  API handler ----------------------------------------------------------------- */
export default async function handler(req, res) {
  /* CORS pre-flight */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  /* Basic Bearer-token auth */
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });

  /* Body validation */
  const { siteId, businessName, businessType = '', password } = req.body;
  if (!siteId || !businessName || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (!/^[a-z0-9-]+$/.test(siteId))       return res.status(400).json({ error: 'Invalid siteId format' });
  if (password.length < 6)               return res.status(400).json({ error: 'Password ≥ 6 chars' });

  try {
    /* ---------- 3.  Redis set-up ------------------------------------------------------ */
    if (!redis) throw new Error('Redis unavailable');
    if (await redis.get(`site:${siteId}:client`)) return res.status(409).json({ error: 'Site ID already exists' });

    const templateData = await redis.get('site:coastal-breeze:client');
    if (!templateData) throw new Error('coastal-breeze template not found');

    await redis.set(`site:${siteId}:client`, { ...templateData, siteTitle: businessName, businessType });
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: await bcrypt.hash(password, 12),
      adminEmail: req.body.email ?? '',
      createdAt: new Date().toISOString(),
      businessType
    });
    console.log('[Redis] Stored tenant data for', siteId);

    /* ---------- 4.  Vercel duplication flow ----------------------------------------- */
    const vcToken = process.env.VERCEL_API_TOKEN;
    const templateProjectId = process.env.VERCEL_TEMPLATE_ID;
    if (!vcToken || !templateProjectId) throw new Error('Missing Vercel credentials');

    const vcHeaders = { Authorization: `Bearer ${vcToken}`, 'Content-Type': 'application/json' };

    /* 4.1  Create empty project shell */
    const projectResp = await axios.post(
      'https://api.vercel.com/v11/projects',
      { name: siteId },
      { headers: vcHeaders }
    );
    const newProjectId = projectResp.data.id;   // prj_XXXX
    console.log('[Vercel] Created project shell:', newProjectId);

    /* 4.2  Copy env-vars */
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, type: 'plain',     target: ['production','preview','development'] },
      { key: 'KV_REST_API_TOKEN',value: process.env.KV_REST_API_TOKEN,type: 'encrypted',target: ['production','preview','development'] },
      { key: 'VITE_SITE_ID',     value: siteId,                     type: 'plain',     target: ['production','preview','development'] }
    ];
    await Promise.all(
      envVars.map(v => axios.post(`https://api.vercel.com/v10/projects/${newProjectId}/env?upsert=true`, v, { headers: vcHeaders }))
    );
    console.log('[Vercel] Added environment variables');

    /* 4.3  Grab latest production deployment from template project */
    const listResp = await axios.get(
      'https://api.vercel.com/v6/deployments',
      { params: { projectId: templateProjectId, target: 'production', state: 'READY', limit: 1 },
        headers: vcHeaders }
    );
    const templateDeploymentId = listResp.data.deployments?.[0]?.uid;
    if (!templateDeploymentId) throw new Error('No READY deployment on template');
    console.log('[Vercel] Template deployment:', templateDeploymentId);

    /* 4.4  Re-deploy that build into the new project — WITH projectSettings */
    const redeploy = await axios.post(
      'https://api.vercel.com/v13/deployments',
      {
        deploymentId: templateDeploymentId,
        name: siteId,
        project: newProjectId,
        target: 'production',
        files: [],
        projectSettings: {          // minimal block to satisfy first-deploy rule
          framework: 'vite',        // or null => “Other”
          buildCommand: null,
          devCommand: null,
          installCommand: null,
          outputDirectory: null,
          commandForIgnoringBuildStep: ''
        }
      },
      { headers: vcHeaders }
    );
    console.log('[Vercel] Redeployment started:', redeploy.data.id);

    /* ---------- 5.  Success response ------------------------------------------------ */
    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });

  } catch (err) {
    console.error('[CreateSite] Failure:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to create site', detail: err.response?.data || err.message });
  }
}
