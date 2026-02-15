# PowerShell script to prepare Lancelot app for production deployment
# This script creates a production-ready build that can be uploaded to /opt/lancelot

Write-Host "🚀 Preparing Lancelot for Production Deployment" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Set error action preference
$ErrorActionPreference = "Stop"

# Clean previous build
Write-Host "`n📦 Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path ".\production-build") {
    Remove-Item -Path ".\production-build" -Recurse -Force
}

# Create production build directory
Write-Host "📁 Creating production build directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path ".\production-build" -Force | Out-Null

# Copy necessary files and directories
Write-Host "`n📋 Copying application files..." -ForegroundColor Yellow
$itemsToCopy = @(
    "apps",
    "services",
    "packages",
    "config",
    "deploy",
    "k8s",
    "docker-compose.yml",
    "Dockerfile",
    "Dockerfile.production",
    "turbo.json",
    "package.json",
    "package-lock.json",
    "production.env"
)

foreach ($item in $itemsToCopy) {
    if (Test-Path $item) {
        Write-Host "  - Copying $item" -ForegroundColor Gray
        if (Test-Path -Path $item -PathType Container) {
            Copy-Item -Path $item -Destination ".\production-build\$item" -Recurse -Force
        } else {
            Copy-Item -Path $item -Destination ".\production-build\$item" -Force
        }
    }
}

# Create .env files for production
Write-Host "`n🔧 Creating production environment files..." -ForegroundColor Yellow

# Create web app .env.production
$webEnvContent = @"
# Production Environment Variables for Web App
NEXT_PUBLIC_GRAPHQL_URL=https://api.lanceloterp.io/graphql
NEXT_PUBLIC_WS_URL=wss://api.lanceloterp.io/graphql
NEXT_PUBLIC_API_URL=https://api.lanceloterp.io
NEXT_PUBLIC_CHAT_WS_URL=https://api.lanceloterp.io

# App Configuration
NEXT_PUBLIC_APP_NAME=Lancelot Platform
NEXT_PUBLIC_APP_URL=https://lanceloterp.io
NODE_ENV=production

# Features
NEXT_PUBLIC_ENABLE_EXCEL_IMPORT=true
NEXT_PUBLIC_ENABLE_BARCODE_SCANNER=true

# Locale
NEXT_PUBLIC_DEFAULT_LOCALE=he
NEXT_PUBLIC_TIMEZONE=Asia/Jerusalem
"@

$webEnvContent | Out-File -FilePath ".\production-build\apps\web\.env.production" -Encoding UTF8
$webEnvContent | Out-File -FilePath ".\production-build\apps\web\.env.local" -Encoding UTF8

# Create API Gateway .env
$apiEnvContent = @"
# Production Environment Variables for API Gateway
NODE_ENV=production
PORT=4000

# MongoDB Configuration (UPDATE THESE VALUES!)
MONGODB_URI=mongodb+srv://LancelotERP_DB:YOUR_PASSWORD@your-cluster.mongodb.net/lancelot?retryWrites=true&w=majority
MONGO_USERNAME=LancelotERP_DB
MONGO_PASSWORD=YOUR_SECURE_PASSWORD
MONGO_DATABASE=lancelot

# Security
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# CORS
CORS_ORIGIN=https://lanceloterp.io
CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://www.lanceloterp.io,https://api.lanceloterp.io
CORS_ALLOW_CREDENTIALS=true

# GraphQL
ENABLE_GRAPHQL_PLAYGROUND=false
ENABLE_GRAPHQL_INTROSPECTION=false

# Timezone
TIMEZONE=Asia/Jerusalem
DEFAULT_LOCALE=he
"@

$apiEnvContent | Out-File -FilePath ".\production-build\services\api-gateway\.env" -Encoding UTF8

# Update docker-compose.yml for production
Write-Host "`n🐳 Updating Docker Compose configuration..." -ForegroundColor Yellow
$dockerComposeContent = Get-Content ".\production-build\docker-compose.yml" -Raw
$dockerComposeContent = $dockerComposeContent -replace 'NEXT_PUBLIC_GRAPHQL_URL:-http://localhost:4000/graphql', 'NEXT_PUBLIC_GRAPHQL_URL:-https://api.lanceloterp.io/graphql'
$dockerComposeContent = $dockerComposeContent -replace 'NEXT_PUBLIC_WS_URL:-ws://localhost:4000/graphql', 'NEXT_PUBLIC_WS_URL:-wss://api.lanceloterp.io/graphql'
$dockerComposeContent | Out-File -FilePath ".\production-build\docker-compose.yml" -Encoding UTF8

# Create deployment script
Write-Host "`n📝 Creating deployment script..." -ForegroundColor Yellow
$deployScript = @'
#!/bin/bash
# Deployment script for Lancelot Platform on VPS

echo "🚀 Deploying Lancelot Platform..."
echo "================================="

