/******************************************************************************************
 *  CreateSite API Route with AI Content Generation
 *  -------------------------------------------------
 *  1.  Generates custom site content using OpenAI based on business info
 *  2.  Stores the generated content in Redis
 *  3.  Creates a new Vercel project linked to GitHub template repo
 *  4.  Adds the required environment variables
 *  5.  Triggers build with a GitHub commit
 *  6.  Disconnects GitHub after build starts
 *  7.  Returns the site URLs
 ******************************************************************************************/

import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import { Octokit } from '@octokit/rest';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

/* ───────── Client initialization ───────── */
// Redis client
const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  console.log('[Init] Redis URL present:', !!url, '| Redis token present:', !!token);
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ───────── Schema definitions for content validation ───────── */
// Service and feature items
const serviceDetailItem = z.string();
const serviceItem = z.object({
  title: z.string(),
  description: z.string(),
  iconName: z.string(),
  details: z.array(serviceDetailItem)
});

const featureItem = z.object({
  iconName: z.string(),
  title: z.string(),
  description: z.string()
});

const galleryImage = z.object({
  src: z.string(),
  alt: z.string(),
  title: z.string(),
  description: z.string(),
  imagePrompt: z.string()
});

const testimonialQuote = z.object({
  name: z.string(),
  quote: z.string(),
  image: z.string()
});

const faqItem = z.object({
  question: z.string(),
  answer: z.string()
});

// Complete client site schema
const ClientSiteSchema = z.object({
  siteTitle: z.string(),
  logoUrl: z.string(),
  logoPrompt: z.string(),
  hero: z.object({
    headline: z.string(),
    subheadline: z.string(),
    ctaText: z.string(),
    ctaLink: z.string()
  }),
  about: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string(),
    imagePrompt: z.string()
  }),
  services: z.object({
    title: z.string(),
    description: z.string(),
    layoutStyle: z.enum(['interactive', 'cards', 'simple']),
    items: z.array(serviceItem)
  }),
  features: z.object({
    title: z.string(),
    items: z.array(featureItem)
  }),
  gallery: z.object({
    title: z.string(),
    subtitle: z.string(),
    layout: z.enum(['masonry', 'grid', 'carousel']),
    maxImages: z.number(),
    viewAllLink: z.string(),
    images: z.array(galleryImage)
  }),
  testimonials: z.object({
    title: z.string(),
    quotes: z.array(testimonialQuote)
  }),
  faq: z.object({
    title: z.string(),
    items: z.array(faqItem)
  }),
  social: z.object({
    facebook: z.string(),
    instagram: z.string(),
    twitter: z.string(),
    linkedin: z.string(),
    youtube: z.string(),
    tiktok: z.string()
  }),
  contact: z.object({
    title: z.string(),
    description: z.string(),
    email: z.string().email(),
    phone: z.string(),
    address: z.string()
  }),
  config: z.object({
    primaryColor: z.enum(['blue', 'green', 'purple', 'pink', 'red', 'yellow']),
    showHero: z.boolean(),
    showAbout: z.boolean(),
    showServices: z.boolean(),
    showFeatures: z.boolean(),
    showTestimonials: z.boolean(),
    showGallery: z.boolean(),
    showContact: z.boolean(),
    showFAQ: z.boolean()
  })
});

/* ───────── Content generation function ───────── */
/**
 * Generates site content using OpenAI based on business information
 * @param {string} businessName - The name of the business
 * @param {string} businessType - The type/industry of the business
 * @return {Promise<Object>} - The generated site content
 */
