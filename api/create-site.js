/******************************************************************************************
 *  CreateSite API  — Option A:  one-off Git import, then unlink
 ******************************************************************************************/

import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';

/* ───────────────────────────────────────────────────────── 1.  Redis bootstrap ── */
const redis = (() => {
  const url   = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  return url && token ? new Redis({ url, token }) : null;
})();

/* ───────────────────────────────────────────────────────── 2.  Handler ─────────── */
export default async function handler(req, res) {
  /* ---------- Basic validation & auth ---------- */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });

  const { siteId, businessName, password, businessType = '' } = req.body;
  if (!siteId || !businessName || !password)
    return res.status(400).json({ error: 'siteId, businessName, password are required' });
  if (!/^[a-z0-9-]+$/.test(siteId))
    return res.status(400).json({ error: 'siteId must be lowercase a-z, 0-9 and dashes' });
  if (password.length < 6) return res.status(400).json({ error: 'Password ≥ 6 chars' });

  try {
    /* ---------- 3.  Redis tenant ---------- */
    if (!redis) throw new Error('Redis unavailable');
    if (await redis.get(`site:${siteId}:client`))
      return res.status(409).json({ error: 'Site exists' });

    const template = await redis.get('site:coastal-breeze:client');
    if (!template) throw new Error('coastal-breeze template missing');

    await redis.set(`site:${siteId}:client`, {
      ...template,
      siteTitle: businessName,
      businessType
    });
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: await bcrypt.hash(password, 12),
      adminEmail: req.body.email ?? '',
      createdAt: new Date().toISOString(),
      businessType
    });
    console.log('[Redis] Tenant stored for', siteId);

    /* ---------- 4.  Vercel — import once, then unlink ---------- */
    const vcToken = process.env.VERCEL_API_TOKEN;
    if (!vcToken) throw new Error('Missing Vercel token');
    const headers = { Authorization: `Bearer ${vcToken}`, 'Content-Type': 'application/json' };

    /* 4-A  Create project and link Git repo */
    const create = await axios.post(
      'https://api.vercel.com/v11/projects',
      {
        name: siteId,
        framework: 'vite',
        gitRepository: { type: 'github', repo: 'ssc456/bizbud-template-site' }
      },
      { headers }
    );
    const projectId = create.data.id;
    console.log('[Vercel] Project created & linked:', projectId);

    /* 4-B  Env-vars */
    const envs = [
      { key: 'KV_REST_API_URL',  value: process.env.KV_REST_API_URL,  type: 'plain'     },
      { key: 'KV_REST_API_TOKEN',value: process.env.KV_REST_API_TOKEN,type: 'encrypted' },
      { key: 'VITE_SITE_ID',     value: siteId,                       type: 'plain'     }
    ];
    await Promise.all(
      envs.map(v =>
        axios.post(
          `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true`,
          { ...v, target: ['production','preview','development'] },
          { headers }
        )
      )
    );
    console.log('[Vercel] Env-vars added');

    /* 4-C  Trigger initial build (Vercel does this automatically) */

    /* 4-D  Immediately remove Git link so project stands alone */
    await axios.patch(
      `https://api.vercel.com/v10/projects/${projectId}`,
      { gitRepository: null },
      { headers }
    );
    console.log('[Vercel] Git link removed — project is now standalone');

    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    });
  } catch (err) {
    console.error('[CreateSite] Failure:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Site creation failed', detail: err.message });
  }
}