# Stop existing services
echo "🛑 Stopping existing services..."
cd /opt/lancelot 2>/dev/null && docker-compose down || true

# Backup existing deployment
echo "📦 Backing up existing deployment..."
if [ -d "/opt/lancelot" ]; then
    sudo mv /opt/lancelot "/opt/lancelot.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create directory
echo "📁 Creating deployment directory..."
sudo mkdir -p /opt/lancelot

# Copy files (assuming you have uploaded them to a temp directory)
echo "📋 Copying files..."
sudo cp -r /tmp/lancelot-production/* /opt/lancelot/

# Set permissions
echo "🔐 Setting permissions..."
sudo chown -R $USER:$USER /opt/lancelot

# Load environment variables
echo "🔧 Loading environment variables..."
cd /opt/lancelot
cp production.env .env

# Use production Dockerfile
echo "📦 Using production Dockerfile..."
cp Dockerfile.production Dockerfile

# Build and start services
echo "🐳 Building and starting services..."
docker-compose -f docker-compose.yml -f docker-compose.production.yml build
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d

# Check service status
echo "✅ Checking service status..."
docker-compose ps

echo "🎉 Deployment complete!"
echo "========================"
echo "Services should be running at:"
echo "- Web App: https://lanceloterp.io"
echo "- API: https://api.lanceloterp.io"
'@

$deployScript | Out-File -FilePath ".\production-build\deploy.sh" -Encoding UTF8 -NoNewline

# Create README for deployment
Write-Host "`n📄 Creating deployment README..." -ForegroundColor Yellow
$readmeContent = @"
# Lancelot Production Deployment

## Pre-Deployment Checklist

1. **Update MongoDB Connection String**
   - Edit `services/api-gateway/.env`
   - Replace `YOUR_PASSWORD` with actual MongoDB password
   - Update cluster URL if needed

2. **Verify Domain Configuration**
   - Ensure `lanceloterp.io` points to your VPS
   - Ensure `api.lanceloterp.io` points to your VPS
   - SSL certificates should be configured

## Deployment Steps

1. **Upload files to VPS**
   ```bash
   # From your local machine
   scp -r ./production-build/* user@your-vps-ip:/tmp/lancelot-production/
   ```

2. **SSH to VPS and run deployment**
   ```bash
   ssh user@your-vps-ip
   cd /tmp/lancelot-production
   chmod +x deploy.sh
   sudo ./deploy.sh
   ```

3. **Verify deployment**
   - Check https://lanceloterp.io
   - Check https://api.lanceloterp.io/graphql

## Post-Deployment

1. **Monitor logs**
   ```bash
   cd /opt/lancelot
   docker-compose logs -f
   ```

2. **Update Nginx/Apache configuration** (if needed)
   - Proxy pass for api.lanceloterp.io to port 4000
   - Proxy pass for lanceloterp.io to port 3000

## Rollback

If needed, rollback to previous version:
```bash
cd /opt
sudo rm -rf lancelot
sudo mv lancelot.backup.<timestamp> lancelot
cd lancelot
docker-compose up -d
```
"@

$readmeContent | Out-File -FilePath ".\production-build\DEPLOYMENT_README.md" -Encoding UTF8

# Create production docker-compose override
Write-Host "`n🐳 Creating production Docker Compose override..." -ForegroundColor Yellow
$dockerProdContent = @"
version: '3.8'

services:
  web:
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_GRAPHQL_URL=https://api.lanceloterp.io/graphql
      - NEXT_PUBLIC_WS_URL=wss://api.lanceloterp.io/graphql
      - NEXT_PUBLIC_API_URL=https://api.lanceloterp.io
      - NEXT_PUBLIC_CHAT_WS_URL=https://api.lanceloterp.io
    restart: always

  api-gateway:
    environment:
      - NODE_ENV=production
      - CORS_ORIGIN=https://lanceloterp.io
      - CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://www.lanceloterp.io,https://api.lanceloterp.io
    restart: always

  mongodb:
    restart: always
    volumes:
      - /opt/lancelot/mongo_data:/data/db

  excel-parser:
    restart: always
"@

$dockerProdContent | Out-File -FilePath ".\production-build\docker-compose.production.yml" -Encoding UTF8

Write-Host "`n✅ Production build prepared successfully!" -ForegroundColor Green
Write-Host "📁 Build location: .\production-build\" -ForegroundColor Green
Write-Host "`n⚠️  IMPORTANT: Before deploying:" -ForegroundColor Yellow
Write-Host "  1. Update MongoDB credentials in services/api-gateway/.env" -ForegroundColor Yellow
Write-Host "  2. Ensure your VPS has Docker and Docker Compose installed" -ForegroundColor Yellow
Write-Host "  3. Configure SSL certificates for your domains" -ForegroundColor Yellow
Write-Host "  4. Read DEPLOYMENT_README.md for detailed instructions" -ForegroundColor Yellow
