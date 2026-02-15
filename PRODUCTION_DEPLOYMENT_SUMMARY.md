# Lancelot Production Deployment Summary

## What Has Been Done

I've prepared your Lancelot application for production deployment with all API endpoints changed from `localhost:4000` to `api.lanceloterp.io`. Here's what was created:

### 1. Production Configuration Files

- **`production.env`** - Master production environment file with all settings
- **`Dockerfile.production`** - Production-specific Dockerfile that bakes in the production URLs
- **`docker-compose.production.yml`** - Docker Compose override file for production settings

### 2. Deployment Scripts

- **`prepare-production-deployment.ps1`** - PowerShell script for Windows
- **`prepare-production-deployment.sh`** - Bash script for Linux/Mac
- **`prepare-production-deployment.bat`** - Simple batch file to run the PowerShell script

### 3. Key Changes Made

All references to `localhost:4000` have been replaced with `api.lanceloterp.io` in:
- Frontend Apollo Client configuration
- WebSocket connections
- Environment variables
- Docker configurations

## How to Deploy

### Step 1: Prepare the Production Build

On your local Windows machine, run:
```powershell
.\prepare-production-deployment.bat
```

Or if using PowerShell directly:
```powershell
.\prepare-production-deployment.ps1
```

This will create a `production-build` directory with everything configured for production.

### Step 2: Update MongoDB Credentials

**IMPORTANT**: Before deploying, edit `production-build/services/api-gateway/.env` and replace:
- `YOUR_PASSWORD` with your actual MongoDB password
- Update the MongoDB cluster URL if needed

### Step 3: Upload to VPS

Upload the entire `production-build` directory to your VPS:
```bash
scp -r ./production-build/* user@your-vps-ip:/tmp/lancelot-production/
```

### Step 4: Deploy on VPS

SSH into your VPS and run:
```bash
ssh user@your-vps-ip
cd /tmp/lancelot-production
chmod +x deploy.sh
sudo ./deploy.sh
```

## What the Deployment Does

1. **Backs up** any existing deployment to `/opt/lancelot.backup.<timestamp>`
2. **Copies** all files to `/opt/lancelot`
3. **Uses production Dockerfile** that has all URLs set to `api.lanceloterp.io`
4. **Builds and starts** all services with Docker Compose
5. **Configures** services to restart automatically

## Verification

After deployment, verify:
- Web app is accessible at https://lanceloterp.io
- API is accessible at https://api.lanceloterp.io/graphql

## Important Notes

1. **SSL Certificates**: Ensure your VPS has SSL certificates configured for both domains
2. **Nginx/Apache**: You may need to configure reverse proxy:
   - `lanceloterp.io` → port 3000
   - `api.lanceloterp.io` → port 4000
3. **Firewall**: Ensure ports 3000 and 4000 are accessible (or proxied)
4. **MongoDB**: The MongoDB connection must be accessible from your VPS

## Rollback

If needed, you can rollback:
```bash
cd /opt
sudo rm -rf lancelot
sudo mv lancelot.backup.<timestamp> lancelot
cd lancelot
docker-compose up -d
```

## Local Development

Your local development environment remains unchanged. It will continue to use `localhost:4000`.
