import Stripe from 'stripe';
import {
  getOverlaySite,
  getRequestBaseUrl,
  isDemoBillingMode,
  normalizeReturnUrl,
  setCorsHeaders,
  setOverlayPaymentTier,
} from './utils/overlaySites.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { siteKey, interval = 'monthly', returnUrl } = req.body || {};
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
    console.error('[Overlay Checkout] Failed to create checkout:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}