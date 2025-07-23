import { IncomingForm } from 'formidable';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form with uploaded file
    const form = new IncomingForm();
    
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const siteId = fields.siteId?.[0];
    const uploadType = fields.type?.[0] || 'image'; // 'logo' or 'image'
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let result;
    
    if (uploadType === 'logo') {
      // Upload logo with specific naming
      result = await cloudinary.uploader.upload(file.filepath, {
        folder: `sites/${siteId}`,
        public_id: 'logo',
        overwrite: true
      });
    } else {
      // Regular image upload
      result = await cloudinary.uploader.upload(file.filepath, {
        folder: `bizbud/${siteId}`,
        resource_type: 'auto'
      });

      // Store reference in Redis for media library
      const mediaItem = {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        createdAt: new Date().toISOString()
      };

      try {
        const existingMedia = await redis.get(`site:${siteId}:media`) || [];
        const updatedMedia = Array.isArray(existingMedia) ? [...existingMedia, mediaItem] : [mediaItem];
        await redis.set(`site:${siteId}:media`, updatedMedia);
      } catch (err) {
        console.warn('Failed to update media library:', err);
      }
    }

    // Clean up the temp file
    try {
      if (fs.existsSync(file.filepath)) {
        fs.unlinkSync(file.filepath);
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary file:', cleanupError);
    }

    return res.status(200).json({ 
      success: true,
      url: result.secure_url,
      width: result.width,
      height: result.height
    });
    
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}
