# Production Seed Instructions for mcr@example.com

## Overview
This document provides instructions for seeding the user `mcr@example.com` as a Department Admin to the production MongoDB database.

## Prerequisites
1. Access to production MongoDB server
2. MongoDB connection credentials
3. Node.js installed on your machine
4. Access to the production environment

## Setup Steps

### 1. Navigate to the API Gateway Directory
```bash
cd services/api-gateway
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create Production Environment File
Create a `.env.production` file in the api-gateway directory with the following content:

```env
# MongoDB VPS Configuration
MONGODB_URL=mongodb://LancelotERP_DB:YOUR_PASSWORD@YOUR_VPS_IP:27017/lancelot?authSource=admin
# Or use individual variables:
MONGO_HOST=YOUR_VPS_IP
MONGO_PORT=27017
MONGO_USERNAME=LancelotERP_DB
MONGO_PASSWORD=YOUR_SECURE_PASSWORD
MONGO_DATABASE=lancelot

# Node Environment
NODE_ENV=production
```

Replace the placeholders with your actual production values:
- `YOUR_PASSWORD`: Your MongoDB password
- `YOUR_VPS_IP`: Your VPS IP address or domain

### 4. Run the Production Seed Script

#### Option 1: Using npm script (recommended)
```bash
NODE_ENV=production npx ts-node src/scripts/seed-production-mcr-admin.ts
```

#### Option 2: Using direct node execution
```bash
NODE_ENV=production node -r ts-node/register src/scripts/seed-production-mcr-admin.ts
```

### 5. Follow the Interactive Prompts
1. The script will ask you to confirm that you want to seed to PRODUCTION
2. Type `YES` (in capital letters) to confirm
3. If the user already exists, you'll be asked if you want to UPDATE it
4. Type `UPDATE` (in capital letters) to confirm the update

### 6. Save the Generated Credentials
The script will output credentials in the following format:
```
============================================================
PRODUCTION USER CREDENTIALS - KEEP SECURE!
============================================================
Email: mcr@example.com
Password: [GENERATED_SECURE_PASSWORD]
Role: DEPARTMENT_ADMIN
Departments: MCR (all sub-departments)
============================================================
```

**IMPORTANT**: 
- Save these credentials immediately
- The password is generated randomly and won't be shown again
- Share the credentials securely with the user

## User Details
The seeded user will have the following configuration:
- **Email**: mcr@example.com
- **System Role**: DEPARTMENT_ADMIN
- **Departments**: 
  - MCR-General (MCR) - with roles: MCR Supervisor, Department Admin
  - MCR-Playout (Playout) - with role: Department Admin
  - MCR-Ingest (Ingest) - with role: Department Admin

## Security Notes
1. The script includes safety checks to prevent accidental execution in development
2. Always double-check your MongoDB connection string before running
3. The generated password is cryptographically secure (16 characters with mixed case, numbers, and symbols)
4. Passwords are hashed using bcrypt before storage

## Troubleshooting

### Connection Failed
- Verify your MongoDB connection string in `.env.production`
- Ensure your IP is whitelisted in MongoDB Atlas (if using Atlas)
- Check network connectivity to the MongoDB server

### User Already Exists
- The script will detect if the user exists
- You can choose to UPDATE the existing user with new credentials

### Permission Denied
- Ensure the MongoDB user has write permissions to the `lancelot` database
- Verify the authSource is set correctly (usually `admin`)

## Post-Seeding Steps
1. Test the login with the generated credentials
2. Verify the user has the correct permissions in the application
3. Delete the `.env.production` file or secure it properly
4. Monitor the user's first login to ensure everything works correctly

