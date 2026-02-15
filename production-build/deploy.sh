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