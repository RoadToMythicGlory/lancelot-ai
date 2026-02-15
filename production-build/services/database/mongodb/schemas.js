// MongoDB Schemas for Templates and Configurations

// Shift Template Schema
const ShiftTemplateSchema = {
  _id: "ObjectId",
  name: "string",
  departmentId: "string", // UUID from PostgreSQL
  patterns: [
    {
      dayOfWeek: "number", // 0-6 (Sunday-Saturday)
      shifts: [
        {
          name: "string",
          startTime: "string", // HH:MM format
          endTime: "string",   // HH:MM format
          requiredStaff: "number",
          roles: ["string"],   // Required roles/positions
          color: "string",     // Hex color
          breakDuration: "number", // minutes
        }
      ]
    }
  ],
  rotationPattern: {
    type: "string", // "weekly", "biweekly", "monthly", "custom"
    weeks: "number",
    customPattern: ["array"] // Custom rotation pattern
  },
  constraints: {
    minRestBetweenShifts: "number", // hours
    maxConsecutiveDays: "number",
    maxHoursPerWeek: "number",
    maxNightShiftsPerWeek: "number",
    preferredDaysOff: ["number"], // day of week preferences
  },
  metadata: {
    createdBy: "string", // User UUID
    createdAt: "Date",
    updatedAt: "Date",
    version: "number",
    isActive: "boolean"
  }
};

// Routing Configuration Schema
const RoutingConfigSchema = {
  _id: "ObjectId",
  type: "string", // "ticket", "broadcast", "equipment"
  departmentId: "string", // UUID from PostgreSQL
  rules: [
    {
      name: "string",
      priority: "number",
      conditions: {
        field: "string",
        operator: "string", // "equals", "contains", "regex", "in"
        value: "mixed", // string, number, array, etc.
      },
      actions: [
        {
          type: "string", // "assign", "notify", "escalate", "webhook"
          target: "string", // user ID, role, department, URL
          params: "object" // Additional parameters
        }
      ],
      schedule: {
        enabled: "boolean",
        timezone: "string",
        activeHours: {
          start: "string", // HH:MM
          end: "string"    // HH:MM
        },
        activeDays: ["number"] // 0-6
      }
    }
  ],
  fallbackAction: {
    type: "string",
    target: "string",
    params: "object"
  },
  metadata: {
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date",
    version: "number"
  }
};

// UI Configuration Schema
const UIConfigSchema = {
  _id: "ObjectId",
  userId: "string", // User UUID or "default" for system-wide
  module: "string", // "dashboard", "shifts", "tickets", etc.
  config: {
    layout: {
      gridCols: "number",
      widgets: [
        {
          id: "string",
          type: "string", // "stats", "chart", "list", "calendar"
          position: {
            x: "number",
            y: "number",
            w: "number",
            h: "number"
          },
          settings: "object" // Widget-specific settings
        }
      ]
    },
    theme: {
      mode: "string", // "light", "dark", "auto"
      primaryColor: "string",
      fontSize: "string",
      density: "string" // "compact", "normal", "comfortable"
    },
    preferences: {
      language: "string", // "he", "en"
      dateFormat: "string",
      timeFormat: "string",
      firstDayOfWeek: "number",
      notifications: {
        desktop: "boolean",
        email: "boolean",
        sound: "boolean"
      }
    }
  },
  metadata: {
    lastUpdated: "Date",
    version: "number"
  }
};

// Workflow Template Schema
const WorkflowTemplateSchema = {
  _id: "ObjectId",
  name: "string",
  category: "string", // "broadcast", "shift", "equipment"
  departmentId: "string",
  steps: [
    {
      id: "string",
      name: "string",
      type: "string", // "manual", "automated", "approval"
      assignee: {
        type: "string", // "user", "role", "department"
        value: "string"
      },
      actions: [
        {
          type: "string", // "form", "checklist", "upload", "approve"
          config: "object"
        }
      ],
      transitions: [
        {
          to: "string", // next step ID
          condition: "object" // conditional logic
        }
      ],
      timeout: {
        duration: "number", // minutes
        action: "string" // "escalate", "skip", "fail"
      }
    }
  ],
  variables: {
    // Dynamic variables used in the workflow
  },
  triggers: [
    {
      type: "string", // "schedule", "event", "manual"
      config: "object"
    }
  ],
  metadata: {
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date",
    version: "number",
    isActive: "boolean"
  }
};

// Form Template Schema
const FormTemplateSchema = {
  _id: "ObjectId",
  name: "string",
  category: "string",
  departmentId: "string",
  fields: [
    {
      id: "string",
      label: {
        en: "string",
        he: "string"
      },
      type: "string", // "text", "number", "select", "date", "file", etc.
      required: "boolean",
      validation: {
        rules: ["object"],
        customValidator: "string" // Function name
      },
      conditional: {
        showIf: "object" // Conditional display logic
      },
      options: ["mixed"], // For select/radio fields
      defaultValue: "mixed",
      helpText: {
        en: "string",
        he: "string"
      }
    }
  ],
  layout: {
    sections: [
      {
        title: {
          en: "string",
          he: "string"
        },
        fields: ["string"], // Field IDs
        columns: "number"
      }
    ]
  },
  settings: {
    submitAction: "string", // API endpoint or action
    successMessage: {
      en: "string",
      he: "string"
    },
    allowDraft: "boolean",
    requireApproval: "boolean"
  },
  metadata: {
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date",
    version: "number",
    isActive: "boolean"
  }
};

// User Schema with Hierarchical Roles and Departments
const UserSchema = {
  _id: "ObjectId",
  email: "string", // Unique identifier
  password: "string", // Hashed password
  firstName: "string",
  lastName: "string",
  displayName: "string",
  
  // Hierarchical role
  systemRole: "string", // "system_admin", "it_admin", "it_user", "department_admin", "department_user"
  
  // Department memberships with roles
  departments: [
    {
      departmentId: "string", // e.g., "IT", "IT-MEDIA", "MCR-Playout", etc.
      departmentName: "string", // Human readable name
      roles: ["string"] // Roles within this department
    }
  ],
  
  // Contact information
  phone: "string",
  mobile: "string",
  
  // Status
  isActive: "boolean",
  lastLogin: "Date",
  
  // Metadata
  createdAt: "Date",
  updatedAt: "Date",
  createdBy: "string", // User ID who created this user
  updatedBy: "string" // User ID who last updated this user
};

// Department Schema
const DepartmentSchema = {
  _id: "ObjectId",
  code: "string", // e.g., "IT", "MCR-Playout", "NEWS-Producers"
  name: "string", // Display name
  category: "string", // e.g., "IT", "MCR", "Warehouse", "Visuals", "New Media", "News", "Production"
  roles: ["string"], // Available roles in this department
  description: "string",
  isActive: "boolean",
  createdAt: "Date",
  updatedAt: "Date"
};

// Export schemas
module.exports = {
  ShiftTemplateSchema,
  RoutingConfigSchema,
  UIConfigSchema,
  WorkflowTemplateSchema,
  FormTemplateSchema,
  UserSchema,
  DepartmentSchema
}; 