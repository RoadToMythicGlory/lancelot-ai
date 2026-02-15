# PowerShell script to prepare Lancelot app for production deployment
Write-Host "Preparing Lancelot for Production Deployment (Source Only)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

# Clean previous build
Write-Host "`nCleaning previous build..." -ForegroundColor Yellow
if (Test-Path ".\production-build") {
    Remove-Item -Path ".\production-build" -Recurse -Force
}
if (Test-Path ".\lancelot-production.zip") {
    Remove-Item -Path ".\lancelot-production.zip" -Force
}

# Create production build directory
Write-Host "Creating production build directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path ".\production-build" -Force | Out-Null

# Copy necessary files and directories (excluding node_modules)
Write-Host "`nCopying application source files..." -ForegroundColor Yellow
$itemsToCopy = @(
    "apps",
    "services", 
    "config",
    "docker-compose.yml",
    "Dockerfile",
    "Dockerfile.production",
    "turbo.json",
    "package.json",
    "package-lock.json",
    "nginx-example.conf"
)

foreach ($item in $itemsToCopy) {
    if (Test-Path $item) {
        Write-Host "  - Copying $item" -ForegroundColor Gray
        if (Test-Path -Path $item -PathType Container) {
            # Create target directory
            New-Item -ItemType Directory -Path ".\production-build\$item" -Force | Out-Null
            # Copy contents excluding node_modules
            Get-ChildItem -Path $item -Recurse | Where-Object { 
                $_.FullName -notmatch "node_modules" -and 
                $_.FullName -notmatch "\.next" -and 
                $_.FullName -notmatch "\\dist\\" -and 
                $_.FullName -notmatch "\\build\\" -and 
                $_.FullName -notmatch "\.turbo" -and
                $_.FullName -notmatch "\\temp\\" -and
                $_.Name -ne ".env" -and
                $_.Name -ne ".env.local"
            } | ForEach-Object {
                $targetPath = $_.FullName -replace [regex]::Escape((Get-Location).Path), "$PWD\production-build"
                if ($_.PSIsContainer) {
                    New-Item -ItemType Directory -Path $targetPath -Force -ErrorAction SilentlyContinue | Out-Null
                } else {
                    $targetDir = Split-Path $targetPath -Parent
                    New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction SilentlyContinue | Out-Null
                    Copy-Item -Path $_.FullName -Destination $targetPath -Force -ErrorAction SilentlyContinue
                }
            }
        } else {
            Copy-Item -Path $item -Destination ".\production-build\$item" -Force
        }
    }
}

# Create production environment files
Write-Host "`nCreating production environment files..." -ForegroundColor Yellow

# Create necessary directories
$null = New-Item -ItemType Directory -Path ".\production-build\apps\web" -Force -ErrorAction SilentlyContinue
$null = New-Item -ItemType Directory -Path ".\production-build\services\api-gateway" -Force -ErrorAction SilentlyContinue
$null = New-Item -ItemType Directory -Path ".\production-build\services\excel-parser" -Force -ErrorAction SilentlyContinue

# Web app production env
$webEnv = @"
# Production Environment - DO NOT COMMIT
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
$webEnv | Out-File -FilePath ".\production-build\apps\web\.env.production" -Encoding UTF8

# API Gateway production env
$apiEnv = @"
# Production Environment - UPDATE BEFORE DEPLOYMENT
NODE_ENV=production
PORT=4000

# MongoDB Configuration - UPDATE THESE!
MONGODB_URI=mongodb+srv://LancelotERP_DB:YOUR_PASSWORD@your-cluster.mongodb.net/lancelot?retryWrites=true&w=majority
MONGO_USERNAME=LancelotERP_DB
MONGO_PASSWORD=YOUR_SECURE_PASSWORD
MONGO_DATABASE=lancelot

# Security
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# CORS Configuration
CORS_ORIGIN=https://lanceloterp.io
CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://www.lanceloterp.io,https://api.lanceloterp.io
CORS_ALLOW_CREDENTIALS=true

