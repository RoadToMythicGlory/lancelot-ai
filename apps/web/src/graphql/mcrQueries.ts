import { gql } from '@apollo/client';

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

export const GET_MCR_EVENTS = gql`
  query GetMCREvents($start: DateTime, $end: DateTime, $broadcastType: BroadcastType) {
    mcrEvents(start: $start, end: $end, broadcastType: $broadcastType) {
      id
      title
      start
      end
      broadcastType
      isMCROnly
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
      broadcastEventId
      createdAt
      updatedAt
    }
  }
`;
