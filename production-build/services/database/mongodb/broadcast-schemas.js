// MongoDB Schemas for Broadcast Operations

// Routing Page Template Schema
const RoutingPageTemplateSchema = {
  _id: "ObjectId",
  name: "string",
  category: "string", // sports, news, studio, remote
  controlType: "string", // mcr, remote, studio
  vendorType: "string", // magnum, vmix, unity, custom
  inputs: [
    {
      inputNumber: "number",
      inputName: "string",
      inputType: "string", // camera, liveu, satellite, playback, graphic
      defaultLabel: "string",
      capabilities: ["string"], // HD, 4K, HDR, etc.
      allowedSources: ["string"], // source types allowed
    }
  ],
  outputs: [
    {
      outputNumber: "number",
      outputName: "string",
      outputType: "string", // program, preview, aux, multiview
      destination: "string",
    }
  ],
  layout: {
    rows: "number",
    columns: "number",
    buttonLayout: [
      {
        position: { row: "number", col: "number" },
        inputNumber: "number",
        buttonStyle: {
          color: "string",
          icon: "string",
          size: "string", // small, medium, large
        }
      }
    ]
  },
  macros: [
    {
      name: "string",
      description: "string",
      commands: [
        {
          action: "string", // switch, transition, key, dsk
          params: "object"
        }
      ]
    }
  ],
  metadata: {
    createdBy: "string", // User UUID
    createdAt: "Date",
    updatedAt: "Date",
    version: "number",
    tags: ["string"]
  }
};

// Broadcast Event Template Schema
const BroadcastEventTemplateSchema = {
  _id: "ObjectId",
  name: "string",
  eventType: "string", // sports_live, news_bulletin, studio_show, remote_feed
  defaultDuration: "number", // minutes
  requiredRoles: [
    {
      role: "string", // videographer, producer, director, etc.
      quantity: "number",
      optional: "boolean",
      skills: ["string"] // specific skills required
    }
  ],
  requiredEquipment: [
    {
      equipmentType: "string",
      quantity: "number",
      specifications: "object", // min specs required
      alternatives: ["string"] // alternative equipment types
    }
  ],
  routingRequirements: {
    minCameras: "number",
    minAudioChannels: "number",
    requiresGraphics: "boolean",
    requiresPlayback: "boolean",
    specialRequirements: ["string"]
  },
  checklistTemplate: [
    {
      phase: "string", // pre_event, setup, live, teardown
      items: [
        {
          task: "string",
          responsible: "string", // role responsible
          timeOffset: "number", // minutes before/after event start
          critical: "boolean",
          dependencies: ["string"] // other task IDs
        }
      ]
    }
  ],
  metadata: {
    department: "string", // Department UUID
    createdBy: "string",
    createdAt: "Date",
    lastUsed: "Date",
    usageCount: "number"
  }
};

// MCR Automation Rules Schema
const MCRAutomationRuleSchema = {
  _id: "ObjectId",
  name: "string",
  description: "string",
  isActive: "boolean",
  trigger: {
    type: "string", // calendar_event, time_based, manual, email, api
    conditions: {
      // For calendar events
      calendarPattern: "string", // regex for event titles
      leadTime: "number", // minutes before event
      
      // For time-based
      schedule: {
        type: "string", // daily, weekly, monthly
        time: "string", // HH:MM
        daysOfWeek: ["number"], // 0-6
        dayOfMonth: "number"
      },
      
      // For email triggers
      emailPattern: {
        from: "string", // email regex
        subject: "string", // subject regex
        bodyContains: ["string"] // keywords
      }
    }
  },
  actions: [
    {
      type: "string", // create_event, assign_resources, send_notification, update_routing
      params: {
        // For create_event
        eventTemplate: "string", // template ID
        titlePattern: "string", // how to extract title
        durationPattern: "string", // how to extract duration
        
        // For assign_resources
        autoAssign: "boolean",
        priorityRules: ["object"],
        
        // For notifications
        recipients: ["string"], // roles or user IDs
        messageTemplate: "string"
      },
      errorHandling: {
        retryCount: "number",
        fallbackAction: "string",
        notifyOnError: ["string"] // user IDs to notify
      }
    }
  ],
  metadata: {
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date",
    lastTriggered: "Date",
    triggerCount: "number",
    successCount: "number",
    errorCount: "number"
  }
};

