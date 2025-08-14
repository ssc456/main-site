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
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary'; // added: Cloudinary client

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

// Resend client for email sending
const resend = (() => {
  const apiKey = process.env.RESEND_API_KEY;
  console.log('[Init] Resend API key present:', !!apiKey);
  if (!apiKey) return null;
  return new Resend(apiKey);
})();

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
    primaryColor: z.enum(['blue', 'green', 'purple', 'pink']),
    theme: z.enum(['default', 'modern', 'minimalist', 'gradient']).optional().default('default'),
    showHero: z.boolean(),
    showAbout: z.boolean(),
    showServices: z.boolean(),
    showFeatures: z.boolean(),
    showTestimonials: z.boolean(),
    showGallery: z.boolean(),
    showContact: z.boolean(),
    showFAQ: z.boolean(),
    showAppointments: z.boolean().default(false) // Add this line
  })
});

/* ───────── Content generation function ───────── */
/**
 * Generates site content using OpenAI based on business information
 * @param {string} businessName - The name of the business
 * @param {string} businessType - The type/industry of the business
 * @return {Promise<Object>} - The generated site content
 */
async function generateSiteContent(businessName, businessType = '', businessDescription = '') {
  console.log(`[AI] Generating content for "${businessName}" (${businessType || 'unspecified type'})`);
  
  // Check if OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[AI] OpenAI API key not found, using default template instead');
    return null;
  }
  
  try {
    // Create system prompt for content generation with business description
    const systemPrompt = `
    You are a professional website content creator specializing in small business websites.
    Create a complete client.json file for a business website using the information provided below.
    
    Business information:
    - Business name: ${businessName}
    - Business type/industry: ${businessType || 'Not specified, use your best judgment based on the name'}
    - Business description: ${businessDescription || 'Not provided'}
    
    Use these guidelines:
    1. Use appropriate Lucide icon names for services and features (e.g., ShieldCheck, Clock, Heart, Star, Zap)
    2. Create realistic, engaging content for the business with substantial text content, using details from the business description provided but do not be limited to this. If there is insufficient information, or little information is provided, use your expertise to fill in the gaps and create a complete, professional site.
    3. Generate image prompts that would create high-quality images relevant to this business
    4. Primary color should match the business type or brand feel limited to Blue, Green, Purple, Pink
    5. For social media platforms that don't apply to this business, use empty strings
    6. For testimonials, create realistic but fictional customer quotes that reflect the business description

    You are the expert here, use your best judgment and content creation to ensure a rich, content dense site configuration.
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

/* ───────── Email notification function ───────── */
async function sendWelcomeEmail(userEmail, siteId, businessName) {
  if (!resend) {
    console.warn('[Email] Resend client not available, skipping welcome email');
    return false;
  }
  
  try {
    const fromEmail = process.env.EMAIL_FROM || 'notifications@entrynets.com';
    console.log(`[Email] Sending welcome email to ${userEmail} from ${fromEmail}`);
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: `Your ${businessName} Website is Ready!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Your Website is Live!</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
            <h2>Hello,</h2>
            <p>Great news! Your website for <strong>${businessName}</strong> has been successfully created and is now live.</p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="https://${siteId}.entrynets.com" 
                 style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                View Your Website
              </a>
            </div>
            
            <h3>Important Links:</h3>
            <ul>
              <li>Website URL: <a href="https://${siteId}.entrynets.com">https://${siteId}.entrynets.com</a></li>
              <li>Admin Dashboard: <a href="https://${siteId}.entrynets.com/admin">https://${siteId}.entrynets.com/admin</a></li>
            </ul>
            
            <p>You can log in to your admin dashboard using the email and password you provided during signup.</p>
            
            <h3>What's Next?</h3>
            <ul>
              <li>Log in to your admin dashboard to customize your website content</li>
              <li>Add your own images and text</li>
              <li>Connect your custom domain if you have one</li>
            </ul>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 14px;">
            <p>Thank you for choosing EntryNets for your web presence!</p>
            <p>If you have any questions, please reply to this email or contact support.</p>
          </div>
        </div>
      `
    });
    
    if (error) {
      console.error('[Email] Error sending welcome email:', error);
      return false;
    }
    
    console.log('[Email] Welcome email sent successfully:', data?.id);
    return true;
  } catch (error) {
    console.error('[Email] Exception sending welcome email:', error);
    return false;
  }
}

/* ───────── Admin notification function ───────── */
async function sendAdminNotificationEmail(siteId, businessName, userEmail) {
  if (!resend) {
    console.warn('[Email] Resend client not available, skipping admin notification email');
    return false;
  }
  
  try {
    const fromEmail = process.env.EMAIL_FROM || 'notifications@entrynets.com';
    console.log(`[Email] Sending admin notification email to sales@entrynets.com`);
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: 'sales@entrynets.com',
      subject: `New Site Created: ${businessName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">New Site Created</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
            <h2>New Site Details:</h2>
            <ul>
              <li><strong>Business Name:</strong> ${businessName}</li>
              <li><strong>Site ID:</strong> ${siteId}</li>
              <li><strong>User Email:</strong> ${userEmail}</li>
              <li><strong>Site URL:</strong> <a href="https://${siteId}.entrynets.com">https://${siteId}.entrynets.com</a></li>
              <li><strong>Admin URL:</strong> <a href="https://${siteId}.entrynets.com/admin">https://${siteId}.entrynets.com/admin</a></li>
            </ul>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 14px;">
            <p>This is an automated notification from your BizBud platform.</p>
          </div>
        </div>
      `
    });
    
    if (error) {
      console.error('[Email] Error sending admin notification email:', error);
      return false;
    }
    
    console.log('[Email] Admin notification email sent successfully:', data?.id);
    return true;
  } catch (error) {
    console.error('[Email] Exception sending admin notification email:', error);
    return false;
  }
}

/* ───────── Feature toggles ───────── */
const AUTO_IMAGE_GEN = true; // set to 'false' to disable auto image generation

/* ───────── Exports ───────── */
export { sendWelcomeEmail };

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
  // Allow both admin tokens and the public website token
  if (!auth.startsWith('Bearer ') || (auth !== 'Bearer public-website' && !validateAdminToken(auth)))
    return res.status(401).json({ error: 'Authentication required' });

  const { siteId, businessName, businessType = '', businessDescription = '', password, email = '', includeAppointments = false } = req.body;
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
    const generatedContent = await generateSiteContent(businessName, businessType, businessDescription);
    
    if (generatedContent) {
      // Use AI-generated content
      console.log('[CreateSite] Using AI-generated content');
      siteData = generatedContent;
      
      // Ensure these fields are properly set from request data
      siteData.siteTitle = businessName;
      if (businessType) siteData.businessType = businessType;
      
      // IMPORTANT: Use the uploaded logo URL if provided
      if (req.body.logoUrl) {
        console.log('[CreateSite] Using uploaded logo:', req.body.logoUrl);
        siteData.logoUrl = req.body.logoUrl;
      }
      
      // Set appointment flag if requested
      if (siteData.config) {
        siteData.config.showAppointments = includeAppointments || false;
      }
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

    // Update site data schema to include paymentTier
    siteData.paymentTier = 'FREE';  // 'FREE' or 'PREMIUM'
    siteData.stripeCustomerId = null;  // Will be populated after payment
    siteData.subscriptionId = null;   // For recurring subscriptions

    /* ───── New: Auto image generation (OpenAI -> Cloudinary) ───── */
    if (AUTO_IMAGE_GEN) {
      console.log('[CreateSite] AUTO_IMAGE_GEN is enabled. Attempting to generate images...');
      try {
        // Skip logo and about for now - focus on gallery
        console.log('[CreateSite] Skipping logo and about images - focusing on gallery');

        // Gallery images - respect maxImages
        if (siteData.gallery && Array.isArray(siteData.gallery.images)) {
          console.log(`[Gallery] Found ${siteData.gallery.images.length} gallery image entries`);
          console.log(`[Gallery] maxImages setting: ${siteData.gallery.maxImages}`);
          
          const max = Math.min(siteData.gallery.maxImages || siteData.gallery.images.length, siteData.gallery.images.length);
          console.log(`[Gallery] Will attempt to generate ${max} images`);
          
          for (let i = 0; i < max; i++) {
            const img = siteData.gallery.images[i];
            if (!img) {
              console.log(`[Gallery] Image ${i} is null/undefined, skipping`);
              continue;
            }
            
            console.log(`[Gallery] Processing image ${i}: prompt="${img.imagePrompt}", existing src="${img.src}"`);
            
            // Generate if there's an imagePrompt (regardless of existing src)
            if (img.imagePrompt && img.imagePrompt.trim()) {
              console.log(`[Gallery] Generating image ${i} with prompt: ${img.imagePrompt}`);
              const imgUpload = await generateAndUploadImage(siteId, img.imagePrompt, `sites/${siteId}/gallery`);
              if (imgUpload) {
                console.log(`[Gallery] Successfully generated image ${i}: ${imgUpload.secure_url}`);
                img.src = imgUpload.secure_url;
              } else {
                console.log(`[Gallery] Failed to generate image ${i}`);
              }
            } else {
              console.log(`[Gallery] Image ${i} has no imagePrompt, skipping`);
            }
          }
        } else {
          console.log('[Gallery] No gallery found or gallery.images is not an array');
        }
      } catch (imgErr) {
        console.error('[CreateSite] Error during auto image generation:', imgErr?.message || imgErr);
        // Do not fail site creation due to image generation issues
      }
    } else {
      console.log('[CreateSite] AUTO_IMAGE_GEN is disabled - skipping image generation');
    }

    // Store site data in Redis
    await redis.set(`site:${siteId}:client`, siteData);
    await redis.set(`site:${siteId}:settings`, {
      adminPasswordHash: pwdHash,
      adminEmail: email,
      createdAt: new Date().toISOString()
    });
    console.log('[Redis] Stored site data for', siteId);

    // // Trigger a build on GitHub
    // try {
    //   await triggerBuildWithGitCommit(siteId);
    // } catch (buildError) {
    //   console.error('[CreateSite] Failed to trigger build:', buildError);
    //   // Continue anyway - don't block site creation
    // }

    // Send admin notification email (non-blocking)
    sendAdminNotificationEmail(siteId, businessName, email).catch(err => {
      console.error('[CreateSite] Admin notification email error:', err);
      // Non-blocking - we don't await this promise
    });
    
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

    /* ───── 2.5. Add custom domain to project ───── */
    console.log('[Vercel] Adding custom domain to project...');
    try {
      await axios.post(
        `https://api.vercel.com/v9/projects/${projectId}/domains`,
        { name: `${siteId}.entrynets.com` },
        { headers: vcHeaders }
      );
      console.log(`[Vercel] Custom domain ${siteId}.entrynets.com added successfully`);
    } catch (domainError) {
      console.error('[Vercel] Error adding custom domain:', domainError.response?.data || domainError);
      // Continue with deployment even if custom domain fails
    }

    /* ───── 3.  Env vars (v10) ───── */
    console.log('[Vercel] Adding environment variables...');
    const envVars = [
      { key: 'KV_REST_API_URL', value: process.env.KV_REST_API_URL, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'KV_REST_API_TOKEN', value: process.env.KV_REST_API_TOKEN, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'VITE_SITE_ID', value: siteId, type: 'plain', target: ['production', 'preview', 'development'] },
      { key: 'CLOUDINARY_CLOUD_NAME', value: process.env.CLOUDINARY_CLOUD_NAME, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'CLOUDINARY_API_KEY', value: process.env.CLOUDINARY_API_KEY, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'CLOUDINARY_API_SECRET', value: process.env.CLOUDINARY_API_SECRET, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'RESEND_API_KEY', value: process.env.RESEND_API_KEY, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'EMAIL_FROM', value: siteId + '@entrynets.com', type: 'plain', target: ['production', 'preview', 'development'] },
      { key: 'STRIPE_PUBLISHABLE_KEY', value: process.env.STRIPE_PUBLISHABLE_KEY, type: 'plain', target: ['production', 'preview', 'development'] },
      { key: 'STRIPE_SECRET_KEY', value: process.env.STRIPE_SECRET_KEY, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'STRIPE_WEBHOOK_SECRET', value: process.env.STRIPE_WEBHOOK_SECRET, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'STRIPE_MONTHLY_PRICE_ID', value: process.env.STRIPE_MONTHLY_PRICE_ID, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'STRIPE_ONE_TIME_PRICE_ID', value: process.env.STRIPE_ONE_TIME_PRICE_ID, type: 'encrypted', target: ['production', 'preview', 'development'] },
      { key: 'STRIPE_YEARLY_PRICE_ID', value: process.env.STRIPE_ONE_TIME_PRICE_ID, type: 'encrypted', target: ['production', 'preview', 'development'] },

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
      url: `https://${siteId}.entrynets.com`,
      adminUrl: `https://${siteId}.entrynets.com/admin`,
      generatedWithAI: !!generatedContent  // Flag to indicate if AI was used
    });
  } catch (err) {
    console.error('[CreateSite] Failure:', err.response?.data || err);
    return res.status(500).json({ error: 'Failed to create site', detail: err.message });
  }
}

