# Lancelot Next.js cPanel Deployment Guide

## Prerequisites

1. **Node.js Version**: Your cPanel must support Node.js 18.17 or higher (required for Next.js 15)
2. **cPanel Access**: You need access to cPanel with Node.js application support
3. **Domain**: A configured domain or subdomain pointing to your cPanel hosting

## Pre-Deployment Checklist

- [ ] Verify Node.js 18.17+ is available in cPanel
- [ ] Have your domain/subdomain ready
- [ ] Have your API endpoint URLs ready
- [ ] Backup any existing data if updating

## Step 1: Prepare Your Application Locally

### 1.1 Navigate to the Web Application Directory
```powershell
cd apps/web
```

### 1.2 Run the Deployment Preparation Script
```powershell
.\prepare-deployment.ps1
```

This script will:
- Install dependencies
- Create a `.env.production` template
- Build the Next.js application
- Create a deployment package (`lancelot-nextjs-deployment.zip`)

### 1.3 Update Environment Variables
Edit the generated `.env.production` file and update all placeholder values:

```env
# Replace 'your-domain.com' with your actual domain
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_GRAPHQL_URL=https://api.your-domain.com/graphql
NEXT_PUBLIC_WS_URL=wss://api.your-domain.com/graphql
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_SOCKET_URL=wss://api.your-domain.com
```

## Step 2: Upload to cPanel

### 2.1 Access cPanel File Manager
1. Log into your cPanel account
2. Navigate to **File Manager**
3. Create a new directory for your app (e.g., `lancelot-app`)
   - **IMPORTANT**: Do NOT use the `public_html` directory
   - Create it at the root level or in a dedicated apps folder

### 2.2 Upload the Deployment Package
1. Navigate to your created directory
2. Click **Upload** in the toolbar
3. Select `lancelot-nextjs-deployment.zip`
4. Wait for the upload to complete

### 2.3 Extract the Archive
1. Right-click on the uploaded zip file
2. Select **Extract**
3. Extract to the current directory
4. Delete the zip file after extraction

## Step 3: Configure Node.js Application in cPanel

### 3.1 Access Node.js Application Manager
1. In cPanel, find and open **Setup Node.js App**
2. Click **+ CREATE APPLICATION**

### 3.2 Configure Application Settings

| Setting | Value |
|---------|-------|
| **Node.js version** | 18.17 or higher |
| **Application mode** | Production |
| **Application root** | Path to your app directory (e.g., `lancelot-app`) |
| **Application URL** | Select your domain/subdomain |
| **Application startup file** | `server.js` |

### 3.3 Add Environment Variables
Click **Add Variable** for each environment variable from your `.env.production` file:

Essential variables:
- `NODE_ENV` = `production`
- `NEXT_PUBLIC_APP_URL` = `https://your-domain.com`
- `NEXT_PUBLIC_GRAPHQL_URL` = `https://api.your-domain.com/graphql`
- `NEXT_PUBLIC_WS_URL` = `wss://api.your-domain.com/graphql`
- `NEXT_PUBLIC_API_URL` = `https://api.your-domain.com`
- `NEXT_PUBLIC_APP_NAME` = `Lancelot Platform`
- `NEXT_PUBLIC_DEFAULT_LOCALE` = `he`
- `NEXT_PUBLIC_TIMEZONE` = `Asia/Jerusalem`

### 3.4 Install Dependencies
1. Click **CREATE** to save the application
2. **STOP** the application temporarily
3. Navigate to **Detected Configuration Files**
4. Click **Run NPM Install**
5. Wait for installation to complete (this may take several minutes)

### 3.5 Start the Application
1. Click **START APP**
2. Note the generated Node.js command (you might need it for troubleshooting)

## Step 4: Verify Deployment

### 4.1 Check Application Status
1. The status should show as **Running**
2. Check the URL displayed in the application settings

### 4.2 Test Your Application
1. Open your browser
2. Navigate to your domain
3. You should see the Lancelot login page

### 4.3 Check Logs (if needed)
If the application doesn't start:
1. Click **Run Script** in the Node.js app settings
2. Enter: `npm run start`
3. Check the output for errors

## Troubleshooting

### Application Won't Start
1. **Check Node.js Version**: Ensure it's 18.17 or higher
2. **Review Logs**: Look for specific error messages
3. **Verify Environment Variables**: Ensure all required variables are set
4. **Check File Permissions**: Files should be readable by the web server

### Memory Issues
If you see memory-related errors:
1. Contact your hosting provider to increase Node.js memory limits
2. The app is configured to handle memory constraints, but may need adjustments

### 404 Errors
1. Verify the application URL is correctly set
2. Check that the startup file is `server.js`
3. Ensure the application root path is correct

### WebSocket Connection Issues
1. Ensure your hosting plan supports WebSocket connections
2. Verify the WebSocket URLs use `wss://` protocol
3. Check if any firewall rules are blocking WebSocket traffic

## Security Recommendations

1. **Use HTTPS**: Ensure your domain has an SSL certificate
2. **Secure Environment Variables**: Never commit `.env.production` to version control
3. **Regular Updates**: Keep your application and dependencies updated
4. **Monitor Logs**: Regularly check application logs for errors or suspicious activity

## Maintenance

### Updating the Application
1. Prepare a new deployment package locally
2. Stop the Node.js application in cPanel
3. Upload and extract the new package
4. Run NPM Install if package.json changed
5. Start the application

### Monitoring
- Set up uptime monitoring for your domain
- Check cPanel resource usage regularly
- Monitor application logs for errors

## Performance Optimization

1. **Enable Caching**: The app is configured with proper cache headers
2. **CDN**: Consider using a CDN for static assets
3. **Compression**: Ensure gzip compression is enabled in cPanel

## Support

If you encounter issues:
1. Check the application logs in cPanel
2. Review the Node.js error output
3. Verify all environment variables are correctly set
4. Ensure your API backend is accessible from the web server

---

**Note**: This guide assumes you're deploying the frontend only. Make sure your GraphQL API backend is already deployed and accessible at the URLs specified in your environment variables.

