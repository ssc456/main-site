import { Redis } from '@upstash/redis';
import bcrypt      from 'bcryptjs';
import axios       from 'axios';

/* -------------------------------------------------
 *  Helper – Upstash Redis (same as before)
 * -------------------------------------------------*/
const redis = (() => {
  const url   = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

/* -------------------------------------------------
 *  Main HTTP handler
 * -------------------------------------------------*/
export default async function handler(req, res) {
  /* -------- CORS / verb guard ------------------------------------------ */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  /* -------- Basic auth & payload validation ---------------------------- */
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error:'Authentication required' });

  const { siteId, businessName, businessType = '', password, email = '' } = req.body;
  if (!siteId || !businessName || !password)
    return res.status(400).json({ error:'Missing required fields (siteId, businessName, password)' });

  if (!/^[a-z0-9-]+$/.test(siteId))
    return res.status(400).json({ error:'Site ID must contain only lowercase letters, numbers, and hyphens' });

  if (password.length < 6)
    return res.status(400).json({ error:'Password must be at least 6 characters long' });

  try {
    /* --------------------------------------------------------------------
     *  1 . Copy page-data from coastal-breeze into Redis
     * ------------------------------------------------------------------*/
    if (!redis) throw new Error('Redis connection not available');

    if (await redis.get(`site:${siteId}:client`))
      return res.status(409).json({ error:'Site ID already exists' });

    console.log('[Redis] Copying template content from coastal-breeze');
    const templateData = await redis.get('site:coastal-breeze:client');
    if (!templateData) return res.status(500).json({ error:'Template site data not found in Redis' });

    const newSiteData = { ...templateData, siteTitle: businessName, businessType };
    const passwordHash = await bcrypt.hash(password, 12);

    await redis.set(`site:${siteId}:client`,    newSiteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: passwordHash,
      createdAt        : new Date().toISOString(),
      adminEmail       : email,
      businessType
    });
    console.log('[Redis] Stored content and settings for', siteId);

    /* --------------------------------------------------------------------
     *  2 . Create an *unlinked* Vercel project (API v9)
     * ------------------------------------------------------------------*/
    const vercelToken      = process.env.VERCEL_API_TOKEN;
    const templateProjectId= process.env.VERCEL_TEMPLATE_ID;
    if (!vercelToken || !templateProjectId) throw new Error('Missing Vercel credentials');

    const vcHeaders = {
      headers:{
        Authorization : `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      }
    };

    const createResp = await axios.post('https://api.vercel.com/v9/projects', {
      name         : siteId,
      framework    : 'vite',
      gitRepository: {
        repo: 'ssc456/bizbud-template-site',   // template repo – only needed *temporarily*
        type: 'github'
      }
    }, vcHeaders);
    const newProjectId = createResp.data.id;
    console.log('[Vercel] Created project shell:', siteId, '| id:', newProjectId);

    /* ---- 2b. Immediately sever the Git connection so the project is “sourceless” ---- */
    await axios.patch(`https://api.vercel.com/v9/projects/${newProjectId}`, {
      skipGitConnectDuringLink: true           // accepted by PATCH /v9/projects
    }, vcHeaders);
    console.log('[Vercel] Git link removed – project is now sourceless');

    /* --------------------------------------------------------------------
     *  3 . Add environment variables (API v9)
     * ------------------------------------------------------------------*/
    const envPayload = [
      { key:'KV_REST_API_URL',  value:process.env.KV_REST_API_URL,  type:'encrypted', target:['production','preview','development'] },
      { key:'KV_REST_API_TOKEN',value:process.env.KV_REST_API_TOKEN,type:'encrypted', target:['production','preview','development'] },
      { key:'VITE_SITE_ID',     value:siteId,                       type:'plain',     target:['production','preview','development'] }
    ];
    await axios.post(`https://api.vercel.com/v9/projects/${newProjectId}/env`, envPayload, vcHeaders);
    console.log('[Vercel] Added environment variables');

    /* --------------------------------------------------------------------
     *  4 . Grab the latest prod deployment of the *template* project
     *      (API v6 list-deployments)
     * ------------------------------------------------------------------*/
    const dplRes = await axios.get('https://api.vercel.com/v6/deployments', {
      ...vcHeaders,
      params:{
        projectId: templateProjectId,
        target   : 'production',
        limit    : 1
      }
    });
    const templateDeploymentId = dplRes.data.deployments?.[0]?.uid;
    if (!templateDeploymentId) throw new Error('No production deployment found in template project');
    console.log('[Vercel] Template deployment selected:', templateDeploymentId);

    /* --------------------------------------------------------------------
     *  5 . Redeploy that build into the new project (API v13)
     *      – supply *projectSettings* so the new project builds correctly
     * ------------------------------------------------------------------*/
    const redeployResp = await axios.post('https://api.vercel.com/v13/deployments', {
      name           : siteId,
      project        : newProjectId,
      target         : 'production',
      deploymentId   : templateDeploymentId,   // tells Vercel to “clone” that build
      projectSettings: {
        framework      : 'vite',
        installCommand : 'npm install',
        buildCommand   : 'vite build',
        outputDirectory: 'dist'
      }
    }, vcHeaders);
    console.log('[Vercel] Redeployment started:', redeployResp.data.id);

    /* --------------------------------------------------------------------
     *  6 . Done
     * ------------------------------------------------------------------*/
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
