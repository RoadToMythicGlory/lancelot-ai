import { gql } from '@apollo/client';

// Authentication Mutations
export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        firstName
        lastName
      }
    }
  }
`;

// Broadcast Event Mutations
export const CREATE_BROADCAST_EVENT = gql`
  mutation CreateBroadcastEvent($input: CreateBroadcastEventInput!) {
    createBroadcastEvent(input: $input) {
      id
      eventNumber
      title
      hebrewTitle
      description
      eventType
      startTime
      endTime
      koTime
      actualStartTime
      actualEndTime
      channel
      parallelChannel
      channel1_4k
      live
      notes
      subtitles
      sport
      league
      stage
      homeTeam
      awayTeam
      location
      venue
      synopsis
      metadata
      createdAt
    }
  }
`;

export const CREATE_BROADCAST_EVENT_WITH_OVERLAP_CHECK = gql`
  mutation CreateBroadcastEventWithOverlapCheck($input: CreateBroadcastEventInput!, $forceCreate: Boolean) {
    createBroadcastEventWithOverlapCheck(input: $input, forceCreate: $forceCreate) {
      success
      requiresConfirmation
      event {
        id
        title
        description
        eventType
        startTime
        endTime
        metadata
      }
      overlapCheck {
        hasOverlaps
        message
        overlaps {
          eventId
          eventTitle
          startTime
          endTime
          channel
        }
      }
    }
  }
`;

export const UPDATE_BROADCAST_EVENT = gql`
  mutation UpdateBroadcastEvent($id: ID!, $input: UpdateBroadcastEventInput!) {
    updateBroadcastEvent(id: $id, input: $input) {
      id
      title
      description
      eventType
      startTime
      endTime
      koTime
      actualStartTime
      actualEndTime
      channel
      liveLocation
      metadata
      updatedAt
      hebrewTitle
      parallelChannel
      channel1_4k
      live
      notes
      subtitles
      sport
      league
      stage
      homeTeam
      awayTeam
      venue
      production_crew
      equipment_list
      routingPreset
      reception_start_time
      gmt_start_time
      gmt_end_time
      synopsisFile
    }
  }
`;

export const DELETE_BROADCAST_EVENT = gql`
  mutation DeleteBroadcastEvent($id: ID!) {
    deleteBroadcastEvent(id: $id)
  }
`;

export const CREATE_BROADCAST_EVENTS_FROM_EXCEL = gql`
  mutation CreateBroadcastEventsFromExcel($events: [ExcelBroadcastEventInput!]!) {
    createBroadcastEventsFromExcel(events: $events) {
      success
      eventsCreated
      errors
      events {
        id
        title
        startTime
        endTime
        channel
        eventType
        location
        notes
        metadata
      }
    }
  }
`;

export const CREATE_BROADCAST_EVENTS_FROM_EXCEL_WITH_OVERLAP_CHECK = gql`
  mutation CreateBroadcastEventsFromExcelWithOverlapCheck($events: [ExcelBroadcastEventInput!]!, $forceCreate: Boolean) {
    createBroadcastEventsFromExcelWithOverlapCheck(events: $events, forceCreate: $forceCreate) {
      success
      eventsCreated
      errors
      requiresConfirmation
      events {
        id
        title
        startTime
        endTime
        channel
        eventType
        location
        notes
        metadata
      }
      overlapCheck {
        hasOverlaps
        message
        overlaps {
          eventId
          eventTitle
          startTime
          endTime
          channel
        }
      }
    }
  }
`;

export const DELETE_BROADCAST_EVENTS_BY_DATE_RANGE = gql`
  mutation DeleteBroadcastEventsByDateRange($startDate: DateTime!, $endDate: DateTime!) {
    deleteBroadcastEventsByDateRange(startDate: $startDate, endDate: $endDate) {
      success
      deletedCount
      errors
    }
  }
`;

export const DELETE_IMPORTED_BROADCAST_EVENTS = gql`
  mutation DeleteImportedBroadcastEvents {
    deleteImportedBroadcastEvents {
      success
      deletedCount
      errors
    }
  }
`;

// Department-specific data mutation for broadcast events
export const UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA = gql`
  mutation UpdateBroadcastEventDepartmentData($eventId: ID!, $department: String!, $data: DepartmentSpecificDataInput!) {
    updateBroadcastEventDepartmentData(eventId: $eventId, department: $department, data: $data) {
      id
      title
      metadata
    }
  }
