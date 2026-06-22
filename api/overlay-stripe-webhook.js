import Stripe from 'stripe';
import { buffer } from 'micro';
import {
  findOverlaySiteBySubscriptionId,
  saveOverlaySite,
  setOverlayPaymentTier,
} from './utils/overlaySites.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!stripe || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook is not configured' });
  }

  try {
    const payload = await buffer(req);
    const signature = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.metadata?.billingKind !== 'overlay-site' || !session.metadata?.siteKey) {
          break;
        }

        await setOverlayPaymentTier(session.metadata.siteKey, 'PREMIUM', {
          stripeCustomerId: session.customer || null,
          subscriptionId: session.subscription || null,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const site = await findOverlaySiteBySubscriptionId(subscription.id);
        if (!site) {
          break;
        }

        await saveOverlaySite({
          ...site,
          paymentTier: 'FREE',
          subscriptionId: null,
          updatedAt: new Date().toISOString(),
        });
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Overlay Stripe Webhook] Failed:', error);
    return res.status(400).json({ error: 'Webhook handling failed' });
  }
}