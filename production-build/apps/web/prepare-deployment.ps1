# PowerShell script to prepare Next.js app for cPanel deployment
# Run this script from the apps/web directory

Write-Host "=== Lancelot Next.js Deployment Preparation ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Please run this script from the apps/web directory!" -ForegroundColor Red
    exit 1
}

# Step 1: Install dependencies
Write-Host "Step 1: Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
    exit 1
}

# Step 2: Create production environment file
Write-Host ""
Write-Host "Step 2: Setting up production environment..." -ForegroundColor Yellow
if (-not (Test-Path ".env.production")) {
    Write-Host "Creating .env.production file template..." -ForegroundColor Green
    @"
# Production Environment Variables for Next.js App
# IMPORTANT: Update all values before deployment

NODE_ENV=production

# Application URL (update with your actual domain)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# API Configuration
NEXT_PUBLIC_GRAPHQL_URL=https://api.your-domain.com/graphql
NEXT_PUBLIC_WS_URL=wss://api.your-domain.com/graphql
NEXT_PUBLIC_API_URL=https://api.your-domain.com

# Application Settings
NEXT_PUBLIC_APP_NAME=Lancelot Platform
NEXT_PUBLIC_ENABLE_EXCEL_IMPORT=true
NEXT_PUBLIC_ENABLE_BARCODE_SCANNER=true

# Locale Settings
NEXT_PUBLIC_DEFAULT_LOCALE=he
NEXT_PUBLIC_TIMEZONE=Asia/Jerusalem

# Socket.IO Configuration
NEXT_PUBLIC_SOCKET_URL=wss://api.your-domain.com
"@ | Out-File -FilePath ".env.production" -Encoding UTF8
    Write-Host "Created .env.production - Please update it with your actual values!" -ForegroundColor Yellow
} else {
    Write-Host ".env.production already exists" -ForegroundColor Green
}

# Step 3: Build the application
Write-Host ""
Write-Host "Step 3: Building the application..." -ForegroundColor Yellow
Write-Host "This may take several minutes..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Step 4: Create deployment package
Write-Host ""
Write-Host "Step 4: Creating deployment package..." -ForegroundColor Yellow

# Define files and folders to include
$includeItems = @(
    ".next",
    "public",
    "server.js",
    "package.json",
    "package-lock.json",
    "next.config.mjs",
    "next-i18next.config.js",
    ".env.production"
)

# Create deployment directory
$deployDir = "deployment-package"
if (Test-Path $deployDir) {
    Remove-Item -Path $deployDir -Recurse -Force
}
New-Item -ItemType Directory -Path $deployDir | Out-Null

# Copy items to deployment directory
foreach ($item in $includeItems) {
    if (Test-Path $item) {
        Write-Host "  Copying $item..." -ForegroundColor Gray
        if (Test-Path -Path $item -PathType Container) {
            Copy-Item -Path $item -Destination $deployDir -Recurse -Force
        } else {
            Copy-Item -Path $item -Destination $deployDir -Force
        }
    } else {
        Write-Host "  Warning: $item not found" -ForegroundColor Yellow
    }
}

# Create a README for deployment
@"
# Lancelot Next.js Deployment Instructions

## cPanel Setup Steps:

1. Upload this entire folder to your cPanel (NOT in public_html)
2. In cPanel, go to "Setup Node.js App"
3. Create a new application with:
   - Node.js version: 18.17 or higher
   - Application mode: Production
   - Application root: [path to this folder]
   - Application URL: [your domain]
   - Application startup file: server.js
   
4. Add environment variables from .env.production in cPanel
5. Click "Run NPM Install"
6. Start the application

## Important Notes:
- The app uses Next.js 15, which requires Node.js 18.17 or higher
- Make sure all environment variables are set correctly
- The server.js file is configured to work with cPanel
- Check the logs if the app doesn't start properly
"@ | Out-File -FilePath "$deployDir\DEPLOYMENT_README.txt" -Encoding UTF8

# Create the zip file
Write-Host ""
Write-Host "Step 5: Creating ZIP archive..." -ForegroundColor Yellow
$zipPath = "lancelot-nextjs-deployment.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Use Windows compression
Compress-Archive -Path "$deployDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Cleanup
Remove-Item -Path $deployDir -Recurse -Force

# Final instructions
Write-Host ""
Write-Host "=== Deployment Package Created Successfully! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Package location: $zipPath" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round((Get-Item $zipPath).Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Review and update .env.production with your actual values" -ForegroundColor White
Write-Host "2. Upload $zipPath to your cPanel" -ForegroundColor White
Write-Host "3. Extract it in a directory (NOT public_html)" -ForegroundColor White
Write-Host "4. Follow the instructions in DEPLOYMENT_README.txt" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Do not upload node_modules - they will be installed on the server!" -ForegroundColor Red