/* ───────── Helper: generate image with OpenAI + upload to Cloudinary ───────── */
async function generateAndUploadImage(siteId, prompt, folder = `sites/${siteId}/gallery`, size = '1024x1024') {
  if (!prompt) {
    console.log('[Image] No prompt provided');
    return null;
  }
  if (!openai) {
    console.warn('[Image] OpenAI client not configured');
    return null;
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('[Image] Cloudinary credentials not configured');
    return null;
  }

  // configure cloudinary once (safe to call multiple times)
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  try {
    console.log('[Image] Generating image from prompt:', prompt);
    // Call OpenAI Images API (gpt-image-1) with explicit response_format
    const imgResp = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size,
      n: 1,
      response_format: 'b64_json'  // Explicitly request base64
    });

    console.log('[Image] OpenAI response received, checking for b64_json...');
    const b64 = imgResp.data?.[0]?.b64_json;
    if (!b64) {
      console.warn('[Image] No b64_json in OpenAI response:', JSON.stringify(imgResp.data?.[0], null, 2));
      return null;
    }

    console.log('[Image] Got base64 data, length:', b64.length);
    const dataUri = `data:image/png;base64,${b64}`;

    // Upload to Cloudinary
    console.log('[Image] Uploading image to Cloudinary folder:', folder);
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder,
      use_filename: true,
      unique_filename: true,
      overwrite: false
    });

    console.log('[Image] Uploaded to Cloudinary:', uploadResult.secure_url);
    return {
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id
    };
  } catch (err) {
    console.error('[Image] Error generating or uploading image:', err?.message || err);
    console.error('[Image] Full error:', err);
    return null;
  }
}
