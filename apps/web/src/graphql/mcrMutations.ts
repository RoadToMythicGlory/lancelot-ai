import { gql } from '@apollo/client';

export const CREATE_MCR_EVENT = gql`
  mutation CreateMCREvent($input: CreateMCREventInput!) {
    createMCREvent(input: $input) {
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
    }
  }
`;

export const UPDATE_MCR_EVENT = gql`
  mutation UpdateMCREvent($id: ID!, $input: UpdateMCREventInput!) {
    updateMCREvent(id: $id, input: $input) {
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
    }
  }
`;

export const DELETE_MCR_EVENT = gql`
  mutation DeleteMCREvent($id: ID!) {
    deleteMCREvent(id: $id) {
      id
    }
  }
`;

// Activity Row Mutations
export const CREATE_ACTIVITY_ROW = gql`
  mutation CreateActivityRow($input: CreateActivityRowInput!) {
    createActivityRow(input: $input) {
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
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_ACTIVITY_ROW = gql`
  mutation UpdateActivityRow($id: ID!, $input: UpdateActivityRowInput!) {
    updateActivityRow(id: $id, input: $input) {
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
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_ACTIVITY_ROW = gql`
  mutation DeleteActivityRow($id: ID!) {
    deleteActivityRow(id: $id)
  }
`;

export const HIDE_ACTIVITY_ROW = gql`
  mutation HideActivityRow($id: ID!) {
    hideActivityRow(id: $id) {
      id
      isHidden
    }
  }
`;
