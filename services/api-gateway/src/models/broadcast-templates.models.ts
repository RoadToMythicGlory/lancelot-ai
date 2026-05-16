import mongoose, { Schema, Document } from 'mongoose';

// MongoDB models for broadcast templates and configurations

// ==================== ROUTING PAGE TEMPLATE ====================
export interface IRoutingPageTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  category: 'sports' | 'news' | 'studio' | 'remote';
  controlType: 'mcr' | 'remote' | 'studio';
  vendorType: 'magnum' | 'vmix' | 'unity' | 'custom';
  inputs: Array<{
    inputNumber: number;
    inputName: string;
    inputType: 'camera' | 'liveu' | 'satellite' | 'playback' | 'graphic';
    defaultLabel: string;
    capabilities: string[]; // HD, 4K, HDR, etc.
    allowedSources: string[];
  }>;
  outputs: Array<{
    outputNumber: number;
    outputName: string;
    outputType: 'program' | 'preview' | 'aux' | 'multiview';
    destination: string;
  }>;
  layout: {
    rows: number;
    columns: number;
    buttonLayout: Array<{
      position: { row: number; col: number };
      inputNumber: number;
      buttonStyle: {
        color: string;
        icon: string;
        size: 'small' | 'medium' | 'large';
      };
    }>;
  };
  macros: Array<{
    name: string;
    description: string;
    commands: Array<{
      action: 'switch' | 'transition' | 'key' | 'dsk';
      params: any;
    }>;
  }>;
  metadata: {
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    tags: string[];
  };
}

const routingPageTemplateSchema = new Schema<IRoutingPageTemplate>({
  name: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['sports', 'news', 'studio', 'remote'],
    required: true 
  },
  controlType: { 
    type: String, 
    enum: ['mcr', 'remote', 'studio'],
    required: true 
  },
  vendorType: { 
    type: String, 
    enum: ['magnum', 'vmix', 'unity', 'custom'],
    required: true 
  },
  inputs: [{
    inputNumber: { type: Number, required: true },
    inputName: { type: String, required: true },
    inputType: { 
      type: String, 
      enum: ['camera', 'liveu', 'satellite', 'playback', 'graphic'],
      required: true 
    },
    defaultLabel: String,
    capabilities: [String],
    allowedSources: [String]
  }],
  outputs: [{
    outputNumber: { type: Number, required: true },
    outputName: { type: String, required: true },
    outputType: { 
      type: String, 
      enum: ['program', 'preview', 'aux', 'multiview'],
      required: true 
    },
    destination: String
  }],
  layout: {
    rows: { type: Number, required: true },
    columns: { type: Number, required: true },
    buttonLayout: [{
      position: {
        row: { type: Number, required: true },
        col: { type: Number, required: true }
      },
      inputNumber: { type: Number, required: true },
      buttonStyle: {
        color: String,
        icon: String,
        size: { type: String, enum: ['small', 'medium', 'large'] }
      }
    }]
  },
  macros: [{
    name: { type: String, required: true },
    description: String,
    commands: [{
      action: { 
        type: String, 
        enum: ['switch', 'transition', 'key', 'dsk'],
        required: true 
      },
      params: Schema.Types.Mixed
    }]
  }],
  metadata: {
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    tags: [String]
  }
});

// ==================== BROADCAST EVENT TEMPLATE ====================
export interface IBroadcastEventTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  eventType: 'sports_live' | 'news_bulletin' | 'studio_show' | 'remote_feed';
  defaultDuration: number; // minutes
  requiredRoles: Array<{
    role: string;
    quantity: number;
    optional: boolean;
    skills: string[];
  }>;
  requiredEquipment: Array<{
    equipmentType: string;
    quantity: number;
    specifications: any;
    alternatives: string[];
  }>;
  routingRequirements: {
    minCameras: number;
    minAudioChannels: number;
    requiresGraphics: boolean;
    requiresPlayback: boolean;
    specialRequirements: string[];
  };
  checklistTemplate: Array<{
    phase: 'pre_event' | 'setup' | 'live' | 'teardown';
    items: Array<{
      task: string;
      responsible: string;
      timeOffset: number;
      critical: boolean;
      dependencies: string[];
    }>;
  }>;
  metadata: {
    department: string;
    createdBy: string;
    createdAt: Date;
    lastUsed: Date;
    usageCount: number;
  };
}

