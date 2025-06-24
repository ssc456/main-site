import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId } = req.query;
  
  if (!siteId) {
    return res.status(400).json({ error: 'Site ID is required' });
  }
  
  try {
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const headers = { Authorization: `Bearer ${vercelToken}` };
    
    // Check if the site exists on Vercel and has a successful deployment
    const deploymentsResponse = await axios.get(
      `https://api.vercel.com/v6/deployments?app=${siteId}&target=production&limit=1`,
      { headers }
    );
    
    if (!deploymentsResponse.data || !deploymentsResponse.data.deployments || deploymentsResponse.data.deployments.length === 0) {
      return res.status(200).json({ status: 'building', message: 'Site is still being deployed' });
    }
    
    const deployment = deploymentsResponse.data.deployments[0];
    
    if (deployment.state === 'READY') {
      return res.status(200).json({ 
        status: 'ready',
        url: `https://${siteId}.vercel.app`,
        adminUrl: `https://${siteId}.vercel.app/admin`,
        deployedAt: deployment.created
      });
    } else if (deployment.state === 'ERROR') {
      return res.status(200).json({ 
        status: 'error',
        message: 'There was an error deploying the site'
      });
    } else {
      return res.status(200).json({ 
        status: 'building',
        message: 'Site is still being deployed' 
      });
    }
  } catch (error) {
    console.error('Error checking site status:', error.response?.data || error);
    return res.status(500).json({ 
      status: 'unknown',
      error: 'Failed to check site status' 
    });
  }
}