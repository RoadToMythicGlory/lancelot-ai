#!/bin/bash
# Bash script to prepare Lancelot app for production deployment
# This script creates a production-ready build that can be uploaded to /opt/lancelot

echo -e "\033[0;36m🚀 Preparing Lancelot for Production Deployment\033[0m"
echo -e "\033[0;36m================================================\033[0m"

# Exit on error
set -e

# Clean previous build
echo -e "\n\033[0;33m📦 Cleaning previous build...\033[0m"
rm -rf ./production-build

# Create production build directory
echo -e "\033[0;33m📁 Creating production build directory...\033[0m"
mkdir -p ./production-build

# Copy necessary files and directories
echo -e "\n\033[0;33m📋 Copying application files...\033[0m"
items_to_copy=(
    "apps"
    "services"
    "packages"
    "config"
    "deploy"
    "k8s"
    "docker-compose.yml"
    "Dockerfile"
    "Dockerfile.production"
    "turbo.json"
    "package.json"
    "package-lock.json"
    "production.env"
)

for item in "${items_to_copy[@]}"; do
    if [ -e "$item" ]; then
        echo -e "  \033[0;90m- Copying $item\033[0m"
        cp -r "$item" "./production-build/"
    fi
done

# Create .env files for production
echo -e "\n\033[0;33m🔧 Creating production environment files...\033[0m"

# Create web app .env.production
cat > "./production-build/apps/web/.env.production" << 'EOF'
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
EOF

# Copy to .env.local as well
cp "./production-build/apps/web/.env.production" "./production-build/apps/web/.env.local"

# Create API Gateway .env
cat > "./production-build/services/api-gateway/.env" << 'EOF'
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
EOF

# Update docker-compose.yml for production
echo -e "\n\033[0;33m🐳 Updating Docker Compose configuration...\033[0m"
sed -i 's|NEXT_PUBLIC_GRAPHQL_URL:-http://localhost:4000/graphql|NEXT_PUBLIC_GRAPHQL_URL:-https://api.lanceloterp.io/graphql|g' "./production-build/docker-compose.yml"
sed -i 's|NEXT_PUBLIC_WS_URL:-ws://localhost:4000/graphql|NEXT_PUBLIC_WS_URL:-wss://api.lanceloterp.io/graphql|g' "./production-build/docker-compose.yml"

# Create deployment script
echo -e "\n\033[0;33m📝 Creating deployment script...\033[0m"
cat > "./production-build/deploy.sh" << 'DEPLOY_SCRIPT'
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

# Copy files (assuming you've uploaded them to a temp directory)
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
DEPLOY_SCRIPT

chmod +x "./production-build/deploy.sh"

# Create README for deployment
echo -e "\n\033[0;33m📄 Creating deployment README...\033[0m"
cat > "./production-build/DEPLOYMENT_README.md" << 'EOF'
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
EOF

# Create production docker-compose override
echo -e "\n\033[0;33m🐳 Creating production Docker Compose override...\033[0m"
cat > "./production-build/docker-compose.production.yml" << 'EOF'
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
EOF

echo -e "\n\033[0;32m✅ Production build prepared successfully!\033[0m"
echo -e "\033[0;32m📁 Build location: ./production-build/\033[0m"
echo -e "\n\033[0;33m⚠️  IMPORTANT: Before deploying:\033[0m"
echo -e "\033[0;33m  1. Update MongoDB credentials in services/api-gateway/.env\033[0m"
echo -e "\033[0;33m  2. Ensure your VPS has Docker and Docker Compose installed\033[0m"
echo -e "\033[0;33m  3. Configure SSL certificates for your domains\033[0m"
echo -e "\033[0;33m  4. Read DEPLOYMENT_README.md for detailed instructions\033[0m"