// Vendor Integration Configuration Schema
const VendorIntegrationConfigSchema = {
  _id: "ObjectId",
  vendor: "string", // liveu, vmix, magnum, unity
  connectionType: "string", // api, tcp, websocket, serial
  endpoints: {
    base: "string",
    auth: "string",
    status: "string",
    control: "string",
    events: "string"
  },
  authentication: {
    method: "string", // api_key, oauth2, basic, custom
    credentials: {
      // Encrypted in database
      apiKey: "string",
      username: "string",
      password: "string",
      clientId: "string",
      clientSecret: "string"
    },
    tokenRefresh: {
      enabled: "boolean",
      interval: "number" // seconds
    }
  },
  dataMapping: {
    // How to map vendor data to our schema
    events: {
      id: "string", // JSON path
      title: "string",
      startTime: "string",
      status: "string",
      customFields: "object"
    },
    equipment: {
      id: "string",
      name: "string",
      status: "string",
      location: "string"
    }
  },
  pollingConfig: {
    enabled: "boolean",
    interval: "number", // seconds
    endpoints: ["string"],
    timeout: "number" // seconds
  },
  webhookConfig: {
    enabled: "boolean",
    secret: "string",
    events: ["string"], // event types to listen for
    retryPolicy: {
      maxRetries: "number",
      backoffMultiplier: "number"
    }
  },
  errorHandling: {
    maxConsecutiveErrors: "number",
    errorThreshold: "number", // errors per hour
    notificationRecipients: ["string"],
    autoDisable: "boolean"
  },
  metadata: {
    installedBy: "string",
    installedAt: "Date",
    lastModified: "Date",
    version: "string",
    isActive: "boolean"
  }
};

// Equipment Barcode Configuration Schema
const EquipmentBarcodeConfigSchema = {
  _id: "ObjectId",
  barcodeFormat: "string", // CODE128, QR, EAN13, etc.
  prefixRules: [
    {
      prefix: "string",
      equipmentType: "string",
      department: "string",
      autoActions: [
        {
          trigger: "string", // scan_in, scan_out
          action: "string", // update_status, create_maintenance, notify
          params: "object"
        }
      ]
    }
  ],
  scanLocations: [
    {
      locationId: "string",
      locationName: "string",
      locationType: "string", // warehouse, studio, mcr, field
      allowedActions: ["string"], // check_in, check_out, transfer
      requiresAuth: "boolean",
      requiresReason: ["string"] // which actions need reason
    }
  ],
  labelTemplate: {
    format: "string", // ZPL, EPL, PDF
    size: { width: "number", height: "number" },
    elements: [
      {
        type: "string", // barcode, text, logo, qr
        position: { x: "number", y: "number" },
        data: "string", // field name or static text
        style: "object"
      }
    ]
  },
  validationRules: [
    {
      field: "string",
      rule: "string", // required, format, range
      params: "object",
      errorMessage: {
        en: "string",
        he: "string"
      }
    }
  ],
  metadata: {
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date"
  }
};

// Satellite Booking Template Schema
const SatelliteBookingTemplateSchema = {
  _id: "ObjectId",
  provider: "string", // satellite provider name
  satelliteName: "string",
  coverageArea: {
    type: "string", // regional, global, spot_beam
    regions: ["string"],
    coordinates: ["object"] // GeoJSON
  },
  technicalSpecs: {
    band: "string", // C, Ku, Ka
    uplinkFrequency: {
      min: "number",
      max: "number",
      unit: "string" // MHz, GHz
    },
    downlinkFrequency: {
      min: "number",
      max: "number",
      unit: "string"
    },
    polarization: ["string"], // H, V, LHCP, RHCP
    modulation: ["string"], // QPSK, 8PSK, 16APSK
    fec: ["string"], // 1/2, 2/3, 3/4, 5/6, 7/8
    dataRates: {
      min: "number",
      max: "number",
      unit: "string" // Mbps
    }
  },
  bookingRequirements: {
    minLeadTime: "number", // hours
    minDuration: "number", // minutes
    increments: "number", // booking time increments in minutes
    maxAdvanceBooking: "number", // days
    requiredInfo: [
      {
        field: "string",
        type: "string",
        required: "boolean",
        validation: "string"
      }
    ]
  },
  pricing: {
    currency: "string",
    baseRate: "number", // per hour
    peakMultiplier: "number",
    peakHours: [
      {
        startTime: "string",
        endTime: "string",
        daysOfWeek: ["number"]
      }
    ],
    minimumCharge: "number"
  },
  availabilityCalendar: {
    updateFrequency: "number", // minutes
    apiEndpoint: "string",
    authRequired: "boolean"
  },
  metadata: {
    addedBy: "string",
    addedAt: "Date",
    lastUpdated: "Date",
    isActive: "boolean"
  }
};

// Export all schemas
// NOTE: These schemas have been migrated to TypeScript/Mongoose models
// See: services/api-gateway/src/models/broadcast-templates.models.ts
module.exports = {
  RoutingPageTemplateSchema,
  BroadcastEventTemplateSchema,
  MCRAutomationRuleSchema,
  VendorIntegrationConfigSchema,
  EquipmentBarcodeConfigSchema,
  SatelliteBookingTemplateSchema
}; 