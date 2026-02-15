// MongoDB Schemas for Shifts Management System

// Shift Schema
const shiftSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["date", "shiftType", "department", "requiredWorkers", "assignedWorkers"],
      properties: {
        date: {
          bsonType: "date",
          description: "The date of the shift"
        },
        shiftType: {
          enum: ["morning", "afternoon", "night"],
          description: "Type of shift: morning (07:00-15:00), afternoon (15:00-23:00), night (23:00-07:00)"
        },
        department: {
          bsonType: "string",
          description: "Department ID"
        },
        requiredWorkers: {
          bsonType: "int",
          minimum: 1,
          description: "Number of workers required for this shift"
        },
        assignedWorkers: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["userId", "role"],
            properties: {
              userId: { bsonType: "string" },
              role: { bsonType: "string" },
              assignedAt: { bsonType: "date" },
              assignedBy: { bsonType: "string" }
            }
          }
        },
        templateId: {
          bsonType: "string",
          description: "Reference to shift template if created from template"
        },
        notes: {
          bsonType: "string"
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
};

// Shift Template Schema
const shiftTemplateSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "dayOfWeek", "shiftType", "department", "requiredWorkers"],
      properties: {
        name: {
          bsonType: "string",
          description: "Template name"
        },
        dayOfWeek: {
          bsonType: "int",
          minimum: 0,
          maximum: 6,
          description: "Day of week (0=Sunday, 6=Saturday)"
        },
        shiftType: {
          enum: ["morning", "afternoon", "night"]
        },
        department: {
          bsonType: "string"
        },
        requiredWorkers: {
          bsonType: "int",
          minimum: 1
        },
        defaultRoles: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              role: { bsonType: "string" },
              count: { bsonType: "int" }
            }
          }
        },
        active: {
          bsonType: "bool"
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
};

// Shift Swap Request Schema
const shiftSwapRequestSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["requestingUserId", "shiftId", "targetUserId", "status"],
      properties: {
        requestingUserId: {
          bsonType: "string",
          description: "User requesting the swap"
        },
        shiftId: {
          bsonType: "string",
          description: "The shift to be swapped"
        },
        targetUserId: {
          bsonType: "string",
          description: "User to swap with"
        },
        reason: {
          bsonType: "string"
        },
        status: {
          enum: ["pending", "approved", "rejected", "cancelled"],
          description: "Status of the swap request"
        },
        adminNotes: {
          bsonType: "string"
        },
        approvedBy: {
          bsonType: "string"
        },
        approvedAt: {
          bsonType: "date"
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
};

// Vacation Request Schema
const vacationRequestSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "startDate", "endDate", "vacationType", "status"],
      properties: {
        userId: {
          bsonType: "string"
        },
        startDate: {
          bsonType: "date"
        },
        endDate: {
          bsonType: "date"
        },
        vacationType: {
          enum: ["annual", "sick", "personal", "maternity", "other"],
          description: "Type of vacation"
        },
        reason: {
          bsonType: "string"
        },
        status: {
          enum: ["pending", "approved", "rejected", "cancelled"]
        },
        adminNotes: {
          bsonType: "string"
        },
        approvedBy: {
          bsonType: "string"
        },
        approvedAt: {
          bsonType: "date"
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
};

// Availability Constraints Schema
const availabilityConstraintSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "weekStartDate", "constraints"],
      properties: {
        userId: {
          bsonType: "string"
        },
        weekStartDate: {
          bsonType: "date",
          description: "Start date of the week (Sunday)"
        },
        constraints: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["dayOfWeek", "shiftType", "availability"],
            properties: {
              dayOfWeek: {
                bsonType: "int",
                minimum: 0,
                maximum: 6
              },
              shiftType: {
                enum: ["morning", "afternoon", "night"]
              },
              availability: {
                enum: ["available", "unavailable", "prefer", "prefer_not"],
                description: "Availability status"
              }
            }
          }
        },
        submittedAt: {
          bsonType: "date"
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
};

// Employee Settings Schema
const employeeSettingsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId"],
      properties: {
        userId: {
          bsonType: "string"
        },
        roles: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        teams: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        employmentPercentage: {
          bsonType: "int",
          minimum: 0,
          maximum: 100,
          description: "Employment percentage (0-100)"
        },
        constraintDeadline: {
          bsonType: "object",
          properties: {
            dayOfWeek: {
              bsonType: "int",
              minimum: 0,
              maximum: 6
            },
            hour: {
              bsonType: "int",
              minimum: 0,
              maximum: 23
            }
          },
          description: "Deadline for submitting availability constraints"
        },
        restrictions: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              type: { bsonType: "string" },
              description: { bsonType: "string" },
              active: { bsonType: "bool" }
            }
          }
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  }
};

