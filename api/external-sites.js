import Stripe from 'stripe';
import {
  deleteOverlaySite,
  getOverlaySite,
  getRequestBaseUrl,
  isDemoBillingMode,
  listOverlaySites,
  normalizeReturnUrl,
  saveOverlaySite,
  setCorsHeaders,
  setOverlayPaymentTier
} from './utils/overlaySites.js';
import { Redis } from '@upstash/redis';

const redis = (() => {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
})();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function normalizeSiteKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function normalizeUrl(value) {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }

  try {
    return new URL(input).toString();
  } catch {
    return new URL(`https://${input}`).toString();
  }
}

function parseAllowedDomains(productionUrl, allowedDomainsText) {
  const domains = new Set();

  if (productionUrl) {
    domains.add(new URL(productionUrl).hostname);
  }

  String(allowedDomainsText || '')
    .split(/[\n,]+/)
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .forEach((domain) => domains.add(domain));

  return Array.from(domains);
}

async function verifyAdmin(req, res) {
  const authToken = req.cookies?.adminToken;

  if (!authToken) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }

  if (!redis) {
    res.status(500).json({ error: 'Redis connection not available' });
    return false;
  }

  const csrfHeader = req.headers['x-csrf-token'];
  const storedCsrfToken = await redis.get(`csrf:${authToken}`);

  if (!csrfHeader || !storedCsrfToken || csrfHeader !== storedCsrfToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return false;
  }

  return true;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  if (req.method === 'GET' && action === 'status') {
    try {
      const siteKey = normalizeSiteKey(req.query.siteKey);
      if (!siteKey) {
        return res.status(400).json({ error: 'siteKey is required' });
      }

      const site = await getOverlaySite(siteKey);
      if (!site) {
        return res.status(404).json({ error: 'Overlay site not found' });
      }

      const baseUrl = getRequestBaseUrl(req);
      return res.status(200).json({
        siteKey: site.siteKey,
        displayName: site.displayName,
        paymentTier: site.paymentTier,
        allowedDomains: site.allowedDomains,
        monthlyPriceLabel: site.monthlyPriceLabel,
        yearlyPriceLabel: site.yearlyPriceLabel,
        upgradeUrl: `${baseUrl}/upgrade/${encodeURIComponent(site.siteKey)}`,
        demoMode: isDemoBillingMode(),
      });
    } catch (error) {
      console.error('[External Sites] Failed to load public status:', error);
      return res.status(500).json({ error: 'Failed to load site status' });
    }
  }

  if (req.method === 'POST' && action === 'checkout') {
    try {
      const { siteKey: rawSiteKey, interval = 'monthly', returnUrl } = req.body || {};
      const siteKey = normalizeSiteKey(rawSiteKey);

      if (!siteKey) {
        return res.status(400).json({ error: 'siteKey is required' });
      }

      const site = await getOverlaySite(siteKey);
      if (!site) {
        return res.status(404).json({ error: 'Overlay site not found' });
      }

      if (site.paymentTier === 'PREMIUM') {
        return res.status(400).json({ error: 'Site is already premium' });
      }

      const baseUrl = getRequestBaseUrl(req);
      const safeReturnUrl = normalizeReturnUrl(returnUrl, site);
      const returnUrlQuery = safeReturnUrl ? `&returnUrl=${encodeURIComponent(safeReturnUrl)}` : '';

      if (isDemoBillingMode() || !stripe) {
        await setOverlayPaymentTier(site.siteKey, 'PREMIUM', {
          stripeCustomerId: 'demo-customer',
          subscriptionId: `demo-${site.siteKey}`,
        });

        return res.status(200).json({
          checkoutUrl: `${baseUrl}/upgrade-success?siteKey=${encodeURIComponent(site.siteKey)}${returnUrlQuery}&demo=1`,
          mode: 'demo',
        });
      }

      const priceId = interval === 'yearly'
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : process.env.STRIPE_MONTHLY_PRICE_ID;

      if (!priceId) {
        return res.status(500).json({ error: 'Stripe price configuration is incomplete' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/upgrade-success?siteKey=${encodeURIComponent(site.siteKey)}${returnUrlQuery}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/upgrade/${encodeURIComponent(site.siteKey)}?canceled=1${safeReturnUrl ? `&returnUrl=${encodeURIComponent(safeReturnUrl)}` : ''}`,
        customer_email: site.ownerEmail || undefined,
        metadata: {
          billingKind: 'overlay-site',
          siteKey: site.siteKey,
          interval,
        },
      });

      return res.status(200).json({
        checkoutUrl: session.url,
        mode: 'stripe',
      });
    } catch (error) {
      console.error('[External Sites] Failed to create checkout session:', error);
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }

  if (!(await verifyAdmin(req, res))) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const externalSites = await listOverlaySites();
      return res.status(200).json({ externalSites });
    } catch (error) {
      console.error('[External Sites] Failed to list sites:', error);
      return res.status(500).json({ error: 'Failed to load external sites' });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        siteKey: rawSiteKey,
        displayName,
        ownerEmail = '',
        productionUrl: rawProductionUrl = '',
        repoUrl: rawRepoUrl = '',
        allowedDomainsText = '',
        paymentTier = 'FREE',
      } = req.body || {};

      const siteKey = normalizeSiteKey(rawSiteKey);
      const cleanDisplayName = String(displayName || '').trim();
      const productionUrl = normalizeUrl(rawProductionUrl);
      const repoUrl = rawRepoUrl ? normalizeUrl(rawRepoUrl) : '';
      const allowedDomains = parseAllowedDomains(productionUrl, allowedDomainsText);

      if (!siteKey || !cleanDisplayName) {
        return res.status(400).json({ error: 'siteKey and displayName are required' });
      }

      if (!allowedDomains.length) {
        return res.status(400).json({ error: 'Provide a production URL or at least one allowed domain' });
      }

      if (paymentTier !== 'FREE' && paymentTier !== 'PREMIUM') {
        return res.status(400).json({ error: 'Invalid payment tier' });
      }

      const existing = await getOverlaySite(siteKey);
      if (existing) {
        return res.status(409).json({ error: 'An external site with that siteKey already exists' });
      }

      const externalSite = await saveOverlaySite({
        siteKey,
        displayName: cleanDisplayName,
        ownerEmail: String(ownerEmail || '').trim(),
        productionUrl,
        repoUrl,
        allowedDomains,
        paymentTier,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return res.status(201).json({ externalSite });
    } catch (error) {
      console.error('[External Sites] Failed to create site:', error);
      return res.status(500).json({ error: 'Failed to create external site' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const {
        siteKey: rawSiteKey,
        displayName,
        ownerEmail = '',
        productionUrl: rawProductionUrl = '',
        repoUrl: rawRepoUrl = '',
        allowedDomainsText = '',
      } = req.body || {};

      const siteKey = normalizeSiteKey(rawSiteKey);
      const existing = await getOverlaySite(siteKey);
      if (!existing) {
        return res.status(404).json({ error: 'External site not found' });
      }

      const cleanDisplayName = String(displayName || '').trim();
      const productionUrl = normalizeUrl(rawProductionUrl);
      const repoUrl = rawRepoUrl ? normalizeUrl(rawRepoUrl) : '';
      const allowedDomains = parseAllowedDomains(productionUrl, allowedDomainsText);

      if (!cleanDisplayName) {
        return res.status(400).json({ error: 'displayName is required' });
      }

      if (!allowedDomains.length) {
        return res.status(400).json({ error: 'Provide a production URL or at least one allowed domain' });
      }

      const externalSite = await saveOverlaySite({
        ...existing,
        displayName: cleanDisplayName,
        ownerEmail: String(ownerEmail || '').trim(),
        productionUrl,
        repoUrl,
        allowedDomains,
        updatedAt: new Date().toISOString(),
      });

      return res.status(200).json({ externalSite });
    } catch (error) {
      console.error('[External Sites] Failed to update site:', error);
      return res.status(500).json({ error: 'Failed to update external site' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const siteKey = normalizeSiteKey(req.query.siteKey || req.body?.siteKey);
      if (!siteKey) {
        return res.status(400).json({ error: 'siteKey is required' });
      }

      const deleted = await deleteOverlaySite(siteKey);
      if (!deleted) {
        return res.status(404).json({ error: 'External site not found' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[External Sites] Failed to delete site:', error);
      return res.status(500).json({ error: 'Failed to delete external site' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}