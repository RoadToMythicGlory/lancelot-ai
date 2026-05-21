import { gql } from '@apollo/client';

export const MCR_EVENT_FIELDS = gql`
  fragment MCREventFields on MCREvent {
    id
    title
    start
    end
    broadcastType
    isMCROnly
    broadcastEventId
    preparationStatus
    controlStudio
    broadcastChannel
    mcrStartTime
    mcrEndTime
    preparationNotes
    sourceLabel
    feeds {
      id
      name
      satellite
      frequency
      symbolRate
      polarization
      fec
      encryptionType
      encryptionKey
      bissKey
      format
      notes
    }
    contacts {
      id
      fullName
      role
      phone
      email
      notes
    }
    outputPlatforms {
      id
      name
      outputType
      status
      details
    }
    exchangeGroupIds
    sharedEngineeringEquipment {
      assignmentId
      equipmentId
      equipmentName
      barcode
      category
      quantity
      status
      assignedAt
      returnedAt
      assignedByName
      notes
    }
    details {
      ip
      port
      passphrase
      contact
      notes
      satelliteConfig
      fileContent
      filePath
      cameraCount
    }
    createdBy {
      id
      displayName
    }
    createdAt
    updatedAt
  }
`;

export const GET_MCR_EVENTS = gql`
  query GetMCREvents($start: DateTime, $end: DateTime, $broadcastType: BroadcastType) {
    mcrEvents(start: $start, end: $end, broadcastType: $broadcastType) {
      ...MCREventFields
    }
  }
  ${MCR_EVENT_FIELDS}
`;

export const GET_MCR_EVENT = gql`
  query GetMCREvent($id: ID!) {
    mcrEvent(id: $id) {
      ...MCREventFields
    }
  }
  ${MCR_EVENT_FIELDS}
`;

