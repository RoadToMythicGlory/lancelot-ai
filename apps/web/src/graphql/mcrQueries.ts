import { gql } from '@apollo/client';

export const GET_ACTIVITY_ROWS = gql`
  query GetActivityRows($date: DateTime!, $includeHidden: Boolean) {
    activityRows(date: $date, includeHidden: $includeHidden) {
      id
      date
      activityName
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
