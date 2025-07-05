import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Verify admin authentication
  const cookies = req.cookies || {};
  const authToken = cookies.adminToken;
  
  if (!authToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Verify CSRF token
  const csrfHeader = req.headers['x-csrf-token'];
  const storedCsrfToken = await redis.get(`csrf:${authToken}`);
  
  if (!csrfHeader || !storedCsrfToken || csrfHeader !== storedCsrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  try {
    const { siteId, paymentTier } = req.body;
    
    if (!siteId || !paymentTier) {
      return res.status(400).json({ error: 'Site ID and payment tier are required' });
    }
    
    // Verify valid payment tier
    if (paymentTier !== 'FREE' && paymentTier !== 'PREMIUM') {
      return res.status(400).json({ error: 'Invalid payment tier' });
    }
    
    // Get site data
    const siteData = await redis.get(`site:${siteId}:client`);
    
    if (!siteData) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    // Update payment tier
    siteData.paymentTier = paymentTier;
    
    // Save updated site data
    await redis.set(`site:${siteId}:client`, siteData);
    
    return res.status(200).json({ 
      success: true, 
      message: `Site ${siteId} payment tier updated to ${paymentTier}` 
    });
  } catch (error) {
    console.error('Error updating payment tier:', error);
    return res.status(500).json({ error: 'Failed to update payment tier' });
  }
}