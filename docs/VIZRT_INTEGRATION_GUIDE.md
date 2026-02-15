# Lancelot Vizrt Graphics Integration Guide

## Overview

The Lancelot Vizrt integration provides a comprehensive solution for managing and triggering broadcast graphics through Vizrt systems (Arc, PDS, and Engine). This integration is designed as a secure, operator-friendly system that can be easily added to existing broadcast workflows without modifying core functionality.

## Architecture

### Backend Components

1. **GraphQL Schema** (`services/api-gateway/src/schema/vizrt.graphql`)
   - Defines types for configurations, templates, and CG operations
   - Supports all three Vizrt modes (Arc, PDS, Engine)

2. **Resolvers** (`services/api-gateway/src/resolvers/vizrt.ts`)
   - Handles CRUD operations for configurations and templates
   - Manages CG triggering with proper authentication
   - Provides preview capabilities

3. **Models** (`services/api-gateway/src/models/vizrt.models.ts`)
   - MongoDB schemas for configurations and templates
   - Type definitions and enums

### Frontend Components

1. **VizrtDashboard** - Main control interface
2. **VizrtConfigPanel** - Configuration management
3. **CGTemplateManager** - Template creation and editing
4. **CGControlPanel** - Live CG triggering with preview
5. **VizrtIntegrationButton** - Drop-in component for existing interfaces

## Setup Instructions

### 1. Backend Setup

#### Install Dependencies
```bash
cd services/api-gateway
npm install
```

#### Add to Schema
Add the Vizrt schema to your main GraphQL schema:
```graphql
# In your main schema file
#import "src/schema/vizrt.graphql"
```

#### Register Resolvers
```typescript
// In your resolver index
import { vizrtResolvers } from './vizrt';

export const resolvers = {
  // ... existing resolvers
  ...vizrtResolvers
};
```

#### Update Models Index
```typescript
// In src/models/index.ts
export * from './vizrt.models';
```

#### Seed Sample Data
```bash
npm run ts-node src/scripts/seed-vizrt-data.ts
```

### 2. Frontend Setup

#### Install Additional Dependencies
```bash
cd apps/web
npm install @ant-design/icons
```

#### Add to GraphQL Queries
The Vizrt queries are already defined in `src/graphql/vizrt-queries.ts` and can be imported as needed.

### 3. Integration Options

#### Option 1: Standalone Dashboard
```tsx
import VizrtDashboard from '@/components/broadcast/VizrtDashboard';

function BroadcastControlRoom() {
  return (
    <div>
      {/* Your existing content */}
      <VizrtDashboard eventId="event-123" segmentId="segment-456" />
    </div>
  );
}
```

#### Option 2: Integration Button (Recommended)
```tsx
import VizrtIntegrationButton from '@/components/broadcast/VizrtIntegrationButton';

function RundownSegment({ segment, eventId }) {
  return (
    <div className="segment-row">
      {/* Existing segment content */}
      <VizrtIntegrationButton
        eventId={eventId}
        segmentId={segment.id}
        size="small"
        variant="trigger"
      />
    </div>
  );
}
```

#### Option 3: Custom Integration
```tsx
import { useState } from 'react';
import CGControlPanel from '@/components/broadcast/CGControlPanel';

function CustomComponent() {
  const [cgVisible, setCgVisible] = useState(false);
  
  return (
    <>
      <button onClick={() => setCgVisible(true)}>
        Trigger Graphics
      </button>
      
      <CGControlPanel
        visible={cgVisible}
        onClose={() => setCgVisible(false)}
        eventId="event-123"
        initialTemplate="news-lower-third"
        initialFields={{ name: "John Doe", title: "Reporter" }}
      />
    </>
  );
}
```

## Configuration

### Vizrt System Configuration

1. **Open Vizrt Configuration Panel**
   - Click "Configurations" button in Vizrt Dashboard
   - Or use the VizrtConfigPanel component directly

2. **Create Configuration**
   - Name: Descriptive name for the configuration
   - Mode: Choose Arc, PDS, or Engine
   - Base URL: Your Vizrt system endpoint
   - API Key: Optional authentication token
   - Headers: Additional HTTP headers (JSON format)

