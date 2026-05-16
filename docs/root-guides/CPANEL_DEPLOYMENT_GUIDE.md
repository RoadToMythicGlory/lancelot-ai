# cPanel Shared Hosting Deployment Guide for Lancelot

## Prerequisites

1. **MongoDB Atlas Account**: Since cPanel shared hosting doesn't include MongoDB, you need to:
   - Sign up for [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free cluster
   - Get your connection string
   - Update the connection string in your environment variables

2. **Node.js Support**: Ensure your cPanel hosting supports Node.js (version 18.17 or higher for Next.js 14)

3. **Domain/Subdomain**: Have your domain or subdomain ready and connected to your hosting

## Pre-Deployment Setup

### 1. Update MongoDB Connection for Cloud

Update your environment variables to use MongoDB Atlas instead of local MongoDB:

```env
MONGODB_URL=mongodb+srv://<USER>:<PASSWORD>@your-cluster.mongodb.net/lancelot?retryWrites=true&w=majority
MONGO_USERNAME=<your-username>
MONGO_PASSWORD=<your-password>
```

### 2. Build the Applications Locally

#### Build Next.js Frontend:
```bash
cd apps/web
npm install
npm run build
```

#### Build API Gateway:
```bash
cd services/api-gateway
npm install
npm run build
```

## Deployment Steps

### Part 1: Deploy API Gateway

1. **Prepare API Gateway Files**:
   - Navigate to `services/api-gateway`
   - Create a ZIP file containing:
     - `dist/` folder (from build)
     - `server.js`
     - `package.json`
     - `package-lock.json`
     - `.htaccess`
     - Any `.env` files needed
   - **EXCLUDE**: `node_modules`, `src/`, `.git/`

2. **Upload to cPanel**:
   - Log into cPanel
   - Create a subdomain for your API (e.g., `api.yourdomain.com`)
   - Navigate to the subdomain's root directory
   - Upload and extract the ZIP file

3. **Configure Node.js App**:
   - In cPanel, go to "Setup Node.js App"
   - Click "+ CREATE APPLICATION"
   - Configure:
     - Node.js version: 18.17 or higher
     - Application mode: Production
     - Application root: Path to your API files
     - Application URL: api.yourdomain.com
     - Application startup file: server.js
   - Add environment variables:
     ```
     NODE_ENV=production
     MONGODB_URL=your_mongodb_atlas_url
     MONGO_USERNAME=<your-username>
     MONGO_PASSWORD=<your-password>
     JWT_SECRET=your_production_jwt_secret
     CORS_ORIGIN=https://yourdomain.com
     ```
   - Click "CREATE"
   - Stop the app, run "NPM Install", then start it again

### Part 2: Deploy Next.js Frontend

1. **Update Frontend Configuration**:
   - Update `apps/web/.env.production` or environment variables:
     ```
     NEXT_PUBLIC_GRAPHQL_URL=https://api.yourdomain.com/graphql
     NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/graphql
     ```

2. **Prepare Frontend Files**:
   - Navigate to `apps/web`
   - Create a ZIP file containing:
     - `.next/` folder (from build)
     - `public/` folder
     - `server.js`
     - `package.json`
     - `package-lock.json`
     - `next.config.mjs`
   - **EXCLUDE**: `node_modules`, `src/`, `.git/`

3. **Upload to cPanel**:
   - Navigate to your main domain's directory (NOT public_html)
   - Create a folder for your app (e.g., `lancelot-app`)
   - Upload and extract the ZIP file

4. **Configure Node.js App**:
   - In cPanel, go to "Setup Node.js App"
   - Click "+ CREATE APPLICATION"
   - Configure:
     - Node.js version: 18.17 or higher
     - Application mode: Production
     - Application root: Path to your app folder
     - Application URL: yourdomain.com
     - Application startup file: server.js
   - Add environment variables:
     ```
     NODE_ENV=production
     NEXT_PUBLIC_GRAPHQL_URL=https://api.yourdomain.com/graphql
     NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/graphql
     ```
   - Click "CREATE"
   - Stop the app, run "NPM Install", then start it again

### Part 3: Create .htaccess for Frontend (if needed)

If your Next.js app isn't in the root domain, create `.htaccess` in public_html:

```apache
RewriteEngine On
RewriteCond %{HTTP_HOST} ^(www\.)?yourdomain\.com$
RewriteCond %{REQUEST_URI} !^/lancelot-app/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /lancelot-app/$1
RewriteCond %{HTTP_HOST} ^(www\.)?yourdomain\.com$
RewriteRule ^(/)?$ lancelot-app/index.js [L]
```

## Post-Deployment Checklist

1. **Test API Endpoint**: Visit `https://api.yourdomain.com/health`
2. **Test GraphQL**: Visit `https://api.yourdomain.com/graphql` (if playground enabled)
3. **Test Frontend**: Visit `https://yourdomain.com`
4. **Check Logs**: Use cPanel's error logs if issues occur
5. **SSL Certificates**: Ensure both domains have SSL certificates

## Troubleshooting

### Common Issues:

1. **502 Bad Gateway**:
   - Check if Node.js app is running
   - Verify port configuration
   - Check error logs

2. **MongoDB Connection Failed**:
   - Verify MongoDB Atlas connection string
   - Check IP whitelist in MongoDB Atlas
   - Ensure credentials are correct

3. **CORS Errors**:
   - Update CORS_ORIGIN in API environment variables
   - Ensure frontend URL is correct

4. **Missing Dependencies**:
   - Stop app, run NPM Install again
   - Check package.json for all required dependencies

### Monitoring:

1. Set up monitoring for both apps in cPanel
2. Configure email alerts for app crashes
3. Regular check application logs

## Security Considerations:

1. **Environment Variables**: Never commit sensitive data to git
2. **MongoDB Atlas**: Use IP whitelist for security
3. **JWT Secret**: Use a strong, unique secret for production
4. **HTTPS**: Ensure all traffic uses HTTPS

## Maintenance:

1. **Updates**: Plan for zero-downtime deployments
2. **Backups**: Regular backup MongoDB Atlas data
3. **Logs**: Implement log rotation
4. **Performance**: Monitor resource usage in cPanel

---

Remember: cPanel shared hosting has limitations. For production use with high traffic, consider VPS or dedicated hosting for better performance and control.










































