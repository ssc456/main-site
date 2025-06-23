import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'
import axios from 'axios'

const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim()
  const token = process.env.KV_REST_API_TOKEN?.trim()
  console.log('[CreateSite API] Redis env vars:', { url: url ? 'Found' : 'Not found', token: token ? 'Found' : 'Not found' })
  if (!url || !token) {
    console.error('[CreateSite API] Missing Redis credentials')
    return null
  }
  return new Redis({ url, token })
})()

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { siteId, businessName, businessType, password } = req.body
  if (!siteId || !businessName || !password) {
    return res.status(400).json({ error: 'Missing required fields (siteId, businessName, password)' })
  }
  if (!/^[a-z0-9-]+$/.test(siteId)) {
    return res.status(400).json({ error: 'Site ID must contain only lowercase letters, numbers, and hyphens' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' })
  }

  try {
    if (!redis) throw new Error('Redis connection not available')
    const existingSite = await redis.get(`site:${siteId}:client`)
    if (existingSite) return res.status(409).json({ error: 'Site ID already exists' })

    const templateData = await redis.get('site:coastal-breeze:client')
    if (!templateData) return res.status(500).json({ error: 'Template site data not found' })

    const newSiteData = { ...templateData, siteTitle: businessName, businessType: businessType || '' }
    const passwordHash = await bcrypt.hash(password, 12)

    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: passwordHash,
      createdAt: new Date().toISOString(),
      adminEmail: req.body.email || '',
      businessType: businessType || ''
    })
    await redis.set(`site:${siteId}:client`, newSiteData)

    const vercelTemplateProject = process.env.VERCEL_TEMPLATE_ID
    const vercelToken = process.env.VERCEL_API_TOKEN
    if (!vercelTemplateProject || !vercelToken) throw new Error('Missing Vercel credentials')

    const vcHeaders = { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' }

    await axios.post('https://api.vercel.com/v11/projects', { name: siteId, framework: 'vite' }, { headers: vcHeaders })

    const listResp = await axios.get(
      `https://api.vercel.com/v6/deployments?projectId=${vercelTemplateProject}&state=READY&limit=1&target=production`,
      { headers: vcHeaders }
    )
    const templateDeploymentId = listResp.data.deployments?.[0]?.uid
    if (!templateDeploymentId) throw new Error('No successful deployment found on template project')

    await axios.post(
      'https://api.vercel.com/v13/deployments',
      { deploymentId: templateDeploymentId, name: siteId, project: siteId, target: 'production' },
      { headers: vcHeaders }
    )

    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, type: 'plain', target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID', value: siteId, type: 'plain', target: ['production', 'preview', 'development'] }
    ]
    for (const envVar of envVars) {
      await axios.post(`https://api.vercel.com/v10/projects/${siteId}/env?upsert=true`, envVar, { headers: vcHeaders })
    }

    return res.status(201).json({ success: true, siteId, url: `https://${siteId}.vercel.app`, adminUrl: `https://${siteId}.vercel.app/admin` })
  } catch (error) {
    console.error('[CreateSite API] Error:', error.response?.data || error.message)
    return res.status(500).json({ error: 'Failed to create site' })
  }
}