export const GET_ACTIVITY_ROWS = gql`
  query GetActivityRows($date: DateTime!, $includeHidden: Boolean) {
    activityRows(date: $date, includeHidden: $includeHidden) {
      id
      date
      activityName
      source
      time
      endTime
      equipment
      backup
      routing
      channel
      broadcastType
      notes
      status
      isHidden
      isManual
      broadcastEventId
      warehouseEquipment {
        id
        equipmentId
        eventName
        eventId
        status
        quantityAssigned
        assignmentStatus
        assignedToName
        assignedBy
        assignmentNotes
      }
      createdBy {
        id
        displayName
      }
      updatedBy {
        id
        displayName
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_ACTIVITY_ROW_BY_BROADCAST_EVENT = gql`
  query GetActivityRowByBroadcastEvent($broadcastEventId: ID!, $date: DateTime!) {
    activityRowByBroadcastEvent(broadcastEventId: $broadcastEventId, date: $date) {
      id
      date
      activityName
      source
      time
      endTime
      equipment
      backup
      routing
      channel
      broadcastType
      notes
      status
      isHidden
      isManual
      broadcastEventId
      warehouseEquipment {
        id
        equipmentId
        eventName
        eventId
        status
        quantityAssigned
        assignmentStatus
        assignedToName
        assignedBy
        assignmentNotes
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_MCR_DAILY_CHECK = gql`
  query GetMCRDailyCheck($date: DateTime!) {
    mcrDailyCheck(date: $date) {
      date
      total
      completed
      percentage
      entries {
        id
        date
        isCompleted
        completedAt
        completedBy {
          id
          displayName
        }
        notes
        template {
          id
          name
          description
          order
          isActive
          isDefault
        }
      }
    }
  }
`;

export const GET_MCR_DAILY_CHECK_TEMPLATES = gql`
  query GetMCRDailyCheckTemplates($activeOnly: Boolean) {
    mcrDailyCheckTemplates(activeOnly: $activeOnly) {
      id
      name
      description
      order
      isActive
      isDefault
      createdAt
      updatedAt
    }
  }
`;

export const GET_MCR_EXCHANGE_GROUPS = gql`
  query GetMCRExchangeGroups($status: MCRExchangeStatus, $mcrEventId: ID) {
    mcrExchangeGroups(status: $status, mcrEventId: $mcrEventId) {
      id
      name
      description
      status
      takerCount
      synopsisCount
      linkedMcrEventIds
      pendingUploads {
        id
        fileName
        uploadedByName
        synopsisTitle
        isAccepted
        acceptedAt
        createdAt
      }
      createdBy {
        id
        displayName
      }
      createdAt
      updatedAt
    }
  }
`;

// ===== Live subscriptions =====
export const MCR_EVENT_CREATED_SUB = gql`
  subscription MCREventCreatedSub {
    mcrEventCreated {
      ...MCREventFields
    }
  }
  ${MCR_EVENT_FIELDS}
`;

export const MCR_EVENT_UPDATED_SUB = gql`
  subscription MCREventUpdatedSub {
    mcrEventUpdated {
      ...MCREventFields
    }
  }
  ${MCR_EVENT_FIELDS}
`;

export const MCR_EVENT_DELETED_SUB = gql`
  subscription MCREventDeletedSub {
    mcrEventDeleted
  }
`;

export const ACTIVITY_ROW_CREATED_SUB = gql`
  subscription ActivityRowCreatedSub {
    activityRowCreated {
      id
      date
      activityName
      source
      time
      endTime
      equipment
      backup
      routing
      channel
      broadcastType
      notes
      status
      isHidden
      isManual
      broadcastEventId
    }
  }
`;

export const ACTIVITY_ROW_UPDATED_SUB = gql`
  subscription ActivityRowUpdatedSub {
    activityRowUpdated {
      id
      date
      activityName
      source
      time
      endTime
      equipment
      backup
      routing
      channel
      broadcastType
      notes
      status
      isHidden
      isManual
      broadcastEventId
    }
  }
`;

export const ACTIVITY_ROW_DELETED_SUB = gql`
  subscription ActivityRowDeletedSub {
    activityRowDeleted
  }
`;

export const MCR_DAILY_CHECK_ENTRY_UPDATED_SUB = gql`
  subscription MCRDailyCheckEntryUpdatedSub {
    mcrDailyCheckEntryUpdated {
      id
      date
      isCompleted
      completedAt
      completedBy {
        id
        displayName
      }
      notes
      template {
        id
        name
        description
        order
        isActive
        isDefault
      }
    }
  }
`;

export const MCR_DAILY_CHECK_TEMPLATE_CHANGED_SUB = gql`
  subscription MCRDailyCheckTemplateChangedSub {
    mcrDailyCheckTemplateChanged {
      id
      name
      description
      order
      isActive
      isDefault
    }
  }
`;

export const MCR_EXCHANGE_GROUP_UPDATED_SUB = gql`
  subscription MCRExchangeGroupUpdatedSub {
    mcrExchangeGroupUpdated {
      id
      name
      description
      status
      takerCount
      synopsisCount
      linkedMcrEventIds
      pendingUploads {
        id
        fileName
        uploadedByName
        synopsisTitle
        isAccepted
        acceptedAt
        createdAt
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_MCR_EXCHANGE_GROUP = gql`
  query GetMCRExchangeGroup($id: ID!) {
    mcrExchangeGroup(id: $id) {
      id
      name
      description
      status
      takerCount
      synopsisCount
      linkedMcrEventIds
      pendingUploads {
        id
        fileName
        uploadedByName
        synopsisTitle
        isAccepted
        acceptedAt
        createdAt
      }
      createdBy {
        id
        displayName
      }
      createdAt
      updatedAt
    }
  }
`;

// Combined tracking endpoint for the dedicated "ציוד הנדסה שיתופי" MCR
// tab. Returns both broadcast-event allocations (linked back to their
// shadow MCR event) and staff allocations.
export const GET_MCR_SHARED_ENGINEERING_EQUIPMENT = gql`
  query GetMCRSharedEngineeringEquipment($status: String) {
    mcrSharedEngineeringEquipment(status: $status) {
      eventAssignments {
        assignmentId
        equipmentId
        equipmentName
        barcode
        category
        quantity
        status
        assignedAt
        returnedAt
        assignedByName
        notes
        broadcastEventId
        broadcastEventTitle
        broadcastEventStart
        broadcastEventEnd
        broadcastEventVenue
        broadcastEventLocation
        mcrEventId
        mcrEventTitle
        mcrEventStart
        mcrEventEnd
      }
      staffAssignments {
        assignmentId
        equipmentId
        equipmentName
        barcode
        category
        quantity
        status
        assignedToType
        assignedToUserId
        assignedToName
        assignedToPhone
        assignedAt
        assignedByName
        returnedAt
        notes
      }
      availableEquipment {
        equipmentId
        equipmentName
        barcode
        category
        quantity
        status
        warehouseId
        warehouseName
        storagePlaceId
        storagePlaceName
        storagePlaceCode
        currentLocation
      }
    }
  }
`;
