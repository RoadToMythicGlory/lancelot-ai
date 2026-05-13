import { gql } from '@apollo/client';

// Broadcast Planning Queries
export const GET_BROADCAST_EVENTS = gql`
  query GetBroadcastEvents($startDate: DateTime, $endDate: DateTime) {
    broadcastEvents(startDate: $startDate, endDate: $endDate) {
      id
      eventNumber
      title
      hebrewTitle
      description
      eventType
      startTime
      endTime
      koTime
      arrivalTime
      actualStartTime
      actualEndTime
      location
      venue
      liveLocation
      synopsis
      synopsisFile
      channel
      parallelChannel
      channel1_4k
      live
      backup
      requiresSignLanguage
      requiresSubtitles
      accessibilityStatus
      contentDuration
      contentType
      contentSource
      source
      destination
      satellite
      technicalDirectorId
      controlOperatorId
      priority
      routingConfig
      routingPreset
      notes
      subtitles
      sport
      league
      stage
      homeTeam
      awayTeam
      production_crew
      equipment_list
      file_path
      reception_start_time
      gmt_start_time
      gmt_end_time
      metadata
      createdBy {
        id
        firstName
        lastName
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_BROADCAST_EVENT = gql`
  query GetBroadcastEvent($id: ID!) {
    broadcastEvent(id: $id) {
      id
      eventNumber
      title
      hebrewTitle
      description
      eventType
      startTime
      endTime
      koTime
      arrivalTime
      actualStartTime
      actualEndTime
      location
      venue
      liveLocation
      synopsis
      synopsisFile
      channel
      parallelChannel
      channel1_4k
      live
      backup
      requiresSignLanguage
      requiresSubtitles
      accessibilityStatus
      contentDuration
      contentType
      contentSource
      source
      destination
      satellite
      technicalDirectorId
      controlOperatorId
      priority
      routingConfig
      routingPreset
      notes
      subtitles
      sport
      league
      stage
      homeTeam
      awayTeam
      production_crew
      equipment_list
      file_path
      reception_start_time
      gmt_start_time
      gmt_end_time
      metadata
      createdBy {
        id
        firstName
        lastName
      }
      createdAt
      updatedAt
    }
  }
`;

// Department and Employee Queries (needed for broadcast modal dropdowns)
export const GET_DEPARTMENTS = gql`
  query GetDepartments {
    departments {
      id
      name
      hebrewName
      code
      createdAt
    }
  }
`;

// Users list for chat (reusing existing users query with filter)
export const GET_USERS = gql`
  query GetUsers($isActive: Boolean) {
    users(filter: { isActive: $isActive }) {
      id
      firstName
      lastName
      displayName
      email
      department
      lastLogin
      publicKey
      publicKeyFingerprint
    }
  }
`;

export const GET_EMPLOYEES_BY_DEPARTMENT = gql`
  query GetEmployeesByDepartment($filter: UserFilter) {
    users(filter: $filter) {
      id
      firstName
      lastName
      displayName
      email
      phone
      mobile
      isActive
      department
      systemRole
      departments {
        departmentId
        departmentName
        roles
      }
      createdAt
      updatedAt
    }
  }
`;

// Warehouse Equipment Queries (needed for external broadcasts and warehouse modals)
export const GET_WAREHOUSE_EQUIPMENT = gql`
  query GetWarehouseEquipment($filter: WarehouseEquipmentFilter) {
    warehouseEquipment(filter: $filter) {
      id
      name
      category
      brand
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
      isDisabled
      disabledAt
      disabledReason
      suspensionStatus
      lastUsedAt
      createdAt
      updatedAt
    }
  }
`;

export const SCAN_BARCODE = gql`
  query ScanBarcode($barcode: String!, $action: String!) {
    scanBarcode(barcode: $barcode, action: $action) {
      success
      message
      equipment {
        id
        name
        category
        brand
        barcode
        status
        condition
        quantityTotal
        quantityAvailable
        currentLocation
      }
      suggestions {
        id
        name
        barcode
        category
      }
    }
  }
