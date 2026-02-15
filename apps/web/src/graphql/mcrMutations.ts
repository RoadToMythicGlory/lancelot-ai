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

