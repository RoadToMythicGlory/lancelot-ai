# PowerShell script to create a minimal deployment zip for VPS
# Only includes essential files, excludes node_modules

Write-Host "Creating VPS Deployment ZIP for Lancelot" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Set error action preference
$ErrorActionPreference = "Stop"

# Variables
$buildDir = "vps-deployment"
$zipFile = "lancelot-vps-deployment.zip"

# Clean previous build
Write-Host "`nCleaning previous build..." -ForegroundColor Yellow
if (Test-Path $buildDir) {
    Remove-Item -Path $buildDir -Recurse -Force
}
if (Test-Path $zipFile) {
    Remove-Item -Path $zipFile -Force
}

# Create deployment directory
Write-Host "Creating deployment directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

# Create directory structure
$directories = @(
    "$buildDir\apps\web\src",
    "$buildDir\apps\web\public",
    "$buildDir\services\api-gateway\src",
    "$buildDir\services\database\mongodb",
    "$buildDir\services\excel-parser\src",
    "$buildDir\config\prometheus"
)

foreach ($dir in $directories) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

Write-Host "`nCopying application files..." -ForegroundColor Yellow

# Copy root files
$rootFiles = @(
    "package.json",
    "package-lock.json",
    "turbo.json",
    "docker-compose.yml",
    "Dockerfile",
    "Dockerfile.production",
    "production-config.js"
)

foreach ($file in $rootFiles) {
    if (Test-Path $file) {
        Write-Host "  - $file" -ForegroundColor Gray
        Copy-Item -Path $file -Destination "$buildDir\$file" -Force
    }
}

# Copy web app files
Write-Host "`nCopying Web App files..." -ForegroundColor Yellow
$webFiles = @(
    "apps\web\package.json",
    "apps\web\package-lock.json",
    "apps\web\next.config.mjs",
    "apps\web\next-i18next.config.js",
    "apps\web\tsconfig.json",
    "apps\web\tailwind.config.js",
    "apps\web\postcss.config.js",
    "apps\web\server.js"
)

foreach ($file in $webFiles) {
    if (Test-Path $file) {
        $fileName = Split-Path $file -Leaf
        Write-Host "  - $fileName" -ForegroundColor Gray
        Copy-Item -Path $file -Destination "$buildDir\$file" -Force
    }
}

# Copy web source files
Write-Host "  - Copying src directory..." -ForegroundColor Gray
Copy-Item -Path "apps\web\src\*" -Destination "$buildDir\apps\web\src" -Recurse -Force

# Copy public files
Write-Host "  - Copying public directory..." -ForegroundColor Gray
Copy-Item -Path "apps\web\public\*" -Destination "$buildDir\apps\web\public" -Recurse -Force

# Copy API Gateway files
Write-Host "`nCopying API Gateway files..." -ForegroundColor Yellow
$apiFiles = @(
    "services\api-gateway\package.json",
    "services\api-gateway\package-lock.json",
    "services\api-gateway\tsconfig.json",
    "services\api-gateway\jest.config.js",
    "services\api-gateway\server.js"
)

foreach ($file in $apiFiles) {
    if (Test-Path $file) {
        $fileName = Split-Path $file -Leaf
        Write-Host "  - $fileName" -ForegroundColor Gray
        Copy-Item -Path $file -Destination "$buildDir\$file" -Force
    }
}

# Copy API source files
Write-Host "  - Copying src directory..." -ForegroundColor Gray
Copy-Item -Path "services\api-gateway\src\*" -Destination "$buildDir\services\api-gateway\src" -Recurse -Force

# Copy Database files
Write-Host "`nCopying Database files..." -ForegroundColor Yellow
Copy-Item -Path "services\database\mongodb\*.js" -Destination "$buildDir\services\database\mongodb" -Force

# Copy Excel Parser files
Write-Host "`nCopying Excel Parser files..." -ForegroundColor Yellow
if (Test-Path "services\excel-parser\package.json") {
    Copy-Item -Path "services\excel-parser\package.json" -Destination "$buildDir\services\excel-parser\package.json" -Force
    Copy-Item -Path "services\excel-parser\package-lock.json" -Destination "$buildDir\services\excel-parser\package-lock.json" -Force -ErrorAction SilentlyContinue
    Copy-Item -Path "services\excel-parser\tsconfig.json" -Destination "$buildDir\services\excel-parser\tsconfig.json" -Force
}
Copy-Item -Path "services\excel-parser\src\*" -Destination "$buildDir\services\excel-parser\src" -Force

