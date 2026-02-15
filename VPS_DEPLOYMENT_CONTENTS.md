# Lancelot VPS Deployment Package Contents

## Package Information
- **File:** lancelot-vps-deployment.zip
- **Size:** 0.77 MB
- **Total Files:** 204 files
- **Created:** October 5, 2025
- **Updated:** With production configurations for api.lanceloterp.io

## What's Included

### Root Level Files
- `package.json` - Root package configuration
- `package-lock.json` - Dependency lock file
- `turbo.json` - Monorepo configuration
- `docker-compose.yml` - Docker orchestration
- `Dockerfile` & `Dockerfile.production` - Container definitions
- `production-config.js` - Production-specific configurations
- `README.md` - Deployment instructions
- `deploy.sh` - Deployment automation script
- `ecosystem.config.js` - PM2 configuration (includes Excel parser service)

### Web Application (`/apps/web/`)
- All source code from `/src/` directory
  - React components
  - GraphQL queries and mutations
  - Contexts and hooks
  - Utilities and configurations
- Public assets (`/public/`)
- Configuration files:
  - `package.json` & `package-lock.json`
  - `next.config.mjs` - Next.js configuration
  - `tsconfig.json` - TypeScript configuration
  - `tailwind.config.js` - Tailwind CSS
  - `postcss.config.js` - PostCSS configuration
  - `server.js` - Custom server
- `.env.example` - Environment variable template (configured for api.lanceloterp.io)

### API Gateway (`/services/api-gateway/`)
- All source code from `/src/` directory
  - GraphQL resolvers
  - Data models
  - Middleware
  - Services and utilities
- Configuration files:
  - `package.json` & `package-lock.json`
  - `tsconfig.json` - TypeScript configuration
  - `jest.config.js` - Test configuration
  - `server.js` - Server entry point
- `.env.example` - Environment variable template

### Database Scripts (`/services/database/mongodb/`)
- MongoDB schema definitions
- Database initialization scripts

### Excel Parser Service (`/services/excel-parser/`)
- Source code for Excel file parsing
- Package configuration files

### Configuration (`/config/`)
- Prometheus monitoring configuration (if applicable)

## What's NOT Included
- `node_modules/` directories (will be installed on VPS)
- Development scripts and tools
- Test files and test data
- Local environment files (`.env`, `.env.local`)
- Build artifacts and compiled code
- Temporary files and caches
- Documentation not needed for deployment

## Production-Specific Configurations

This deployment package includes production-ready configurations:

1. **API URLs**: All configured to use `api.lanceloterp.io`
2. **CORS Settings**: Properly configured for production domains
3. **Excel Parser**: Included as a backend service running on port 4001
4. **SSL/HTTPS**: Nginx configuration includes HTTPS setup
5. **WebSocket**: Configured for `wss://api.lanceloterp.io`

## Deployment Process

1. **Upload** the zip to your VPS
2. **Extract** the contents
3. **Install** dependencies with npm
4. **Configure** environment variables (update MongoDB credentials)
5. **Build** the applications
6. **Start** all services with PM2 (includes Excel parser)

The package is optimized for production deployment while keeping the size minimal by excluding all development dependencies and build artifacts that can be regenerated on the target server.

## Important Notes

- The Excel parser service runs as part of the backend on port 4001
- All API requests are configured for `api.lanceloterp.io`
- These production configurations do NOT affect your local development environment
- Remember to update SSL certificate paths in the Nginx configuration
