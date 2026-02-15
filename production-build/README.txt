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
