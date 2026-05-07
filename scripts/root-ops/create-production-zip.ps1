# PowerShell script to create a production-ready zip file for Lancelot

Write-Host "🚀 Creating Production ZIP for Lancelot" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Set error action preference
$ErrorActionPreference = "Stop"

# Clean previous build
Write-Host "`n📦 Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path ".\production-build") {
    Remove-Item -Path ".\production-build" -Recurse -Force
}
if (Test-Path ".\lancelot-production.zip") {
    Remove-Item -Path ".\lancelot-production.zip" -Force
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
    "production.env",
    "nginx-example.conf"
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

# Create production environment files
Write-Host "`n🔧 Creating production environment files..." -ForegroundColor Yellow

# Web app env files
$webEnvContent = @"
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

$webEnvContent | Out-File -FilePath ".\production-build\apps\web\.env.production" -Encoding UTF8
$webEnvContent | Out-File -FilePath ".\production-build\apps\web\.env.local" -Encoding UTF8

# API Gateway env file
$apiEnvContent = @"
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://LancelotERP_DB:YOUR_PASSWORD@your-cluster.mongodb.net/lancelot?retryWrites=true&w=majority
MONGO_USERNAME=LancelotERP_DB
MONGO_PASSWORD=YOUR_SECURE_PASSWORD
MONGO_DATABASE=lancelot
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
CORS_ORIGIN=https://lanceloterp.io
CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://www.lanceloterp.io,https://api.lanceloterp.io
CORS_ALLOW_CREDENTIALS=true
ENABLE_GRAPHQL_PLAYGROUND=false
ENABLE_GRAPHQL_INTROSPECTION=false
TIMEZONE=Asia/Jerusalem
DEFAULT_LOCALE=he
"@

$apiEnvContent | Out-File -FilePath ".\production-build\services\api-gateway\.env" -Encoding UTF8

# Update docker-compose.yml
Write-Host "`n🐳 Updating Docker Compose configuration..." -ForegroundColor Yellow
$dockerComposeContent = Get-Content ".\production-build\docker-compose.yml" -Raw
$dockerComposeContent = $dockerComposeContent -replace 'NEXT_PUBLIC_GRAPHQL_URL:-http://localhost:4000/graphql', 'NEXT_PUBLIC_GRAPHQL_URL:-https://api.lanceloterp.io/graphql'
$dockerComposeContent = $dockerComposeContent -replace 'NEXT_PUBLIC_WS_URL:-ws://localhost:4000/graphql', 'NEXT_PUBLIC_WS_URL:-wss://api.lanceloterp.io/graphql'
$dockerComposeContent | Out-File -FilePath ".\production-build\docker-compose.yml" -Encoding UTF8

# Copy deployment documentation
if (Test-Path ".\PRODUCTION_DEPLOYMENT_SUMMARY.md") {
    Copy-Item -Path ".\PRODUCTION_DEPLOYMENT_SUMMARY.md" -Destination ".\production-build\DEPLOYMENT_GUIDE.md" -Force
}

# Create deployment script
$deployScript = @"
#!/bin/bash
echo "Deploying Lancelot Platform..."
cd /opt/lancelot 2>/dev/null && docker-compose down || true
if [ -d "/opt/lancelot" ]; then
    sudo mv /opt/lancelot "/opt/lancelot.backup.\$(date +%Y%m%d_%H%M%S)"
fi
sudo mkdir -p /opt/lancelot
sudo cp -r ./* /opt/lancelot/
sudo chown -R \`$USER:\`$USER /opt/lancelot
cd /opt/lancelot
cp production.env .env
cp Dockerfile.production Dockerfile
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker-compose ps
echo "Deployment complete!"
"@

$deployScript | Out-File -FilePath ".\production-build\deploy.sh" -Encoding UTF8 -NoNewline

# Create docker-compose.production.yml
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

# Create the ZIP file
Write-Host "`n📦 Creating ZIP file..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(".\production-build", ".\lancelot-production.zip")

# Get file size
$zipSize = (Get-Item ".\lancelot-production.zip").Length / 1MB
$zipSizeFormatted = "{0:N2}" -f $zipSize

Write-Host "`n✅ Production ZIP created successfully!" -ForegroundColor Green
Write-Host "📁 File: lancelot-production.zip ($zipSizeFormatted MB)" -ForegroundColor Green
Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Upload lancelot-production.zip to your VPS" -ForegroundColor White
Write-Host "  2. Extract it: unzip lancelot-production.zip" -ForegroundColor White
Write-Host "  3. Update MongoDB password in services/api-gateway/.env" -ForegroundColor White
Write-Host "  4. Run: chmod +x deploy.sh and then sudo ./deploy.sh" -ForegroundColor White
