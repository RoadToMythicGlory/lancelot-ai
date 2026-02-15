#!/bin/bash

# Bash script to prepare Next.js app for cPanel deployment
# Run this script from the apps/web directory

echo -e "\033[36m=== Lancelot Next.js Deployment Preparation ===\033[0m"
echo ""

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo -e "\033[31mERROR: Please run this script from the apps/web directory!\033[0m"
    exit 1
fi

# Step 1: Install dependencies
echo -e "\033[33mStep 1: Installing dependencies...\033[0m"
npm install
if [ $? -ne 0 ]; then
    echo -e "\033[31mERROR: Failed to install dependencies!\033[0m"
    exit 1
fi

# Step 2: Create production environment file
echo ""
echo -e "\033[33mStep 2: Setting up production environment...\033[0m"
if [ ! -f ".env.production" ]; then
    echo -e "\033[32mCreating .env.production file template...\033[0m"
    cat > .env.production << 'EOF'
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
EOF
    echo -e "\033[33mCreated .env.production - Please update it with your actual values!\033[0m"
else
    echo -e "\033[32m.env.production already exists\033[0m"
fi

# Step 3: Build the application
echo ""
echo -e "\033[33mStep 3: Building the application...\033[0m"
echo -e "\033[90mThis may take several minutes...\033[0m"
npm run build
if [ $? -ne 0 ]; then
    echo -e "\033[31mERROR: Build failed!\033[0m"
    exit 1
fi

# Step 4: Create deployment package
echo ""
echo -e "\033[33mStep 4: Creating deployment package...\033[0m"

# Define files and folders to include
includeItems=(
    ".next"
    "public"
    "server.js"
    "package.json"
    "package-lock.json"
    "next.config.mjs"
    "next-i18next.config.js"
    ".env.production"
)

# Create deployment directory
deployDir="deployment-package"
if [ -d "$deployDir" ]; then
    rm -rf "$deployDir"
fi
mkdir -p "$deployDir"

# Copy items to deployment directory
for item in "${includeItems[@]}"; do
    if [ -e "$item" ]; then
        echo -e "\033[90m  Copying $item...\033[0m"
        cp -r "$item" "$deployDir/"
    else
        echo -e "\033[33m  Warning: $item not found\033[0m"
    fi
done

# Create a README for deployment
cat > "$deployDir/DEPLOYMENT_README.txt" << 'EOF'
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
EOF

# Create the zip file
echo ""
echo -e "\033[33mStep 5: Creating ZIP archive...\033[0m"
zipPath="lancelot-nextjs-deployment.zip"
if [ -f "$zipPath" ]; then
    rm "$zipPath"
fi

# Create zip archive
cd "$deployDir"
zip -r "../$zipPath" . -q
cd ..

# Cleanup
rm -rf "$deployDir"

# Get file size
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    fileSize=$(stat -f%z "$zipPath")
else
    # Linux
    fileSize=$(stat -c%s "$zipPath")
fi
fileSizeMB=$(echo "scale=2; $fileSize / 1048576" | bc)

# Final instructions
echo ""
echo -e "\033[32m=== Deployment Package Created Successfully! ===\033[0m"
echo ""
echo -e "\033[36mPackage location: $zipPath\033[0m"
echo -e "\033[36mSize: ${fileSizeMB} MB\033[0m"
echo ""
echo -e "\033[33mNext steps:\033[0m"
echo -e "\033[37m1. Review and update .env.production with your actual values\033[0m"
echo -e "\033[37m2. Upload $zipPath to your cPanel\033[0m"
echo -e "\033[37m3. Extract it in a directory (NOT public_html)\033[0m"
echo -e "\033[37m4. Follow the instructions in DEPLOYMENT_README.txt\033[0m"
echo ""
echo -e "\033[31mIMPORTANT: Do not upload node_modules - they will be installed on the server!\033[0m"

