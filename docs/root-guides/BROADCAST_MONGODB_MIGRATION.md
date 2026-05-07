# Broadcast System MongoDB Migration

## Overview
The Broadcast Schedule system has been migrated from PostgreSQL to MongoDB for better flexibility and performance with document-based data.

## What Changed

### 1. Database Layer
- **Before**: PostgreSQL relational database with multiple joined tables
- **After**: MongoDB document database with embedded documents and references

### 2. Data Models
Created MongoDB schemas for:

#### Core Broadcast Models (`/src/models/broadcast.models.ts`)
- `BroadcastEvent` - Main broadcast event documents with all enhanced fields
- `EventStaffAssignment` - Staff assignments for events
- `RoutingConfig` - Routing configurations
- `RoutingSource` - Routing sources
- `SatelliteSchedule` - Satellite booking schedules

#### Template & Configuration Models (`/src/models/broadcast-templates.models.ts`)
- `RoutingPageTemplate` - MCR routing page configurations for different control types (MCR, remote, studio)
- `BroadcastEventTemplate` - Templates for different broadcast types (sports, news, studio shows, remote feeds)
- `MCRAutomationRule` - Automation rules for MCR operations
- `VendorIntegrationConfig` - External vendor configurations (LiveU, vMix, Magnum, Unity)
- `EquipmentBarcodeConfig` - Equipment barcode scanning configurations
- `SatelliteBookingTemplate` - Satellite provider booking templates

### 3. API Gateway
- Added MongoDB connection management (`/src/config/mongodb.ts`)
- Created Mongoose models for core broadcast data (`/src/models/broadcast.models.ts`)
- Created Mongoose models for templates and configurations (`/src/models/broadcast-templates.models.ts`)
- Updated broadcast resolvers to use MongoDB (`/src/resolvers/broadcast.ts`)
- Updated enhanced broadcast resolvers (`/src/resolvers/broadcast-enhanced.ts`)
- Added MongoDB initialization on server startup

### 4. Docker Configuration
- MongoDB is already configured in docker-compose.yml
- Added `MONGODB_URL` environment variable to api-gateway service
- Added mongodb dependency to api-gateway service

## Migration Process

### Prerequisites
1. Ensure both PostgreSQL and MongoDB are running
2. Ensure existing data is backed up

### Run Migration

1. **Using Docker:**
```bash
docker-compose exec api-gateway npm run migrate:broadcast
```

2. **Local Development:**
```bash
cd services/api-gateway
npm run migrate:broadcast
```

### What the Migration Does
1. Connects to both PostgreSQL and MongoDB
2. Reads all broadcast_events and related data from PostgreSQL
3. Transforms the data to match MongoDB schemas
4. Maintains referential integrity by mapping PostgreSQL UUIDs to MongoDB ObjectIds
5. Inserts all data into MongoDB collections

### Post-Migration Verification

1. **Check MongoDB data:**
```bash
docker-compose exec mongodb mongosh -u LancelotERP_DB -p <MONGO_PASSWORD> --authenticationDatabase admin
use lancelot
db.broadcastevents.countDocuments()
db.eventstaffassignments.countDocuments()
db.routingpagetemplates.countDocuments()
db.mcrautomationrules.countDocuments()
```

2. **Test GraphQL endpoints:**
- Query broadcast events: `/graphql` → `broadcastEvents`
- Create new event: `/graphql` → `createBroadcastEvent`
- Update event: `/graphql` → `updateBroadcastEvent`

## Benefits of MongoDB

1. **Flexible Schema**: Easy to add fields without migrations
2. **Better Performance**: No complex joins for related data
3. **Document Structure**: Natural fit for broadcast event data with nested information
4. **Scalability**: Horizontal scaling capabilities
5. **Real-time Updates**: Better integration with change streams for real-time features

## Rollback Plan

If needed to rollback:
1. Stop the api-gateway service
2. Restore the original resolver files from git
3. Remove MongoDB connection from index.ts
4. Restart the service

The PostgreSQL data remains intact and can be re-enabled by reverting the code changes.