# Copy config files if they exist
if (Test-Path "config\prometheus\prometheus.yml") {
    Write-Host "`nCopying config files..." -ForegroundColor Yellow
    Copy-Item -Path "config\prometheus\prometheus.yml" -Destination "$buildDir\config\prometheus\prometheus.yml" -Force
}

# Create environment template files
Write-Host "`nCreating environment templates..." -ForegroundColor Yellow

# Web app .env template
$webEnvTemplate = @"
# Web Application Environment Variables
NEXT_PUBLIC_GRAPHQL_URL=https://api.lanceloterp.io/graphql
NEXT_PUBLIC_WS_URL=wss://api.lanceloterp.io/graphql
NEXT_PUBLIC_API_URL=https://api.lanceloterp.io
NEXT_PUBLIC_CHAT_WS_URL=https://api.lanceloterp.io
NEXT_PUBLIC_APP_NAME=Lancelot Platform
NEXT_PUBLIC_APP_URL=https://lanceloterp.io
NODE_ENV=production
NEXT_PUBLIC_ENABLE_EXCEL_IMPORT=true
NEXT_PUBLIC_ENABLE_BARCODE_SCANNER=true
NEXT_PUBLIC_DEFAULT_LOCALE=he
NEXT_PUBLIC_TIMEZONE=Asia/Jerusalem
"@
$webEnvTemplate | Out-File -FilePath "$buildDir\apps\web\.env.example" -Encoding UTF8

# API Gateway .env template
$apiEnvTemplate = @"
# API Gateway Environment Variables
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb://localhost:27017/lancelot
MONGO_USERNAME=
MONGO_PASSWORD=
MONGO_DATABASE=lancelot
JWT_SECRET=your-secure-jwt-secret-here
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
CORS_ORIGIN=https://lanceloterp.io
CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://www.lanceloterp.io,https://api.lanceloterp.io
CORS_ALLOW_CREDENTIALS=true
ENABLE_GRAPHQL_PLAYGROUND=false
ENABLE_GRAPHQL_INTROSPECTION=false
TIMEZONE=Asia/Jerusalem
DEFAULT_LOCALE=he
ENABLE_EXCEL_PARSER=true
EXCEL_PARSER_PORT=4001
"@
$apiEnvTemplate | Out-File -FilePath "$buildDir\services\api-gateway\.env.example" -Encoding UTF8

# Excel Parser .env template
$excelParserEnvTemplate = @"
# Excel Parser Service Environment Variables
NODE_ENV=production
PORT=4001
API_GATEWAY_URL=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017/lancelot
TIMEZONE=Asia/Jerusalem
DEFAULT_LOCALE=he
"@
$excelParserEnvTemplate | Out-File -FilePath "$buildDir\services\excel-parser\.env.example" -Encoding UTF8

# Create deployment instructions
$deploymentReadme = @"
# Lancelot VPS Deployment Guide

## Prerequisites
- Node.js 18+ installed
- MongoDB installed and running
- PM2 (optional, for process management)

## Deployment Steps

### 1. Extract the ZIP file
```bash
unzip lancelot-vps-deployment.zip
cd lancelot-vps-deployment
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install web app dependencies
cd apps/web
npm install
cd ../..

# Install API gateway dependencies
cd services/api-gateway
npm install
cd ../..

# Install Excel parser dependencies (if using)
cd services/excel-parser
npm install
cd ../..
```

### 3. Configure Environment Variables
```bash
# Copy and edit web app environment
cp apps/web/.env.example apps/web/.env
nano apps/web/.env

# Copy and edit API gateway environment
cp services/api-gateway/.env.example services/api-gateway/.env
nano services/api-gateway/.env
```

### 4. Build the Applications
```bash
# Build the web app
cd apps/web
npm run build
cd ../..

# Build the API gateway (if TypeScript)
cd services/api-gateway
npm run build
cd ../..
```