async function generateSiteContent(businessName, businessType = '') {
  console.log(`[AI] Generating content for "${businessName}" (${businessType || 'unspecified type'})`);
  
  // Check if OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[AI] OpenAI API key not found, using default template instead');
    return null;
  }
  
  try {
    // Create system prompt for content generation
    const systemPrompt = `
    You are a professional website content creator specializing in small business websites.
    Create a complete client.json file for a business website using the information provided below.
    
    Business information:
    - Business name: ${businessName}
    - Business type/industry: ${businessType || 'Not specified, use your best judgment based on the name'}
    
    Use these guidelines:
    1. Use appropriate Lucide icon names for services and features (e.g., ShieldCheck, Clock, Heart, Star, Zap)
    2. Create realistic, engaging content for the business with substantial text content
    3. Generate image prompts that would create high-quality images relevant to this business
    4. Primary color should match the business type or brand feel
    5. For social media platforms that don't apply to this business, use empty strings
    6. For testimonials, create realistic but fictional customer quotes
    `;
    
    // Call OpenAI with schema validation
    const response = await openai.responses.parse({
      model: "gpt-4o", // Using the latest model
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate a complete, professional site configuration based on the provided business information." }
      ],
      text: {
        format: zodTextFormat(ClientSiteSchema, "clientData")
      }
    });
    
    // Extract validated content
    const generatedContent = response.output_parsed;
    console.log('[AI] Content generated successfully');
    
    return generatedContent;
  } catch (error) {
    console.error('[AI] Error generating content:', error);
    if (error.response?.errors) {
      console.error('[AI] Schema validation errors:', JSON.stringify(error.response.errors, null, 2));
    }
    
    // Return null to indicate failure (will fall back to template)
    return null;
  }
}

/* ───────── GitHub integration for build triggering ───────── */
async function triggerBuildWithGitCommit(siteId) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = 'ssc456';
  const repo = 'bizbud-template-site';
  const branch = 'master';

  // 1. Get the latest commit on the branch
  console.log(`[GitHub] Getting latest commit from ${branch} branch`);
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
  console.log(`[GitHub] Creating new blob with timestamp ${timestamp}`);
  const { data: blobData } = await octokit.git.createBlob({
    owner,
    repo,
    content: `This file triggers builds for site ID: ${siteId}\nTimestamp: ${timestamp}`,
    encoding: 'utf-8',
  });

  // 4. Create a new tree with the timestamp file
  console.log(`[GitHub] Creating new tree with file: builds/${siteId}-timestamp.txt`);
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
  console.log(`[GitHub] Creating new commit for ${siteId}`);
  const { data: newCommitData } = await octokit.git.createCommit({
    owner,
    repo,
    message: `Trigger build for ${siteId} [automated]`,
    tree: newTreeData.sha,
    parents: [latestCommitSha],
  });

  // 6. Update the reference to point to the new commit
  console.log(`[GitHub] Updating ${branch} branch to point to new commit`);
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
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
    /* ───── 1.  Site data preparation ───── */
    if (!redis) throw new Error('Redis unavailable');
    
    // Check if site already exists
    if (await redis.get(`site:${siteId}:client`)) {
      return res.status(409).json({ error: 'Site ID already exists' });
    }

    // Try to generate content with AI
    console.log(`[CreateSite] Using AI to generate content for ${siteId} (${businessName})`);
    let siteData;
    
    // Attempt AI generation first
    const generatedContent = await generateSiteContent(businessName, businessType);
    
    if (generatedContent) {
      // Use AI-generated content
      console.log('[CreateSite] Using AI-generated content');
      siteData = generatedContent;
      
      // Ensure these fields are properly set from request data
      siteData.siteTitle = businessName;
      if (businessType) siteData.businessType = businessType;
    } else {
      // Fallback to template if AI generation failed
      console.log('[CreateSite] AI generation failed, falling back to template "coastal-breeze"');
      const template = await redis.get('site:coastal-breeze:client');
      
      if (!template) {
        return res.status(500).json({ error: 'Template tenant not found and AI generation failed' });
      }
      
      siteData = { ...template, siteTitle: businessName, businessType };
    }

    // Create password hash
    const pwdHash = await bcrypt.hash(password, 12);

    // Store site data in Redis
    await redis.set(`site:${siteId}:client`, siteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: pwdHash,
      adminEmail: email,
      createdAt: new Date().toISOString(),
      businessType
    });
    console.log('[Redis] Stored site data for', siteId);

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

    /* ───── 7.  Response ───── */
    return res.status(201).json({
      success: true,
      siteId,
      url: `https://${siteId}.vercel.app`,
      adminUrl: `https://${siteId}.vercel.app/admin`,
      generatedWithAI: !!generatedContent  // Flag to indicate if AI was used
    });
  } catch (err) {
    console.error('[CreateSite] Failure:', err.response?.data || err);
    return res.status(500).json({ error: 'Failed to create site', detail: err.message });
  }
}