### Template Management

1. **Create Templates**
   - Use the CGTemplateManager component
   - Define template fields with types and validation
   - Set up categories for organization

2. **Template Field Types**
   - TEXT: Simple text input
   - NUMBER: Numeric input
   - BOOLEAN: Checkbox/switch
   - SELECT: Dropdown with predefined options
   - COLOR: Color picker
   - IMAGE/VIDEO: File path or URL input

## Security Features

### Authentication & Authorization
- All operations require proper user permissions
- Permissions: `VIZRT_READ`, `VIZRT_TRIGGER`, `VIZRT_ADMIN`
- API keys and sensitive data stored securely on backend

### Audit Logging
- All CG triggers are logged with user, timestamp, and context
- Failed operations are tracked for troubleshooting

### Network Security
- Client never directly communicates with Vizrt systems
- All requests go through authenticated GraphQL API
- Configurable request timeouts and retry logic

## Usage Workflows

### News Production Workflow

1. **Pre-Production**
   - Configure Vizrt systems
   - Create news-specific templates (lower thirds, breaking news, etc.)
   - Test connectivity and preview functionality

2. **Live Production**
   - Use CGControlPanel for real-time graphics
   - Preview graphics before triggering
   - Quick access through integration buttons

3. **Post-Production**
   - Review triggered graphics logs
   - Update templates based on feedback

### Sports Production Workflow

1. **Setup**
   - Configure sports-specific templates (score bugs, player stats)
   - Set up team logos and colors
   - Create quick-trigger presets

2. **Live Event**
   - Real-time score updates
   - Player information graphics
   - Statistics overlays

## Troubleshooting

### Common Issues

#### "No active Vizrt configuration found"
- Ensure at least one configuration is marked as active
- Check configuration connectivity

#### "Template not found"
- Verify template exists and is not deleted
- Check template ID in requests

#### "Failed to trigger CG"
- Check Vizrt system connectivity
- Verify API credentials
- Review network configuration

#### Preview not working
- Ensure preview URLs are configured in Vizrt system
- Check CORS settings if using web-based previews

### Debug Mode
Enable debug logging by setting environment variable:
```bash
VIZRT_DEBUG=true
```

## API Reference

### GraphQL Queries
```graphql
# Get all configurations
query GetVizrtConfigs {
  vizrtConfigs {
    id
    name
    mode
    baseUrl
    isActive
  }
}

# Get templates by category
query GetVizrtTemplates($category: VizrtTemplateCategory) {
  vizrtTemplates(category: $category) {
    id
    name
    description
    category
    fields {
      key
      label
      type
      required
      defaultValue
      options
    }
  }
}
```

### GraphQL Mutations
```graphql
# Trigger CG
mutation TriggerCG($input: CGTriggerInput!) {
  triggerCG(input: $input) {
    success
    message
    previewUrl
    triggerId
  }
}

# Preview CG
mutation PreviewCG($input: CGTriggerInput!) {
  previewCG(input: $input) {
    success
    message
    previewUrl
  }
}
```

## Performance Considerations

- Templates are cached on first load
- Configurations are cached until modified
- Preview generation may take 1-3 seconds
- CG triggering typically completes in <500ms

## Roadmap

### Planned Features
- [ ] Batch CG operations
- [ ] Scheduled graphics triggers
- [ ] Advanced template validation
- [ ] Integration with broadcast automation systems
- [ ] Real-time status monitoring
- [ ] Template versioning
- [ ] Multi-language support for graphics

### Potential Integrations
- [ ] NRCS systems integration
- [ ] Newsroom automation
- [ ] Social media graphics export
- [ ] Archive and playback systems

## Support

For technical support or feature requests:
1. Check this documentation first
2. Review GraphQL schema and resolver code
3. Enable debug logging for detailed error information
4. Contact the development team with specific error messages and context

## License

This Vizrt integration is part of the Lancelot broadcast management system and follows the same licensing terms as the main project.
