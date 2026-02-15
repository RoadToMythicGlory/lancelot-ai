# Simple PowerShell script to create a production ZIP

Write-Host "Creating Production ZIP for Lancelot..." -ForegroundColor Cyan

# Clean up
if (Test-Path ".\production-build") {
    Remove-Item -Path ".\production-build" -Recurse -Force
}
if (Test-Path ".\lancelot-production.zip") {
    Remove-Item -Path ".\lancelot-production.zip" -Force
}

# Create directory
New-Item -ItemType Directory -Path ".\production-build" -Force | Out-Null

# Copy files
$items = @(
    "apps", "services", "packages", "config", "deploy", "k8s",
    "docker-compose.yml", "Dockerfile", "Dockerfile.production",
    "turbo.json", "package.json", "package-lock.json",
    "production.env", "nginx-example.conf"
)

foreach ($item in $items) {
    if (Test-Path $item) {
        Write-Host "Copying $item..."
        Copy-Item -Path $item -Destination ".\production-build\" -Recurse -Force
    }
}

# Create web env files
$webEnv = "NEXT_PUBLIC_GRAPHQL_URL=https://api.lanceloterp.io/graphql
NEXT_PUBLIC_WS_URL=wss://api.lanceloterp.io/graphql
NEXT_PUBLIC_API_URL=https://api.lanceloterp.io
NEXT_PUBLIC_CHAT_WS_URL=https://api.lanceloterp.io
NODE_ENV=production"

$webEnv | Out-File ".\production-build\apps\web\.env.production" -Encoding UTF8
$webEnv | Out-File ".\production-build\apps\web\.env.local" -Encoding UTF8

# Create API env file
$apiEnv = "NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://LancelotERP_DB:YOUR_PASSWORD@your-cluster.mongodb.net/lancelot?retryWrites=true&w=majority
JWT_SECRET=<JWT_SECRET>
CORS_ORIGIN=https://lanceloterp.io
CORS_ALLOWED_ORIGINS=https://lanceloterp.io,https://www.lanceloterp.io,https://api.lanceloterp.io"

$apiEnv | Out-File ".\production-build\services\api-gateway\.env" -Encoding UTF8

# Update docker-compose
$docker = Get-Content ".\production-build\docker-compose.yml" -Raw
$docker = $docker -replace 'http://localhost:4000', 'https://api.lanceloterp.io'
$docker = $docker -replace 'ws://localhost:4000', 'wss://api.lanceloterp.io'
$docker | Out-File ".\production-build\docker-compose.yml" -Encoding UTF8

# Create simple deploy script
"#!/bin/bash
cd /opt/lancelot
docker-compose down
docker-compose up -d --build" | Out-File ".\production-build\deploy.sh" -Encoding UTF8 -NoNewline

# Copy docs
if (Test-Path ".\PRODUCTION_DEPLOYMENT_SUMMARY.md") {
    Copy-Item ".\PRODUCTION_DEPLOYMENT_SUMMARY.md" ".\production-build\"
}

# Create ZIP
Write-Host "Creating ZIP file..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(".\production-build", ".\lancelot-production.zip")

$size = [math]::Round((Get-Item ".\lancelot-production.zip").Length / 1MB, 2)
Write-Host "Done! Created lancelot-production.zip ($size MB)" -ForegroundColor Green
Write-Host "Upload this file to your VPS and extract it to /opt/lancelot" -ForegroundColor Yellow
