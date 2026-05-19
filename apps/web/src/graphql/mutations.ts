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

export const REGISTER_PUBLIC_KEY = gql`
  mutation RegisterPublicKey($publicKey: String!) {
    registerPublicKey(publicKey: $publicKey)
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

export const FORCE_RELEASE_EQUIPMENT = gql`
  mutation ForceReleaseEquipment($id: ID!, $reason: String!) {
    forceReleaseEquipment(id: $id, reason: $reason) {
      id
      name
      status
      quantityTotal
      quantityAvailable
      quantityAssigned
      isDisabled
    }
  }
`;

export const DISABLE_EQUIPMENT = gql`
  mutation DisableEquipment($id: ID!, $reason: String!, $suspensionStatus: String) {
    disableEquipment(id: $id, reason: $reason, suspensionStatus: $suspensionStatus) {
      id
      name
      status
      isDisabled
      disabledAt
      disabledReason
      suspensionStatus
    }
  }
`;

export const ENABLE_EQUIPMENT = gql`
  mutation EnableEquipment($id: ID!, $notes: String) {
    enableEquipment(id: $id, notes: $notes) {
      id
      name
      status
      isDisabled
    }
  }
`;

// Internal Equipment Assignment (worker-based dispatch from warehouse)
const INTERNAL_ASSIGNMENT_FIELDS = `
  id
  equipmentId
  equipment {
    id
    name
    category
    barcode
    quantityAvailable
    quantityAssigned
  }
  assignedToType
  assignedToUserId
  assignedToUser {
    id
    firstName
    lastName
    displayName
    email
  }
  assignedToName
  assignedToPhone
  quantityAssigned
  status
  assignedAt
  assignedByName
  notes
  returnedAt
  returnedByName
  returnNotes
  transferredAt
  transferredByName
  transferredToAssignmentId
  transferredFromAssignmentId
  transferNotes
  createdAt
  updatedAt
`;

export const ASSIGN_EQUIPMENT_TO_WORKER = gql`
  mutation AssignEquipmentToWorker($input: AssignEquipmentToWorkerInput!) {
    assignEquipmentToWorker(input: $input) {
      ${INTERNAL_ASSIGNMENT_FIELDS}
    }
  }
`;

export const RETURN_INTERNAL_EQUIPMENT_ASSIGNMENT = gql`
  mutation ReturnInternalEquipmentAssignment($assignmentId: ID!, $notes: String) {
    returnInternalEquipmentAssignment(assignmentId: $assignmentId, notes: $notes) {
      ${INTERNAL_ASSIGNMENT_FIELDS}
    }
  }