### 5. Start the Applications

#### Option A: Using PM2 (Recommended)
```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Start API Gateway
cd services/api-gateway
pm2 start server.js --name lancelot-api

# Start Web App
cd ../../apps/web
pm2 start npm --name lancelot-web -- start

# Save PM2 configuration
pm2 save
pm2 startup
```

#### Option B: Using systemd services
Create service files in `/etc/systemd/system/`

#### Option C: Using Docker
```bash
docker-compose up -d
```

### 6. Configure Nginx (if using as reverse proxy)
```nginx
server {
    listen 80;
    server_name lanceloterp.io www.lanceloterp.io;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name lanceloterp.io www.lanceloterp.io;

    # SSL configuration (update paths)
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    # Web app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.lanceloterp.io;

    # SSL configuration (update paths)
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    # API Gateway and WebSocket
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Excel Parser Service (internal only)
    location /excel-parser/ {
        proxy_pass http://localhost:4001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Important Notes
- Update MongoDB connection string in API gateway .env file
- Generate a secure JWT secret for production
- Configure proper CORS origins for your domain
- Set up SSL certificates for HTTPS
- Configure firewall rules as needed
- Set up monitoring and logging

## Verification
1. Check API: `curl http://localhost:4000/graphql`
2. Access web app: `http://localhost:3000`
3. Check logs: `pm2 logs` (if using PM2)
"@
$deploymentReadme | Out-File -FilePath "$buildDir\README.md" -Encoding UTF8

# Create a simple deployment script
$deployScript = @"
#!/bin/bash
# Simple deployment script for Lancelot

echo "Installing dependencies..."
npm install

cd apps/web && npm install && cd ../..
cd services/api-gateway && npm install && cd ../..
cd services/excel-parser && npm install && cd ../..

echo "Building applications..."
cd apps/web && npm run build && cd ../..
cd services/api-gateway && npm run build 2>/dev/null || true && cd ../..

echo "Deployment preparation complete!"
echo "Don't forget to:"
echo "1. Configure .env files"
echo "2. Set up MongoDB"
echo "3. Start the applications"
"@
$deployScript | Out-File -FilePath "$buildDir\deploy.sh" -Encoding UTF8 -NoNewline

# Create PM2 ecosystem file
$pm2Config = @"
module.exports = {
  apps: [
    {
      name: 'lancelot-api',
      script: './services/api-gateway/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'lancelot-web',
      script: 'npm',
      args: 'start',
      cwd: './apps/web',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'lancelot-excel-parser',
      script: 'npm',
      args: 'start',
      cwd: './services/excel-parser',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4001
      }
    }
  ]
};
"@
$pm2Config | Out-File -FilePath "$buildDir\ecosystem.config.js" -Encoding UTF8

# Create the ZIP file
Write-Host "`nCreating ZIP file..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Create zip with compression level
$compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
$includeBaseDirectory = $false
[System.IO.Compression.ZipFile]::CreateFromDirectory($buildDir, $zipFile, $compressionLevel, $includeBaseDirectory)

# Get file size
$zipSize = (Get-Item $zipFile).Length / 1MB
$zipSizeFormatted = "{0:N2}" -f $zipSize

# Count files
$fileCount = (Get-ChildItem -Path $buildDir -Recurse -File).Count

Write-Host "`nVPS Deployment ZIP created successfully!" -ForegroundColor Green
Write-Host "File: $zipFile ($zipSizeFormatted MB)" -ForegroundColor Green
Write-Host "Total files: $fileCount" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Upload $zipFile to your VPS" -ForegroundColor White
Write-Host "  2. Extract: unzip $zipFile" -ForegroundColor White
Write-Host "  3. Run: chmod +x deploy.sh && ./deploy.sh" -ForegroundColor White
Write-Host "  4. Configure .env files with your settings" -ForegroundColor White
Write-Host "  5. Start applications with PM2 or your preferred method" -ForegroundColor White

# Clean up build directory
Write-Host "`nCleaning up build directory..." -ForegroundColor Yellow
Remove-Item -Path $buildDir -Recurse -Force

Write-Host "`nDone!" -ForegroundColor Green