`;

// Equipment Assignment Mutations (needed for warehouse functionality)
export const CREATE_EQUIPMENT_ASSIGNMENT = gql`
  mutation CreateEquipmentAssignment($input: CreateEquipmentAssignmentInput!) {
    createEquipmentAssignment(input: $input) {
      id
      quantityAssigned
      assignmentStatus
      assignedAt
      scheduledPickupAt
      scheduledReturnAt
      assignmentNotes
      assignedToName
      assignedByUser {
        id
        firstName
        lastName
      }
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_EQUIPMENT_ASSIGNMENT = gql`
  mutation UpdateEquipmentAssignment($id: ID!, $input: UpdateEquipmentAssignmentInput!) {
    updateEquipmentAssignment(id: $id, input: $input) {
      id
      quantityAssigned
      assignmentStatus
      actualPickupAt
      actualReturnAt
      returnNotes
      assignedToName
      collectedByUser {
        id
        firstName
        lastName
      }
      returnedByUser {
        id
        firstName
        lastName
      }
      updatedAt
    }
  }
`;

export const DELETE_EQUIPMENT_ASSIGNMENT = gql`
  mutation DeleteEquipmentAssignment($id: ID!) {
    deleteEquipmentAssignment(id: $id)
  }
`;

// Warehouse Equipment Mutations
export const UPDATE_WAREHOUSE_EQUIPMENT_QUANTITY = gql`
  mutation UpdateWarehouseEquipmentQuantity($id: ID!, $quantityChange: Int!) {
    updateWarehouseEquipmentQuantity(id: $id, quantityChange: $quantityChange) {
      id
      name
      quantityTotal
      quantityAvailable
      quantityAssigned
    }
  }
`;

export const ADJUST_EQUIPMENT_QUANTITY = gql`
  mutation AdjustEquipmentQuantity($id: ID!, $adjustment: Int!, $reason: String!) {
    adjustEquipmentQuantity(id: $id, adjustment: $adjustment, reason: $reason) {
      id
      name
      quantityTotal
      quantityAvailable
      quantityAssigned
      isDisabled
    }
  }
`;

export const DISABLE_EQUIPMENT = gql`
  mutation DisableEquipment($id: ID!, $reason: String!) {
    disableEquipment(id: $id, reason: $reason) {
      id
      name
      status
      isDisabled
      disabledAt
      disabledReason
    }
  }
`;

export const ENABLE_EQUIPMENT = gql`
  mutation EnableEquipment($id: ID!) {
    enableEquipment(id: $id) {
      id
      name
      status
      isDisabled
    }
  }
`;

export const UNDO_EQUIPMENT_TRANSFER = gql`
  mutation UndoEquipmentTransfer($transferId: ID!) {
    undoEquipmentTransfer(transferId: $transferId) {
      success
      message
      sourceEvent {
        id
        title
      }
      targetEvent {
        id
        title
      }
    }
  }
`;

// Equipment Mutations
export const CREATE_EQUIPMENT = gql`
  mutation CreateEquipment($input: CreateEquipmentInput!) {
    createEquipment(input: $input) {
      id
      name
      category
      barcode
      status
      quantityTotal
      quantityAvailable
      quantityAssigned
      price
      purchaseDate
      warrantyExpiryDate
      company
      equipmentModel
      contactPerson
      manualLink
      imageUrl
      storage {
        row
        shelf
        cell
      }
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_EQUIPMENT = gql`
  mutation UpdateEquipment($id: ID!, $input: UpdateEquipmentInput!) {
    updateEquipment(id: $id, input: $input) {
      id
      name
      category
      barcode
      status
      condition
      quantityTotal
      quantityAvailable
      quantityAssigned
      currentLocation
      price
      purchaseDate
      warrantyExpiryDate
      company
      equipmentModel
      contactPerson
      manualLink
      imageUrl
      storage {
        row
        shelf
        cell
      }
      updatedAt
    }
  }
`;

export const DELETE_EQUIPMENT = gql`
  mutation DeleteEquipment($id: ID!) {
    deleteEquipment(id: $id)
  }
`;

export const RETURN_EQUIPMENT_FROM_EVENT = gql`
  mutation ReturnEquipmentFromEvent($eventId: ID!, $equipmentIds: [String!]!) {
    returnEquipmentFromEvent(eventId: $eventId, equipmentIds: $equipmentIds) {
      success
      message
      updatedEvent {
        id
        equipment_list
      }
      updatedEquipment {
        id
        status
        quantityAvailable
        quantityAssigned
      }
    }
  }
`;

export const TRANSFER_EQUIPMENT_BETWEEN_EVENTS = gql`
  mutation TransferEquipmentBetweenEvents($sourceEventId: ID!, $targetEventId: ID!, $equipmentIds: [String!]!) {
    transferEquipmentBetweenEvents(sourceEventId: $sourceEventId, targetEventId: $targetEventId, equipmentIds: $equipmentIds) {
      success
      message
      sourceEvent {
        id
        equipment_list
      }
      targetEvent {
        id
        equipment_list
      }
    }
  }
`;

export const REGISTER = gql`
  mutation Register($input: CreateUserInput!) {
    register(input: $input) {
      id
      email
      firstName
      lastName
    }
  }
`;

// Department Shift Configuration Mutations
export const UPDATE_DEPARTMENT_SHIFT_CONFIG = gql`
  mutation UpdateDepartmentShiftConfig($departmentId: String!, $input: DepartmentShiftConfigInput!) {
    updateDepartmentShiftConfig(departmentId: $departmentId, input: $input) {
      id
      departmentId
      departmentName
      shiftTypes {
        type
        label
        color
        defaultStartTime
        defaultEndTime
        enabled
        requiredStaff
      }
      departmentRoles {
        id
        name
        description
        color
        priority
      }
      weeklyPatterns {
        name
        description
        pattern {
          dayOfWeek
          shifts {
            shiftType
            requiredStaff
            startTime
            endTime
          }
        }
        isActive
      }
      constraints {
        minRestBetweenShifts
        maxConsecutiveDays
        maxShiftsPerWeek
        maxNightShiftsPerWeek
        requireApprovalForSwaps
        autoAssignEnabled
        allowOvertime
        overtimeThresholdHours
      }
      notifications {
        sendShiftReminders
        reminderHoursBefore
        sendSwapRequests
        sendScheduleUpdates
      }
    }
  }
`;

export const CREATE_DEPARTMENT_SHIFT_CONFIG = gql`
  mutation CreateDepartmentShiftConfig($input: DepartmentShiftConfigInput!) {
    createDepartmentShiftConfig(input: $input) {
      id
      departmentId
      departmentName
    }
  }
`;

// Shift Role Template Mutations
export const CREATE_SHIFT_ROLE_TEMPLATE = gql`
  mutation CreateShiftRoleTemplate($input: ShiftRoleTemplateInput!) {
    createShiftRoleTemplate(input: $input) {
      id
      name
      departmentId
      dayOfWeek
      shiftType
      roleAssignments {
        roleId
        roleName
        count
      }
      isActive
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_SHIFT_ROLE_TEMPLATE = gql`
  mutation UpdateShiftRoleTemplate($id: ID!, $input: ShiftRoleTemplateInput!) {
    updateShiftRoleTemplate(id: $id, input: $input) {
      id
      name
      departmentId
      dayOfWeek
      shiftType
      roleAssignments {
        roleId
        roleName
        count
      }
      isActive
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_SHIFT_ROLE_TEMPLATE = gql`
  mutation DeleteShiftRoleTemplate($id: ID!) {
    deleteShiftRoleTemplate(id: $id)
  }
`;

export const APPLY_SHIFT_ROLE_TEMPLATE = gql`
  mutation ApplyShiftRoleTemplate($templateId: String!, $weekStartDate: String!) {
    applyShiftRoleTemplate(templateId: $templateId, weekStartDate: $weekStartDate) {
      success
      message
      shiftsCreated
      shiftsUpdated
    }
  }
`;

// Shift Mutations
export const UPDATE_SHIFT = gql`
  mutation UpdateShift($id: ID!, $input: ShiftInput!) {
    updateShift(id: $id, input: $input) {
      id
      date
      shiftType
      startTime
      endTime
      department
      requiredWorkers
      notes
      status
      assignedWorkers {
        userId
        user {
          id
          displayName
        }
        role
      }
      updatedAt
    }
  }
`; 