`;

export const TRANSFER_INTERNAL_EQUIPMENT_ASSIGNMENT = gql`
  mutation TransferInternalEquipmentAssignment($input: TransferInternalAssignmentInput!) {
    transferInternalEquipmentAssignment(input: $input) {
      ${INTERNAL_ASSIGNMENT_FIELDS}
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
      isQuantityBased
      isSharedEngineeringEquipment
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
      isQuantityBased
      isSharedEngineeringEquipment
      suspensionStatus
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

// External Broadcast Preset Mutations
export const CREATE_EXTERNAL_BROADCAST_PRESET = gql`
  mutation CreateExternalBroadcastPreset($input: CreateExternalBroadcastPresetInput!) {
    createExternalBroadcastPreset(input: $input) {
      id
      name
      description
      tags
      roles {
        roleKey
        roleLabel
        count
        isCustom
      }
      equipment {
        category
        categoryLabel
        count
        unitSettings {
          unitIndex
          purpose
          audioConfig
          assignedEquipmentId
          assignedEquipmentName
        }
      }
      createdAt
    }
  }
`;

export const UPDATE_EXTERNAL_BROADCAST_PRESET = gql`
  mutation UpdateExternalBroadcastPreset($id: ID!, $input: UpdateExternalBroadcastPresetInput!) {
    updateExternalBroadcastPreset(id: $id, input: $input) {
      id
      name
      description
      tags
      roles {
        roleKey
        roleLabel
        count
        isCustom
      }
      equipment {
        category
        categoryLabel
        count
        unitSettings {
          unitIndex
          purpose
          audioConfig
          assignedEquipmentId
          assignedEquipmentName
        }
      }
      updatedAt
    }
  }
`;

export const DELETE_EXTERNAL_BROADCAST_PRESET = gql`
  mutation DeleteExternalBroadcastPreset($id: ID!) {
    deleteExternalBroadcastPreset(id: $id)
  }
`;

// ─── Department management mutations ──────────────────────────────────

export const CREATE_DEPARTMENT = gql`
  mutation CreateDepartment($input: CreateDepartmentInput!) {
    createDepartment(input: $input) {
      id
      code
      name
      hebrewName
      category
      description
      isActive
      includesDepartmentCodes
      permissions
      departmentRoles {
        key
        name
        hebrewName
        description
        permissions
        order
        isActive
      }
    }
  }
`;

export const UPDATE_DEPARTMENT = gql`
  mutation UpdateDepartment($code: String!, $input: UpdateDepartmentInput!) {
    updateDepartment(code: $code, input: $input) {
      id
      code
      name
      hebrewName
      category
      description
      isActive
      includesDepartmentCodes
      permissions
      departmentRoles {
        key
        name
        hebrewName
        description
        permissions
        order
        isActive
      }
    }
  }
`;

export const DELETE_DEPARTMENT = gql`
  mutation DeleteDepartment($code: String!) {
    deleteDepartment(code: $code)
  }
`;

// ─── Assignment form configuration ────────────────────────────────────

export const UPSERT_ASSIGNMENT_FORM_CONFIG = gql`
  mutation UpsertAssignmentFormConfig($input: UpsertAssignmentFormConfigInput!) {
    upsertAssignmentFormConfig(input: $input) {
      id
      formKey
      name
      hebrewName
      description
      allowUserPresets
      isActive
      departments {
        departmentCode
        allowedRoleKeys
        requireUser
        defaultCount
        order
      }
      columns {
        key
        hebrewLabel
        englishLabel
        allowedDepartmentCodes
        allowedUserIds
        requireUser
        defaultCount
        order
      }
    }
  }
`;

export const DELETE_ASSIGNMENT_FORM_CONFIG = gql`
  mutation DeleteAssignmentFormConfig($formKey: String!) {
    deleteAssignmentFormConfig(formKey: $formKey)
  }
`;

// ─── Shared assignment presets ────────────────────────────────────────

export const CREATE_ASSIGNMENT_PRESET = gql`
  mutation CreateAssignmentPreset($input: CreateAssignmentPresetInput!) {
    createAssignmentPreset(input: $input) {
      id
      formKey
      name
      description
      tags
      isDefault
      isShared
      isActive
      jobs {
        departmentCode
        roleKey
        roleLabel
        count
        userId
        userName
      }
    }
  }
`;

export const UPDATE_ASSIGNMENT_PRESET = gql`
  mutation UpdateAssignmentPreset($id: ID!, $input: UpdateAssignmentPresetInput!) {
    updateAssignmentPreset(id: $id, input: $input) {
      id
      formKey
      name
      description
      tags
      isDefault
      isShared
      isActive
      jobs {
        departmentCode
        roleKey
        roleLabel
        count
        userId
        userName
      }
    }
  }
`;

export const DELETE_ASSIGNMENT_PRESET = gql`
  mutation DeleteAssignmentPreset($id: ID!) {
    deleteAssignmentPreset(id: $id)
  }
`;

// Equipment Set Mutations
export const CREATE_EQUIPMENT_SET = gql`
  mutation CreateEquipmentSet($input: CreateEquipmentSetInput!) {
    createEquipmentSet(input: $input) {
      id
      name
      barcode
      description
      items {
        equipmentId
        equipment {
          id
          name
          barcode
          category
        }
        quantity
        required
      }
      notes
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_EQUIPMENT_SET = gql`
  mutation UpdateEquipmentSet($id: ID!, $input: UpdateEquipmentSetInput!) {
    updateEquipmentSet(id: $id, input: $input) {
      id
      name
      barcode
      description
      items {
        equipmentId
        equipment {
          id
          name
          barcode
          category
        }
        quantity
        required
      }
      notes
      isActive
      updatedAt
    }
  }
`;

export const DELETE_EQUIPMENT_SET = gql`
  mutation DeleteEquipmentSet($id: ID!) {
    deleteEquipmentSet(id: $id)
  }
`;

export const ASSIGN_EQUIPMENT_SET_TO_EVENT = gql`
  mutation AssignEquipmentSetToEvent($eventId: ID!, $setId: ID!) {
    assignEquipmentSetToEvent(eventId: $eventId, setId: $setId) {
      success
      message
      updatedEquipment {
        id
        status
        quantityAvailable
        quantityAssigned
      }
    }
  }
`;

export const RETURN_EQUIPMENT_SET = gql`
  mutation ReturnEquipmentSet($eventId: ID!, $setId: ID!, $scannedBarcodes: [String!]!, $missingEquipmentIds: [ID!], $replacements: [EquipmentReplacementInput!]) {
    returnEquipmentSet(eventId: $eventId, setId: $setId, scannedBarcodes: $scannedBarcodes, missingEquipmentIds: $missingEquipmentIds, replacements: $replacements) {
      success
      message
      returnedCount
      missingCount
      replacedCount
    }
  }
`;

// ==================== BLE Tracking Mutations ====================

export const REGISTER_TRACKER_TAG = gql`
  mutation RegisterTrackerTag($equipmentId: ID, $bleAddress: String!, $label: String!) {
    registerTrackerTag(equipmentId: $equipmentId, bleAddress: $bleAddress, label: $label) {
      id
      bleAddress
      equipmentId
      label
      status
    }
  }
`;

export const UNREGISTER_TRACKER_TAG = gql`
  mutation UnregisterTrackerTag($tagId: ID!) {
    unregisterTrackerTag(tagId: $tagId)
  }
`;

export const BIND_TRACKER_TAG = gql`
  mutation BindTrackerTagToEquipment($tagId: ID!, $equipmentId: ID!) {
    bindTrackerTagToEquipment(tagId: $tagId, equipmentId: $equipmentId) {
      id
      bleAddress
      equipmentId
      label
      status
    }
  }
`;

export const UNBIND_TRACKER_TAG = gql`
  mutation UnbindTrackerTagFromEquipment($tagId: ID!) {
    unbindTrackerTagFromEquipment(tagId: $tagId) {
      id
      bleAddress
      equipmentId
      label
    }
  }
`;

export const CREATE_TRACKER_SITE = gql`
  mutation CreateTrackerSite($input: CreateTrackerSiteInput!) {
    createTrackerSite(input: $input) {
      id
      name
      floorPlanImageUrl
      widthMeters
      heightMeters
      isActive
    }
  }
`;

export const UPDATE_TRACKER_SITE = gql`
  mutation UpdateTrackerSite($id: ID!, $input: UpdateTrackerSiteInput!) {
    updateTrackerSite(id: $id, input: $input) {
      id
      name
      floorPlanImageUrl
      widthMeters
      heightMeters
      isActive
    }
  }
`;

export const CREATE_TRACKER_GATEWAY = gql`
  mutation CreateTrackerGateway($input: CreateTrackerGatewayInput!) {
    createTrackerGateway(input: $input) {
      id
      gatewayKey
      name
      kind
      siteId
      position {
        x
        y
      }
      zoneName
      online
    }
  }
`;

export const UPDATE_TRACKER_GATEWAY_POSITION = gql`
  mutation UpdateTrackerGatewayPosition($id: ID!, $x: Float!, $y: Float!) {
    updateTrackerGatewayPosition(id: $id, x: $x, y: $y) {
      id
      position {
        x
        y
      }
    }
  }
`;

export const CREATE_VENUE = gql`
  mutation CreateVenue($input: CreateVenueInput!) {
    createVenue(input: $input) {
      id
      name
    }
  }
`;

export const UPDATE_VENUE = gql`
  mutation UpdateVenue($id: ID!, $input: UpdateVenueInput!) {
    updateVenue(id: $id, input: $input) {
      id
      name
    }
  }
`;

export const DELETE_VENUE = gql`
  mutation DeleteVenue($id: ID!) {
    deleteVenue(id: $id)
  }
`;