const broadcastEventTemplateSchema = new Schema<IBroadcastEventTemplate>({
  name: { type: String, required: true },
  eventType: { 
    type: String, 
    enum: ['sports_live', 'news_bulletin', 'studio_show', 'remote_feed'],
    required: true 
  },
  defaultDuration: { type: Number, required: true },
  requiredRoles: [{
    role: { type: String, required: true },
    quantity: { type: Number, required: true },
    optional: { type: Boolean, default: false },
    skills: [String]
  }],
  requiredEquipment: [{
    equipmentType: { type: String, required: true },
    quantity: { type: Number, required: true },
    specifications: Schema.Types.Mixed,
    alternatives: [String]
  }],
  routingRequirements: {
    minCameras: Number,
    minAudioChannels: Number,
    requiresGraphics: Boolean,
    requiresPlayback: Boolean,
    specialRequirements: [String]
  },
  checklistTemplate: [{
    phase: { 
      type: String, 
      enum: ['pre_event', 'setup', 'live', 'teardown'],
      required: true 
    },
    items: [{
      task: { type: String, required: true },
      responsible: String,
      timeOffset: Number,
      critical: { type: Boolean, default: false },
      dependencies: [String]
    }]
  }],
  metadata: {
    department: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    lastUsed: Date,
    usageCount: { type: Number, default: 0 }
  }
});

// ==================== MCR AUTOMATION RULE ====================
export interface IMCRAutomationRule extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  isActive: boolean;
  trigger: {
    type: 'calendar_event' | 'time_based' | 'manual' | 'email' | 'api';
    conditions: {
      calendarPattern?: string;
      leadTime?: number;
      schedule?: {
        type: 'daily' | 'weekly' | 'monthly';
        time: string;
        daysOfWeek?: number[];
        dayOfMonth?: number;
      };
      emailPattern?: {
        from: string;
        subject: string;
        bodyContains: string[];
      };
    };
  };
  actions: Array<{
    type: 'create_event' | 'assign_resources' | 'send_notification' | 'update_routing';
    params: {
      eventTemplate?: string;
      titlePattern?: string;
      durationPattern?: string;
      autoAssign?: boolean;
      priorityRules?: any[];
      recipients?: string[];
      messageTemplate?: string;
    };
    errorHandling: {
      retryCount: number;
      fallbackAction: string;
      notifyOnError: string[];
    };
  }>;
  metadata: {
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    lastTriggered?: Date;
    triggerCount: number;
    successCount: number;
    errorCount: number;
  };
}

const mcrAutomationRuleSchema = new Schema<IMCRAutomationRule>({
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  trigger: {
    type: { 
      type: String, 
      enum: ['calendar_event', 'time_based', 'manual', 'email', 'api'],
      required: true 
    },
    conditions: {
      calendarPattern: String,
      leadTime: Number,
      schedule: {
        type: { type: String, enum: ['daily', 'weekly', 'monthly'] },
        time: String,
        daysOfWeek: [Number],
        dayOfMonth: Number
      },
      emailPattern: {
        from: String,
        subject: String,
        bodyContains: [String]
      }
    }
  },
  actions: [{
    type: { 
      type: String, 
      enum: ['create_event', 'assign_resources', 'send_notification', 'update_routing'],
      required: true 
    },
    params: {
      eventTemplate: String,
      titlePattern: String,
      durationPattern: String,
      autoAssign: Boolean,
      priorityRules: [Schema.Types.Mixed],
      recipients: [String],
      messageTemplate: String
    },
    errorHandling: {
      retryCount: { type: Number, default: 3 },
      fallbackAction: String,
      notifyOnError: [String]
    }
  }],
  metadata: {
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastTriggered: Date,
    triggerCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 }
  }
});