# GraphQL Settings
ENABLE_GRAPHQL_PLAYGROUND=false
ENABLE_GRAPHQL_INTROSPECTION=false

# Timezone
TIMEZONE=Asia/Jerusalem
DEFAULT_LOCALE=he
"@
$apiEnv | Out-File -FilePath ".\production-build\services\api-gateway\.env.production" -Encoding UTF8

# Excel Parser production env
$excelEnv = @"
# Production Environment
NODE_ENV=production
PORT=3002
GRAPHQL_URL=http://api-gateway:4000/graphql
"@
$excelEnv | Out-File -FilePath ".\production-build\services\excel-parser\.env.production" -Encoding UTF8

# Create deployment script
$deployScript = @'
#!/bin/bash
# Deployment script for Lancelot on AlmaLinux

echo "Deploying Lancelot Platform..."

# Create deployment directory
sudo mkdir -p /opt/lancelot
sudo chown -R $USER:$USER /opt/lancelot

# Copy files
cp -r ./* /opt/lancelot/
cd /opt/lancelot

# Setup environment files
cp apps/web/.env.production apps/web/.env.local
cp services/api-gateway/.env.production services/api-gateway/.env
cp services/excel-parser/.env.production services/excel-parser/.env

# Install dependencies
npm install

# Build all services
npm run build

# Build Next.js app
cd apps/web
npm run build
cd ../..

echo "Build complete! Use PM2 to start services."
'@
$deployScript | Out-File -FilePath ".\production-build\deploy.sh" -Encoding UTF8 -NoNewline

# Create PM2 ecosystem config
$ecosystem = @"
module.exports = {
  apps: [
    {
      name: 'lancelot-api',
      script: './services/api-gateway/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'lancelot-web',
      script: 'npm',
      args: 'start',
      cwd: './apps/web',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'lancelot-excel',
      script: './services/excel-parser/dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    }
  ]
};
"@
$ecosystem | Out-File -FilePath ".\production-build\ecosystem.config.js" -Encoding UTF8

# Create README
$readme = @"
Lancelot Production Deployment Guide
====================================

IMPORTANT: Update MongoDB credentials in services/api-gateway/.env before deployment!

Quick Deployment:
1. Upload this folder to your VPS: /tmp/lancelot
2. Run: chmod +x deploy.sh && ./deploy.sh
3. Start with PM2: pm2 start ecosystem.config.js

Services will run on:
- Web App: http://localhost:3000 (proxy to lanceloterp.io)
- API Gateway: http://localhost:4000 (proxy to api.lanceloterp.io)
- Excel Parser: http://localhost:3002 (internal)

Configure Nginx to proxy:
- lanceloterp.io -> localhost:3000
- api.lanceloterp.io -> localhost:4000

The app is configured to use api.lanceloterp.io for all API calls in production.
Your local development will continue using localhost:4000.
"@
$readme | Out-File -FilePath ".\production-build\README.txt" -Encoding UTF8

# Create ZIP file
Write-Host "`nCreating deployment package..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(".\production-build", ".\lancelot-production.zip")

# Get file size
$zipSize = (Get-Item ".\lancelot-production.zip").Length / 1MB
$zipSizeFormatted = "{0:N2}" -f $zipSize

Write-Host "`nProduction deployment package created successfully!" -ForegroundColor Green
Write-Host "Package: lancelot-production.zip ($zipSizeFormatted MB)" -ForegroundColor Green
Write-Host "`nWhat's included:" -ForegroundColor Yellow
Write-Host "  - Source code (no node_modules)" -ForegroundColor White
Write-Host "  - Production environment files (api.lanceloterp.io)" -ForegroundColor White
Write-Host "  - Deployment scripts" -ForegroundColor White
Write-Host "  - PM2 configuration" -ForegroundColor White
Write-Host "  - Excel parser service" -ForegroundColor White
Write-Host "`nREMEMBER: Update MongoDB credentials before deployment!" -ForegroundColor Red
