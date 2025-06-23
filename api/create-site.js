/******************************************************************************************
 *  CreateSite API Route
 *  -------------------------------------------------
 *  1.  Copies tenant data from Redis template “coastal-breeze”.
 *  2.  Creates a new Vercel project, *temporarily* linked to the GitHub template repo.
 *  3.  Adds environment variables.
 *  4.  Immediately detaches Git and disables push-deploys.
 *  5.  Returns the live URL.
 ******************************************************************************************/

import { Redis } from '@upstash/redis';
import bcrypt      from 'bcryptjs';
import axios       from 'axios';

/* ───────── 1.  Redis client ───────── */
const redis = (() => {
  const url   = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/* ───────── 2.  API handler ───────── */
export default async function handler(req, res) {
  /* CORS pre-flight */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  /* Basic auth & body validation */
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error:'Authentication required' });

  const { siteId, businessName, businessType = '', password, email = '' } = req.body;
  if (!siteId || !businessName || !password)
    return res.status(400).json({ error:'Missing required fields (siteId, businessName, password)' });
  if (!/^[a-z0-9-]+$/.test(siteId))
    return res.status(400).json({ error:'Site ID must contain only lowercase letters, numbers, and hyphens' });
  if (password.length < 6)
    return res.status(400).json({ error:'Password must be at least 6 characters long' });

  try {
    /* ───── 3.  Redis: clone tenant data ───── */
    if (!redis) throw new Error('Redis unavailable');
    if (await redis.get(`site:${siteId}:client`))
      return res.status(409).json({ error:'Site ID already exists' });

    console.log('[Redis] Copying template from coastal-breeze');
    const template = await redis.get('site:coastal-breeze:client');
    if (!template) return res.status(500).json({ error:'Template tenant not found' });

    const siteData = { ...template, siteTitle: businessName, businessType };
    const pwdHash = await bcrypt.hash(password, 12);

    await redis.set(`site:${siteId}:client`,   siteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: pwdHash,
      adminEmail       : email,
      createdAt        : new Date().toISOString(),
      businessType
    });
    console.log('[Redis] Stored tenant data for', siteId);

    /* ───── 4.  Vercel: create project & first build ───── */
    const vercelToken = process.env.VERCEL_API_TOKEN;
    if (!vercelToken) throw new Error('Missing Vercel token');

    const headers = { Authorization:`Bearer ${vercelToken}`, 'Content-Type':'application/json' };

    /* 4-A  Create project with one-off Git import (API v9) */
    const create = await axios.post(
      'https://api.vercel.com/v9/projects',
      {
        name        : siteId,
        framework   : 'vite',
        gitRepository: { type:'github', repo:'ssc456/bizbud-template-site' } // template repo
      },
      { headers }
    );
    const projectId = create.data.id;                    // prj_…
    console.log('[Vercel] Project created, id:', projectId);

    /* 4-B  Add env-vars (API v9) */
    const envs = [
      { key:'KV_REST_API_URL',  value:process.env.KV_REST_API_URL,  type:'encrypted', target:['production','preview','development'] },
      { key:'KV_REST_API_TOKEN',value:process.env.KV_REST_API_TOKEN,type:'encrypted', target:['production','preview','development'] },
      { key:'VITE_SITE_ID',     value:siteId,                       type:'plain',     target:['production','preview','development'] }
    ];
    await axios.post(`https://api.vercel.com/v9/projects/${projectId}/env`, envs, { headers });
    console.log('[Vercel] Env-vars added');

    /* 4-C  Detach Git & disable push-deploys (API v9 PATCH) */
    await axios.patch(
      `https://api.vercel.com/v9/projects/${projectId}`,
      {
        gitRepository      : null,                              // breaks the repo link
        gitProviderOptions : { createDeployments:'disabled' }   // blocks future push builds
      },
      { headers }
    );
    console.log('[Vercel] Git disconnected & auto-deploys disabled');

    /* 🚀   The initial import build is already queued by Vercel   */

    /* ───── 5.  Response ───── */
    return res.status(201).json({
      success : true,
      siteId,
      url     : `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });

  } catch (err) {
    console.error('[CreateSite] Failure:', err.response?.data || err);
    return res.status(500).json({ error:'Failed to create site', detail: err.message });
  }
}