// ==================== VENDOR INTEGRATION CONFIG ====================
export interface IVendorIntegrationConfig extends Document {
  _id: mongoose.Types.ObjectId;
  vendor: 'liveu' | 'vmix' | 'magnum' | 'unity';
  connectionType: 'api' | 'tcp' | 'websocket' | 'serial';
  endpoints: {
    base: string;
    auth: string;
    status: string;
    control: string;
    events: string;
  };
  authentication: {
    method: 'api_key' | 'oauth2' | 'basic' | 'custom';
    credentials: {
      apiKey?: string;
      username?: string;
      password?: string;
      clientId?: string;
      clientSecret?: string;
    };
    tokenRefresh: {
      enabled: boolean;
      interval: number;
    };
  };
  dataMapping: {
    events: {
      id: string;
      title: string;
      startTime: string;
      status: string;
      customFields: any;
    };
    equipment: {
      id: string;
      name: string;
      status: string;
      location: string;
    };
  };
  pollingConfig: {
    enabled: boolean;
    interval: number;
    endpoints: string[];
    timeout: number;
  };
  webhookConfig: {
    enabled: boolean;
    secret: string;
    events: string[];
    retryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
    };
  };
  errorHandling: {
    maxConsecutiveErrors: number;
    errorThreshold: number;
    notificationRecipients: string[];
    autoDisable: boolean;
  };
  metadata: {
    installedBy: string;
    installedAt: Date;
    lastModified: Date;
    version: string;
    isActive: boolean;
  };
}

const vendorIntegrationConfigSchema = new Schema<IVendorIntegrationConfig>({
  vendor: { 
    type: String, 
    enum: ['liveu', 'vmix', 'magnum', 'unity'],
    required: true 
  },
  connectionType: { 
    type: String, 
    enum: ['api', 'tcp', 'websocket', 'serial'],
    required: true 
  },
  endpoints: {
    base: String,
    auth: String,
    status: String,
    control: String,
    events: String
  },
  authentication: {
    method: { 
      type: String, 
      enum: ['api_key', 'oauth2', 'basic', 'custom'],
      required: true 
    },
    credentials: {
      apiKey: String,
      username: String,
      password: String,
      clientId: String,
      clientSecret: String
    },
    tokenRefresh: {
      enabled: { type: Boolean, default: false },
      interval: Number
    }
  },
  dataMapping: {
    events: {
      id: String,
      title: String,
      startTime: String,
      status: String,
      customFields: Schema.Types.Mixed
    },
    equipment: {
      id: String,
      name: String,
      status: String,
      location: String
    }
  },
  pollingConfig: {
    enabled: { type: Boolean, default: false },
    interval: Number,
    endpoints: [String],
    timeout: Number
  },
  webhookConfig: {
    enabled: { type: Boolean, default: false },
    secret: String,
    events: [String],
    retryPolicy: {
      maxRetries: { type: Number, default: 3 },
      backoffMultiplier: { type: Number, default: 2 }
    }
  },
  errorHandling: {
    maxConsecutiveErrors: { type: Number, default: 5 },
    errorThreshold: Number,
    notificationRecipients: [String],
    autoDisable: { type: Boolean, default: true }
  },
  metadata: {
    installedBy: String,
    installedAt: { type: Date, default: Date.now },
    lastModified: { type: Date, default: Date.now },
    version: String,
    isActive: { type: Boolean, default: true }
  }
});

