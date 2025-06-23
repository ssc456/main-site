/******************************************************************************************
 * CreateSite API Route
 * ----------------------------------------------------------------------------------------
 * - Duplicates an existing Vercel “template” project (VERCEL_TEMPLATE_ID) into a **new**
 *   project whose name == `siteId`.
 * - No GitHub link: we redeploy the *latest successful build* of the template project.
 * - Copies Redis-stored page data from another tenant (“coastal-breeze”) and stores
 *   customised copies for the new tenant.
 * - Adds environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `VITE_SITE_ID`)
 *   to the new Vercel project.
 * - Responds with URLs on success.
 ******************************************************************************************/

import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'
import axios from 'axios'

/* ---------- Redis bootstrap ---------- */
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim()
  const token = process.env.KV_REST_API_TOKEN?.trim()

  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token)
  if (!url || !token) {
    console.error('[Init] Missing Redis credentials – API will still run but Redis ops will fail')
    return null
  }
  return new Redis({ url, token })
})()

/* ---------- API handler ---------- */
export default async function handler(req, res) {
  /* ----- CORS preflight ----- */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  /* ----- Basic auth check ----- */
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })
  const token = authHeader.slice(7) // not used further but parsed for completeness

  /* ----- Parse and validate body ----- */
  const { siteId, businessName, businessType = '', password } = req.body
  if (!siteId || !businessName || !password) return res.status(400).json({ error: 'Missing required fields' })
  if (!/^[a-z0-9-]+$/.test(siteId)) return res.status(400).json({ error: 'Invalid siteId format' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

  try {
    /* ---------- Redis: create tenant records ---------- */
    if (!redis) throw new Error('Redis unavailable')

    /* 1. Ensure tenant ID is unused */
    if (await redis.get(`site:${siteId}:client`)) {
      console.warn('[Redis] Tenant already exists:', siteId)
      return res.status(409).json({ error: 'Site ID already exists' })
    }

    /* 2. Copy template content from “coastal-breeze” */
    const templateData = await redis.get('site:coastal-breeze:client')
    if (!templateData) throw new Error('Template site data not found in Redis')

    /* 3. Persist new tenant data */
    const newSiteData = { ...templateData, siteTitle: businessName, businessType }
    const passwordHash = await bcrypt.hash(password, 12)

    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: passwordHash,
      createdAt: new Date().toISOString(),
      adminEmail: req.body.email ?? '',
      businessType
    })
    await redis.set(`site:${siteId}:client`, newSiteData)
    console.log('[Redis] Stored content and settings for', siteId)

    /* ---------- Vercel: duplicate template project ---------- */
    const vercelToken = process.env.VERCEL_API_TOKEN
    const templateProjectId = process.env.VERCEL_TEMPLATE_ID
    if (!vercelToken || !templateProjectId) throw new Error('Missing Vercel credentials')

    const vcHeaders = { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' }

    /* Step A: create an empty project container */
    await axios.post('https://api.vercel.com/v11/projects', { name: siteId }, { headers: vcHeaders })
    console.log('[Vercel] Created project shell:', siteId)

    /* Step B: copy env-vars (type is required by API) */
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, type: 'plain', target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID', value: siteId, type: 'plain', target: ['production', 'preview', 'development'] }
    ]
    for (const envVar of envVars) {
      await axios.post(`https://api.vercel.com/v10/projects/${siteId}/env?upsert=true`, envVar, { headers: vcHeaders })
    }
    console.log('[Vercel] Added environment variables')

    /* Step C: look up latest successful production deployment on the template project */
    const { data: list } = await axios.get(
      `https://api.vercel.com/v6/deployments?projectId=${templateProjectId}&state=READY&target=production&limit=1`,
      { headers: vcHeaders }
    )
    const templateDeploymentId = list.deployments?.[0]?.uid
    if (!templateDeploymentId) throw new Error('No READY deployment found on template project')
    console.log('[Vercel] Template deployment selected:', templateDeploymentId)

    /* Step D: redeploy that build *into* the new project */
    const deployResp = await axios.post(
      'https://api.vercel.com/v13/deployments',
      { deploymentId: templateDeploymentId, name: siteId, project: siteId, target: 'production' },
      { headers: vcHeaders }
    )
    console.log('[Vercel] Redeployment started:', deployResp.data?.id)

    /* ---------- Done ---------- */
    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`
    })
  } catch (err) {
    /* Log helpful diagnostic info */
    const detail = err.response?.data ?? err.message
    console.error('[CreateSite] Failure:', detail)
    return res.status(500).json({ error: 'Failed to create site', detail })
  }
}