// Department Shift Configuration Schema
const DepartmentShiftConfigSchema = {
  _id: "ObjectId",
  departmentId: "string", // UUID from PostgreSQL
  departmentName: "string",
  shiftTypes: [
    {
      type: "string", // morning, afternoon, evening, night
      label: "string", // בוקר, צהריים, ערב, לילה
      color: "string", // hex color
      defaultStartTime: "string", // HH:MM format
      defaultEndTime: "string",   // HH:MM format
      enabled: "boolean",
      requiredStaff: "number"
    }
  ],
  weeklyPatterns: [
    {
      name: "string",
      description: "string",
      pattern: [
        {
          dayOfWeek: "number", // 0-6 (Sunday-Saturday)
          shifts: [
            {
              shiftType: "string",
              requiredStaff: "number",
              startTime: "string",
              endTime: "string"
            }
          ]
        }
      ],
      isActive: "boolean"
    }
  ],
  constraints: {
    minRestBetweenShifts: "number", // hours
    maxConsecutiveDays: "number",
    maxShiftsPerWeek: "number",
    maxNightShiftsPerWeek: "number",
    requireApprovalForSwaps: "boolean",
    autoAssignEnabled: "boolean",
    allowOvertime: "boolean",
    overtimeThresholdHours: "number"
  },
  notifications: {
    sendShiftReminders: "boolean",
    reminderHoursBefore: "number",
    sendSwapRequests: "boolean",
    sendScheduleUpdates: "boolean"
  },
  metadata: {
    createdBy: "string", // User UUID
    createdAt: "Date",
    updatedAt: "Date",
    lastModifiedBy: "string"
  }
};

// Sample document for Department Shift Configuration
const sampleDepartmentShiftConfig = {
  _id: ObjectId(),
  departmentId: "uuid-of-department",
  departmentName: "ניתוב",
  shiftTypes: [
    {
      type: "morning",
      label: "בוקר",
      color: "#ffd93d",
      defaultStartTime: "07:00",
      defaultEndTime: "15:00",
      enabled: true,
      requiredStaff: 2
    },
    {
      type: "afternoon",
      label: "צהריים",
      color: "#ff9800",
      defaultStartTime: "15:00",
      defaultEndTime: "23:00",
      enabled: true,
      requiredStaff: 2
    },
    {
      type: "evening",
      label: "ערב",
      color: "#9c27b0",
      defaultStartTime: "19:00",
      defaultEndTime: "03:00",
      enabled: true,
      requiredStaff: 1
    },
    {
      type: "night",
      label: "לילה",
      color: "#f44336",
      defaultStartTime: "23:00",
      defaultEndTime: "07:00",
      enabled: true,
      requiredStaff: 1
    }
  ],
  weeklyPatterns: [
    {
      name: "תבנית רגילה",
      description: "תבנית עבודה רגילה לשבוע",
      pattern: [
        {
          dayOfWeek: 0, // Sunday
          shifts: [
            { shiftType: "morning", requiredStaff: 2, startTime: "07:00", endTime: "15:00" },
            { shiftType: "afternoon", requiredStaff: 2, startTime: "15:00", endTime: "23:00" }
          ]
        }
        // ... other days
      ],
      isActive: true
    }
  ],
  constraints: {
    minRestBetweenShifts: 11,
    maxConsecutiveDays: 6,
    maxShiftsPerWeek: 5,
    maxNightShiftsPerWeek: 2,
    requireApprovalForSwaps: true,
    autoAssignEnabled: false,
    allowOvertime: true,
    overtimeThresholdHours: 40
  },
  notifications: {
    sendShiftReminders: true,
    reminderHoursBefore: 24,
    sendSwapRequests: true,
    sendScheduleUpdates: true
  },
  metadata: {
    createdBy: "admin-user-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastModifiedBy: "admin-user-id"
  }
};

// Create indexes
const shiftsIndexes = [
  { key: { date: 1, shiftType: 1, department: 1 }, unique: true },
  { key: { "assignedWorkers.userId": 1 } },
  { key: { templateId: 1 } },
  { key: { date: 1 } }
];

const shiftSwapIndexes = [
  { key: { requestingUserId: 1, status: 1 } },
  { key: { targetUserId: 1, status: 1 } },
  { key: { shiftId: 1 } },
  { key: { createdAt: -1 } }
];

const vacationRequestIndexes = [
  { key: { userId: 1, status: 1 } },
  { key: { startDate: 1, endDate: 1 } },
  { key: { createdAt: -1 } }
];

const availabilityConstraintIndexes = [
  { key: { userId: 1, weekStartDate: 1 }, unique: true },
  { key: { weekStartDate: 1 } }
];

const employeeSettingsIndexes = [
  { key: { userId: 1 }, unique: true }
];

// Export schema configurations
module.exports = {
  shifts: {
    schema: shiftSchema,
    indexes: shiftsIndexes
  },
  shift_templates: {
    schema: shiftTemplateSchema,
    indexes: []
  },
  shift_swap_requests: {
    schema: shiftSwapRequestSchema,
    indexes: shiftSwapIndexes
  },
  vacation_requests: {
    schema: vacationRequestSchema,
    indexes: vacationRequestIndexes
  },
  availability_constraints: {
    schema: availabilityConstraintSchema,
    indexes: availabilityConstraintIndexes
  },
  employee_settings: {
    schema: employeeSettingsSchema,
    indexes: employeeSettingsIndexes
  },
  department_shift_configs: {
    schema: DepartmentShiftConfigSchema,
    indexes: []
  }
}; 