// ==================== EQUIPMENT BARCODE CONFIG ====================
export interface IEquipmentBarcodeConfig extends Document {
  _id: mongoose.Types.ObjectId;
  barcodeFormat: 'CODE128' | 'QR' | 'EAN13' | 'UPC' | 'CODE39';
  prefixRules: Array<{
    prefix: string;
    equipmentType: string;
    department: string;
    autoActions: Array<{
      trigger: 'scan_in' | 'scan_out';
      action: 'update_status' | 'create_maintenance' | 'notify';
      params: any;
    }>;
  }>;
  scanLocations: Array<{
    locationId: string;
    locationName: string;
    locationType: 'warehouse' | 'studio' | 'mcr' | 'field';
    allowedActions: string[];
    requiresAuth: boolean;
    requiresReason: string[];
  }>;
  labelTemplate: {
    format: 'ZPL' | 'EPL' | 'PDF';
    size: { width: number; height: number };
    elements: Array<{
      type: 'barcode' | 'text' | 'logo' | 'qr';
      position: { x: number; y: number };
      data: string;
      style: any;
    }>;
  };
  validationRules: Array<{
    field: string;
    rule: 'required' | 'format' | 'range';
    params: any;
    errorMessage: {
      en: string;
      he: string;
    };
  }>;
  metadata: {
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

const equipmentBarcodeConfigSchema = new Schema<IEquipmentBarcodeConfig>({
  barcodeFormat: { 
    type: String, 
    enum: ['CODE128', 'QR', 'EAN13', 'UPC', 'CODE39'],
    required: true 
  },
  prefixRules: [{
    prefix: { type: String, required: true },
    equipmentType: String,
    department: String,
    autoActions: [{
      trigger: { 
        type: String, 
        enum: ['scan_in', 'scan_out'],
        required: true 
      },
      action: { 
        type: String, 
        enum: ['update_status', 'create_maintenance', 'notify'],
        required: true 
      },
      params: Schema.Types.Mixed
    }]
  }],
  scanLocations: [{
    locationId: { type: String, required: true },
    locationName: { type: String, required: true },
    locationType: { 
      type: String, 
      enum: ['warehouse', 'studio', 'mcr', 'field'],
      required: true 
    },
    allowedActions: [String],
    requiresAuth: { type: Boolean, default: false },
    requiresReason: [String]
  }],
  labelTemplate: {
    format: { 
      type: String, 
      enum: ['ZPL', 'EPL', 'PDF'],
      required: true 
    },
    size: {
      width: { type: Number, required: true },
      height: { type: Number, required: true }
    },
    elements: [{
      type: { 
        type: String, 
        enum: ['barcode', 'text', 'logo', 'qr'],
        required: true 
      },
      position: {
        x: { type: Number, required: true },
        y: { type: Number, required: true }
      },
      data: String,
      style: Schema.Types.Mixed
    }]
  },
  validationRules: [{
    field: { type: String, required: true },
    rule: { 
      type: String, 
      enum: ['required', 'format', 'range'],
      required: true 
    },
    params: Schema.Types.Mixed,
    errorMessage: {
      en: String,
      he: String
    }
  }],
  metadata: {
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }
});

// ==================== SATELLITE BOOKING TEMPLATE ====================
export interface ISatelliteBookingTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  provider: string;
  satelliteName: string;
  coverageArea: {
    type: 'regional' | 'global' | 'spot_beam';
    regions: string[];
    coordinates?: any; // GeoJSON
  };
  technicalSpecs: {
    band: 'C' | 'Ku' | 'Ka';
    uplinkFrequency: {
      min: number;
      max: number;
      unit: 'MHz' | 'GHz';
    };
    downlinkFrequency: {
      min: number;
      max: number;
      unit: 'MHz' | 'GHz';
    };
    polarization: string[];
    modulation: string[];
    fec: string[];
    dataRates: {
      min: number;
      max: number;
      unit: 'Mbps' | 'Gbps';
    };
  };
  bookingRequirements: {
    minLeadTime: number;
    minDuration: number;
    increments: number;
    maxAdvanceBooking: number;
    requiredInfo: Array<{
      field: string;
      type: string;
      required: boolean;
      validation: string;
    }>;
  };
  pricing: {
    currency: string;
    baseRate: number;
    peakMultiplier: number;
    peakHours: Array<{
      startTime: string;
      endTime: string;
      daysOfWeek: number[];
    }>;
    minimumCharge: number;
  };
  availabilityCalendar: {
    updateFrequency: number;
    apiEndpoint: string;
    authRequired: boolean;
  };
  metadata: {
    addedBy: string;
    addedAt: Date;
    lastUpdated: Date;
    isActive: boolean;
  };
}

const satelliteBookingTemplateSchema = new Schema<ISatelliteBookingTemplate>({
  provider: { type: String, required: true },
  satelliteName: { type: String, required: true },
  coverageArea: {
    type: { 
      type: String, 
      enum: ['regional', 'global', 'spot_beam'],
      required: true 
    },
    regions: [String],
    coordinates: Schema.Types.Mixed
  },
  technicalSpecs: {
    band: { 
      type: String, 
      enum: ['C', 'Ku', 'Ka'],
      required: true 
    },
    uplinkFrequency: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
      unit: { 
        type: String, 
        enum: ['MHz', 'GHz'],
        required: true 
      }
    },
    downlinkFrequency: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
      unit: { 
        type: String, 
        enum: ['MHz', 'GHz'],
        required: true 
      }
    },
    polarization: [String],
    modulation: [String],
    fec: [String],
    dataRates: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
      unit: { 
        type: String, 
        enum: ['Mbps', 'Gbps'],
        required: true 
      }
    }
  },
  bookingRequirements: {
    minLeadTime: { type: Number, required: true },
    minDuration: { type: Number, required: true },
    increments: { type: Number, required: true },
    maxAdvanceBooking: { type: Number, required: true },
    requiredInfo: [{
      field: { type: String, required: true },
      type: { type: String, required: true },
      required: { type: Boolean, default: false },
      validation: String
    }]
  },
  pricing: {
    currency: { type: String, required: true },
    baseRate: { type: Number, required: true },
    peakMultiplier: { type: Number, default: 1 },
    peakHours: [{
      startTime: String,
      endTime: String,
      daysOfWeek: [Number]
    }],
    minimumCharge: Number
  },
  availabilityCalendar: {
    updateFrequency: Number,
    apiEndpoint: String,
    authRequired: { type: Boolean, default: false }
  },
  metadata: {
    addedBy: String,
    addedAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  }
});