`;

// Returns every broadcast event that currently has equipment "out" of the
// warehouse (active assignment records OR equipment embedded in event metadata).
// Not date-filtered — this is what powers the equipment return modal so old
// productions with un-returned gear still show up.
export const GET_EVENTS_WITH_ASSIGNED_EQUIPMENT = gql`
  query GetEventsWithAssignedEquipment {
    eventsWithAssignedEquipment {
      id
      eventNumber
      title
      hebrewTitle
      startTime
      endTime
      location
      venue
      channel
      equipment_list
      metadata
    }
  }
`;

// Equipment Assignment Query
export const GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT = gql`
  query GetEquipmentAssignmentsByEvent($broadcastEventId: ID!) {
    equipmentAssignmentsByEvent(broadcastEventId: $broadcastEventId) {
      id
      equipmentId
      quantityAssigned
      assignmentStatus
      assignedToName
      createdAt
      updatedAt
    }
  }
`;

// Equipment Current Assignments Query
export const GET_EQUIPMENT_ASSIGNMENTS = gql`
  query GetEquipmentAssignments($equipmentId: ID!) {
    equipmentAssignments(equipmentId: $equipmentId) {
      id
      eventName
      eventId
      startDate
      endDate
      location
      status
      quantityAssigned
      assignedBy
      createdAt
    }
  }
`;



// Equipment Assignment History Query
export const GET_EQUIPMENT_HISTORY = gql`
  query GetEquipmentHistory($equipmentId: ID!) {
    equipmentHistory(equipmentId: $equipmentId) {
      id
      eventName
      eventId
      date
      action
      quantity
      performedBy
      performedByUser {
        id
        firstName
        lastName
      }
      notes
      previousValue
      newValue
      transferDetails {
        sourceEventId
        sourceEventName
        targetEventId
        targetEventName
        transferredQuantity
        canUndo
      }
    }
  }
`;

// Broadcast subscriptions
export const BROADCAST_EVENT_UPDATED = gql`
  subscription BroadcastEventUpdated($departmentId: ID) {
    broadcastEventUpdated(departmentId: $departmentId) {
      id
      eventNumber
      title
      hebrewTitle
      description
      eventType
      startTime
      endTime
      koTime
      arrivalTime
      actualStartTime
      actualEndTime
      location
      venue
      liveLocation
      synopsis
      synopsisFile
      channel
      parallelChannel
      channel1_4k
      live
      backup
      requiresSignLanguage
      requiresSubtitles
      accessibilityStatus
      contentDuration
      contentType
      contentSource
      source
      destination
      satellite
      technicalDirectorId
      controlOperatorId
      priority
      routingConfig
      routingPreset
      notes
      subtitles
      sport
      league
      stage
      homeTeam
      awayTeam
      production_crew
      equipment_list
      file_path
      reception_start_time
      gmt_start_time
      gmt_end_time
      metadata
      createdAt
      updatedAt
    }
  }
`;

export const GET_SIMPLE_PERMISSIONS = gql`
  query GetSimplePermissions($userId: ID!) {
    getSimplePermissions(userId: $userId)
  }
`;

// Department Shift Configuration Queries
export const GET_DEPARTMENT_SHIFT_CONFIG = gql`
  query GetDepartmentShiftConfig($departmentId: String!) {
    departmentShiftConfig(departmentId: $departmentId) {
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
      useTemplateSystem
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
      metadata {
        createdBy
        createdAt
        updatedAt
        lastModifiedBy
      }
    }
  }
