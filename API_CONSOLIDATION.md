# API Consolidation Summary

## Changes Made

### ✅ **Removed Files** (to reduce from 13 to 11 API functions):
- `api/upload-image.js` → Consolidated into `api/upload.js`
- `api/upload-logo.js` → Consolidated into `api/upload.js`
- `api/meta-tags.js` → Consolidated into `api/social.js`
- `api/social-preview.js` → Consolidated into `api/social.js`

### ✅ **Updated Frontend Code**:
- `src/admin/components/ImageUploader.jsx` → Now calls `/api/upload` with `type=image`
- `src/pages/CreateSite.jsx` → Now calls `/api/upload` with `type=logo`
- `api/generate-static.js` → Now references `/api/social?action=preview`

### ✅ **New API Structure** (11 functions total):
1. `auth.js` - Authentication
2. `client-data.js` - Site data management
3. `create-site.js` - Site creation
4. `delete-site.js` - Site deletion
5. `generate-static.js` - Static generation
6. `get-media.js` - Media retrieval
7. `sites.js` - Sites listing
8. **`social.js`** - Social previews + meta tags (NEW)
9. `stripe-webhook.js` - Payment webhooks
10. `update-payment-tier.js` - Payment updates
11. **`upload.js`** - File uploads for images + logos (NEW)

## New API Usage

### Upload API (`/api/upload`)
```javascript
// For images
const formData = new FormData();
formData.append('file', file);
formData.append('siteId', siteId);
formData.append('type', 'image');

// For logos
formData.append('type', 'logo');
```

### Social API (`/api/social`)
```javascript
// Get meta tags as JSON
const response = await fetch(`/api/social?siteId=${siteId}&action=meta`);

// Get social preview HTML
const response = await fetch(`/api/social?siteId=${siteId}&action=preview`);

// Bot detection (automatic)
// Social bots get HTML, regular users get JSON
```

## Deployment Status
✅ **Ready to deploy** - Now fits within Vercel's free tier limit of 12 functions