// Create indexes
routingPageTemplateSchema.index({ name: 1 });
routingPageTemplateSchema.index({ category: 1, controlType: 1 });
routingPageTemplateSchema.index({ vendorType: 1 });
routingPageTemplateSchema.index({ 'metadata.createdBy': 1 });
routingPageTemplateSchema.index({ 'metadata.tags': 1 });

broadcastEventTemplateSchema.index({ name: 1 });
broadcastEventTemplateSchema.index({ eventType: 1 });
broadcastEventTemplateSchema.index({ 'metadata.department': 1 });
broadcastEventTemplateSchema.index({ 'metadata.lastUsed': -1 });
broadcastEventTemplateSchema.index({ 'metadata.createdBy': 1 });

mcrAutomationRuleSchema.index({ name: 1 });
mcrAutomationRuleSchema.index({ isActive: 1 });
mcrAutomationRuleSchema.index({ 'trigger.type': 1, isActive: 1 });
mcrAutomationRuleSchema.index({ 'metadata.lastTriggered': -1 });

vendorIntegrationConfigSchema.index({ vendor: 1 });
vendorIntegrationConfigSchema.index({ 'metadata.isActive': 1 });
vendorIntegrationConfigSchema.index({ vendor: 1, 'metadata.isActive': 1 });
vendorIntegrationConfigSchema.index({ connectionType: 1 });

equipmentBarcodeConfigSchema.index({ barcodeFormat: 1 });
equipmentBarcodeConfigSchema.index({ 'prefixRules.prefix': 1 });

satelliteBookingTemplateSchema.index({ provider: 1, satelliteName: 1 });
satelliteBookingTemplateSchema.index({ 'metadata.isActive': 1 });
satelliteBookingTemplateSchema.index({ 'technicalSpecs.band': 1 });

// Export models
export const RoutingPageTemplate = mongoose.model<IRoutingPageTemplate>('RoutingPageTemplate', routingPageTemplateSchema);
export const BroadcastEventTemplate = mongoose.model<IBroadcastEventTemplate>('BroadcastEventTemplate', broadcastEventTemplateSchema);
export const MCRAutomationRule = mongoose.model<IMCRAutomationRule>('MCRAutomationRule', mcrAutomationRuleSchema);
export const VendorIntegrationConfig = mongoose.model<IVendorIntegrationConfig>('VendorIntegrationConfig', vendorIntegrationConfigSchema);
export const EquipmentBarcodeConfig = mongoose.model<IEquipmentBarcodeConfig>('EquipmentBarcodeConfig', equipmentBarcodeConfigSchema);
export const SatelliteBookingTemplate = mongoose.model<ISatelliteBookingTemplate>('SatelliteBookingTemplate', satelliteBookingTemplateSchema); 