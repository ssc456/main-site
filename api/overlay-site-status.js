import {
  getOverlaySite,
  getRequestBaseUrl,
  isDemoBillingMode,
  setCorsHeaders,
} from './utils/overlaySites.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteKey } = req.query;
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
}