`;

// Shift Role Template Queries
export const GET_SHIFT_ROLE_TEMPLATES = gql`
  query GetShiftRoleTemplates($departmentId: String!) {
    shiftRoleTemplates(departmentId: $departmentId) {
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

export const GET_SHIFT_ROLE_TEMPLATE = gql`
  query GetShiftRoleTemplate($id: ID!) {
    shiftRoleTemplate(id: $id) {
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

export const GET_MY_DEPARTMENT_SHIFT_CONFIG = gql`
  query GetMyDepartmentShiftConfig {
    myDepartmentShiftConfig {
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
      useTemplateSystem
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
      metadata {
        createdBy
        createdAt
        updatedAt
        lastModifiedBy
      }
    }
  }
`;

// External Broadcast Presets
export const GET_EXTERNAL_BROADCAST_PRESETS = gql`
  query GetExternalBroadcastPresets {
    externalBroadcastPresets {
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
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const GET_EXTERNAL_BROADCAST_PRESET = gql`
  query GetExternalBroadcastPreset($id: ID!) {
    externalBroadcastPreset(id: $id) {
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
      createdBy
      createdAt
      updatedAt
    }
  }
`;

// Equipment Sets
export const GET_EQUIPMENT_SETS = gql`
  query GetEquipmentSets {
    equipmentSets {
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
          status
          quantityAvailable
        }
        quantity
        required
      }
      notes
      isActive
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const GET_EQUIPMENT_SET_BY_BARCODE = gql`
  query GetEquipmentSetByBarcode($barcode: String!) {
    equipmentSetByBarcode(barcode: $barcode) {
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
          status
          quantityAvailable
        }
        quantity
        required
      }
      notes
      isActive
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const GET_STALE_EQUIPMENT = gql`
  query GetStaleEquipment($daysUnused: Int) {
    staleEquipment(daysUnused: $daysUnused) {
      id
      name
      barcode
      category
      status
      lastUsedAt
      isDisabled
    }
  }
`;

// ==================== BLE Tracking Queries ====================

export const GET_TRACKER_SITES = gql`
  query GetTrackerSites {
    trackerSites {
      id
      name
      floorPlanImageUrl
      widthMeters
      heightMeters
      geoAnchor {
        lat
        lng
        rotationDeg
      }
      isActive
      gateways {
        id
        gatewayKey
        name
        kind
        position {
          x
          y
        }
        zoneName
        vehicleLabel
        lastHeartbeatAt
        online
      }
      createdAt
    }
  }
`;

export const GET_TRACKER_TAGS = gql`
  query GetTrackerTags($siteId: ID) {
    trackerTags(siteId: $siteId) {
      id
      bleAddress
      equipmentId
      equipmentName
      label
      status
      lastBattery
      lastTemperature
      lastSeenAt
      latestPosition {
        tagId
        kind
        siteId
        gatewayId
        gatewayName
        zoneName
        x
        y
        lat
        lng
        rssi
        confidence
        computedAt
      }
    }
  }
`;

export const GET_TRACKER_LATEST_POSITIONS = gql`
  query GetTrackerLatestPositions($siteId: ID) {
    trackerLatestPositions(siteId: $siteId) {
      tagId
      bleAddress
      equipmentId
      label
      battery
      kind
      siteId
      gatewayId
      gatewayName
      zoneName
      x
      y
      lat
      lng
      rssi
      confidence
      computedAt
    }
  }
`;

export const GET_TRACKER_TAG_HISTORY = gql`
  query GetTrackerTagHistory($tagId: ID!, $since: DateTime, $until: DateTime, $limit: Int) {
    trackerTagHistory(tagId: $tagId, since: $since, until: $until, limit: $limit) {
      id
      gatewayId
      gatewayName
      rssi
      battery
      temperature
      lat
      lng
      ts
    }
  }
`;

export const GET_TRACKER_GATEWAYS = gql`
  query GetTrackerGateways($siteId: ID) {
    trackerGateways(siteId: $siteId) {
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
      vehicleLabel
      lastHeartbeatAt
      isActive
      online
    }
  }
`;

export const TRACKER_POSITION_UPDATED = gql`
  subscription TrackerPositionUpdated($siteId: ID) {
    trackerPositionUpdated(siteId: $siteId) {
      tagId
      bleAddress
      equipmentId
      label
      battery
      kind
      siteId
      gatewayId
      gatewayName
      zoneName
      x
      y
      lat
      lng
      rssi
      confidence
      computedAt
    }
  }
`;

// Internal Equipment Assignments (worker-based dispatch from warehouse)
export const GET_INTERNAL_EQUIPMENT_ASSIGNMENTS = gql`
  query GetInternalEquipmentAssignments($status: String) {
    internalEquipmentAssignments(status: $status) {
      id
      equipmentId
      equipment {
        id
        name
        category
        brand
        barcode
        quantityTotal
        quantityAvailable
        quantityAssigned
        isQuantityBased
        isDisabled
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
      assignedBy
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
    }
  }
`;