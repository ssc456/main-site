import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Redis } from '@upstash/redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoFilePath = path.join(__dirname, '..', '..', 'public', 'overlay-sites.demo.json');

const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
})();

function getDemoStore() {
  if (!globalThis.__entryNetsOverlayDemoStore) {
    let demoSites = [];

    try {
      demoSites = JSON.parse(fs.readFileSync(demoFilePath, 'utf8'));
    } catch (error) {
      console.warn('[Overlay Sites] Failed to load demo site data:', error.message);
    }

    const store = new Map();
    for (const site of Array.isArray(demoSites) ? demoSites : []) {
      const normalized = normalizeOverlaySite(site);
      store.set(normalized.siteKey, normalized);
    }

    globalThis.__entryNetsOverlayDemoStore = store;
  }

  return globalThis.__entryNetsOverlayDemoStore;
}

function normalizeOverlaySite(site = {}) {
  return {
    siteKey: site.siteKey || '',
    displayName: site.displayName || site.siteKey || 'Entry Nets Site',
    ownerEmail: site.ownerEmail || '',
    paymentTier: site.paymentTier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
    stripeCustomerId: site.stripeCustomerId || null,
    subscriptionId: site.subscriptionId || null,
    allowedDomains: Array.isArray(site.allowedDomains) ? site.allowedDomains : [],
    monthlyPriceLabel: site.monthlyPriceLabel || '25',
    yearlyPriceLabel: site.yearlyPriceLabel || '250',
    createdAt: site.createdAt || new Date().toISOString(),
    updatedAt: site.updatedAt || site.createdAt || new Date().toISOString(),
  };
}

export function getRequestBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host || 'localhost:3000';
  const protocol = forwardedProto
    ? forwardedProto.split(',')[0]
    : host.includes('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https';

  return `${protocol}://${host}`;
}

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function isDemoBillingMode() {
  return process.env.ENTRYNETS_BILLING_DEMO_MODE === 'true'
    || !process.env.STRIPE_SECRET_KEY
    || !process.env.STRIPE_MONTHLY_PRICE_ID
    || !process.env.STRIPE_YEARLY_PRICE_ID;
}

export function normalizeReturnUrl(returnUrl, site) {
  if (!returnUrl) {
    return null;
  }

  try {
    const parsed = new URL(returnUrl);
    if (!site.allowedDomains.length) {
      return parsed.toString();
    }

    const allowed = site.allowedDomains.some((domain) => parsed.hostname === domain);
    return allowed ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function getOverlaySite(siteKey) {
  if (!siteKey) {
    return null;
  }

  if (redis) {
    try {
      const site = await redis.get(`overlay-site:${siteKey}`);
      if (site) {
        return normalizeOverlaySite(site);
      }
    } catch (error) {
      console.warn('[Overlay Sites] Redis lookup failed:', error.message);
    }
  }

  const demoStore = getDemoStore();
  const site = demoStore.get(siteKey);
  return site ? { ...site } : null;
}

export async function saveOverlaySite(siteInput) {
  const site = normalizeOverlaySite(siteInput);

  if (redis) {
    await redis.set(`overlay-site:${site.siteKey}`, site);

    if (site.subscriptionId) {
      await redis.set(`overlay-subscription:${site.subscriptionId}`, site.siteKey);
    }
  }

  const demoStore = getDemoStore();
  demoStore.set(site.siteKey, site);
  return site;
}

export async function setOverlayPaymentTier(siteKey, paymentTier, updates = {}) {
  const existing = await getOverlaySite(siteKey);
  if (!existing) {
    return null;
  }

  return saveOverlaySite({
    ...existing,
    ...updates,
    paymentTier,
    updatedAt: new Date().toISOString(),
  });
}

export async function findOverlaySiteBySubscriptionId(subscriptionId) {
  if (!subscriptionId) {
    return null;
  }

  if (redis) {
    try {
      const siteKey = await redis.get(`overlay-subscription:${subscriptionId}`);
      if (siteKey) {
        return getOverlaySite(siteKey);
      }
    } catch (error) {
      console.warn('[Overlay Sites] Reverse subscription lookup failed:', error.message);
    }
  }

  const demoStore = getDemoStore();
  for (const site of demoStore.values()) {
    if (site.subscriptionId === subscriptionId) {
      return { ...site };
    }
  }

  return null;
}