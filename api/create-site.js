/******************************************************************************************
 *  CreateSite API Route
 *  -------------------------------------------------
 *  1.  Copies tenant data from Redis template “coastal-breeze”.
 *  2.  Creates a new Vercel project, temporarily linked to the GitHub template repo
 *      (ssc456/bizbud-template-site) so the first build is imported automatically.
 *  3.  Adds the required environment variables.
 *  4.  Immediately detaches Git and disables further push-deploys.
 *  5.  Responds with the live and admin URLs.
 ******************************************************************************************/

import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

/* ───────── Redis client ───────── */
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/* ───────── HTTP handler ───────── */
export default async function handler(req, res) {
  /* CORS + verb guard */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  /* Auth + body validation */
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Authentication required' });

  const { siteId, businessName, businessType = '', password, email = '' } = req.body;
  if (!siteId || !businessName || !password)
    return res.status(400).json({ error: 'Missing required fields (siteId, businessName, password)' });
  if (!/^[a-z0-9-]+$/.test(siteId))
    return res.status(400).json({ error: 'Site ID must contain only lowercase letters, numbers, and hyphens' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });

  try {
    /* ───── 1.  Redis clone ───── */
    if (!redis) throw new Error('Redis unavailable');
    if (await redis.get(`site:${siteId}:client`))
      return res.status(409).json({ error: 'Site ID already exists' });

    console.log('[Redis] Copying template from coastal-breeze');
    const template = await redis.get('site:coastal-breeze:client');
    if (!template) return res.status(500).json({ error: 'Template tenant not found' });

    const siteData = { ...template, siteTitle: businessName, businessType };
    const pwdHash = await bcrypt.hash(password, 12);

    await redis.set(`site:${siteId}:client`, siteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: pwdHash,
      adminEmail: email,
      createdAt: new Date().toISOString(),
      businessType
    });
    console.log('[Redis] Stored tenant data for', siteId);

    /* ───── 2.  Vercel project creation (v11) ───── */
    const vercelToken = process.env.VERCEL_API_TOKEN;
    if (!vercelToken) throw new Error('Missing Vercel token');

    const vcHeaders = { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' };

    console.log('[Vercel] Creating new project...');
    const createResp = await axios.post(
      'https://api.vercel.com/v9/projects',
      {
        name: siteId,
        framework: 'vite',
        gitRepository: { type: 'github', repo: 'ssc456/bizbud-template-site' }
      },
      { headers: vcHeaders }
    );
    const projectId = createResp.data.id;
    console.log('[Vercel] Project created, id:', projectId);

    /* ───── 3.  Env vars (v10) ───── */
    console.log('[Vercel] Adding environment variables...');
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID', value: siteId, type: 'plain', target: ['production', 'preview', 'development'] }
    ];
    await axios.post(
      `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true`,
      envVars,
      { headers: vcHeaders }
    );
    console.log('[Vercel] Env-vars added');

    /* ───── 4. Create deployment hook for future use ───── */
    console.log('[Vercel] Creating deployment hook...');
    try {
      const hookResp = await axios.post(
        `https://api.vercel.com/v1/integrations/deploy-hooks`,
        {
          name: `Deploy ${siteId}`,
          project: projectId,
          ref: 'main'
        },
        { headers: vcHeaders }
      );
      
      const hookUrl = hookResp.data?.url;
      console.log('[Vercel] Deploy hook created:', hookUrl);
      
      // Trigger the hook immediately to start first deployment
      if (hookUrl) {
        await axios.post(hookUrl);
        console.log('[Vercel] Initial deployment triggered via hook');
      }
    } catch (hookError) {
      console.warn('[Vercel] Deploy hook creation failed:', hookError.response?.data || hookError);
    }

    /* ───── 5. Wait and then disconnect Git ───── */
    console.log('[Vercel] Waiting for initial deployment to finish...');
    let deployed = false;
    for (let i = 0; i < 20; i++) { // Wait up to ~2 minutes
      const deployments = await axios.get(
        `https://api.vercel.com/v6/deployments?projectId=${projectId}`,
        { headers: vcHeaders }
      );
      const ready = deployments.data.deployments.find(d => d.state === 'READY');
      if (ready) {
        deployed = true;
        break;
      }
      await new Promise(res => setTimeout(res, 6000)); // Wait 6 seconds
    }
    if (!deployed) {
      console.warn('[Vercel] Initial deployment did not finish in time.');
    } else {
      console.log('[Vercel] Initial deployment finished!');
    }

    try {
      // Try to remove the GitHub connection
      await axios.delete(`https://api.vercel.com/v6/projects/${projectId}/link`, { headers: vcHeaders });
      console.log('[Vercel] Git connection removed');
    } catch (unlinkError) {
      console.warn('[Vercel] Git unlinking failed:', unlinkError.response?.data || unlinkError);
      // If unlinking fails, at least ensure auto-deploy is disabled
      try {
        await axios.patch(
          `https://api.vercel.com/v9/projects/${projectId}`,
          { 
            autoExposeSystemEnvs: false,
            buildCommand: 'npm run build',
            outputDirectory: 'dist',
            framework: 'vite'
          },
          { headers: vcHeaders }
        );
        console.log('[Vercel] Updated project settings');
      } catch (updateError) {
        console.warn('[Vercel] Project update failed:', updateError.response?.data || updateError);
      }
    }

    /* ───── 6.  Response ───── */
    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });
  } catch (err) {
    console.error('[CreateSite] Failure:', err.response?.data || err);
    return res.status(500).json({ error: 'Failed to create site', detail: err.message });
  }
}
