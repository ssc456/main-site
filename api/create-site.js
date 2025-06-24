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
import { Octokit } from '@octokit/rest';

/* ───────── Redis client ───────── */
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

async function triggerBuildWithGitCommit(siteId) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = 'ssc456';  // Your GitHub username
  const repo = 'bizbud-template-site';  // Your repository name
  const branch = 'master';   // Your default branch (could be 'master' if it's an older repo)
  
  // 1. Get the latest commit on main branch to use as base
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const latestCommitSha = refData.object.sha;
  
  // 2. Get the tree for that commit
  const { data: commitData } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  });
  const treeSha = commitData.tree.sha;
  
  // 3. Create a new blob with timestamp content
  const timestamp = new Date().toISOString();
  const { data: blobData } = await octokit.git.createBlob({
    owner,
    repo,
    content: `This file triggers builds for site ID: ${siteId}\nTimestamp: ${timestamp}`,
    encoding: 'utf-8',
  });
  
  // 4. Create a new tree with the timestamp file
  const { data: newTreeData } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: treeSha,
    tree: [
      {
        path: `builds/${siteId}-timestamp.txt`,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      },
    ],
  });
  
  // 5. Create a commit with the new tree
  const { data: newCommitData } = await octokit.git.createCommit({
    owner,
    repo,
    message: `Trigger build for ${siteId} [automated]`,
    tree: newTreeData.sha,
    parents: [latestCommitSha],
  });
  
  // 6. Update the reference to point to the new commit
  await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/main',
    sha: newCommitData.sha,
  });
  
  console.log(`[GitHub] Commit created to trigger build for ${siteId}`);
  return newCommitData.sha;
}

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

    /* ───── 2.  Vercel project creation (v9) ───── */
    const vercelToken = process.env.VERCEL_API_TOKEN;
    if (!vercelToken) throw new Error('Missing Vercel token');
    
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error('Missing GitHub token');

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

    /* ───── 4. Trigger build with GitHub commit ───── */
    console.log('[GitHub] Triggering commit to start build...');
    await triggerBuildWithGitCommit(siteId);
    
    /* ───── 5. Wait for deployment to start ───── */
    console.log('[Vercel] Waiting for deployment to start...');
    let deploymentId = null;
    
    // Wait for deployment to appear (up to 30 seconds)
    for (let i = 0; i < 10; i++) {
      const deployments = await axios.get(
        `https://api.vercel.com/v6/deployments?projectId=${projectId}`,
        { headers: vcHeaders }
      );
      
      if (deployments.data.deployments.length > 0) {
        deploymentId = deployments.data.deployments[0].id;
        console.log('[Vercel] Deployment started with ID:', deploymentId);
        break;
      }
      
      await new Promise(res => setTimeout(res, 3000)); // Wait 3 seconds between checks
    }
    
    if (!deploymentId) {
      console.warn('[Vercel] No deployment detected, continuing anyway...');
    }
    
    /* ───── 6. Disconnect GitHub immediately ───── */
    // We don't need to wait for build to finish, just for it to start
    console.log('[Vercel] Disconnecting GitHub...');
    try {
      await axios.delete(
        `https://api.vercel.com/v6/projects/${projectId}/link`, 
        { headers: vcHeaders }
      );
      console.log('[Vercel] GitHub connection removed');
    } catch (unlinkError) {
      console.warn('[Vercel] GitHub unlinking failed:', unlinkError.response?.data || unlinkError);
      // Fallback to disabling auto-deployments
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
      console.log('[Vercel] Updated project settings to disable auto-deployments');
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
