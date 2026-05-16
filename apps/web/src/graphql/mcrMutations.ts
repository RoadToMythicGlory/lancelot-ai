import { gql } from '@apollo/client';
import { MCR_EVENT_FIELDS } from './mcrQueries';

export const CREATE_MCR_EVENT = gql`
  mutation CreateMCREvent($input: CreateMCREventInput!) {
    createMCREvent(input: $input) {
      ...MCREventFields
    }
  }
  ${MCR_EVENT_FIELDS}
`;

export const UPDATE_MCR_EVENT = gql`
  mutation UpdateMCREvent($id: ID!, $input: UpdateMCREventInput!) {
    updateMCREvent(id: $id, input: $input) {
      ...MCREventFields
    }
  }
  ${MCR_EVENT_FIELDS}
`;

export const DELETE_MCR_EVENT = gql`
  mutation DeleteMCREvent($id: ID!) {
    deleteMCREvent(id: $id)
  }
`;

// Activity Rows
export const CREATE_ACTIVITY_ROW = gql`
  mutation CreateActivityRow($input: CreateActivityRowInput!) {
    createActivityRow(input: $input) {
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
      createdAt
      updatedAt
    }
  }
`;

export const SAVE_ACTIVITY_ROWS = gql`
  mutation SaveActivityRows($date: DateTime!, $rows: [SaveActivityRowInput!]!) {
    saveActivityRows(date: $date, rows: $rows) {
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

// Daily checks
export const SET_MCR_DAILY_CHECK_COMPLETED = gql`
  mutation SetMCRDailyCheckCompleted(
    $date: DateTime!
    $templateId: ID!
    $completed: Boolean!
    $notes: String
  ) {
    setMCRDailyCheckCompleted(
      date: $date
      templateId: $templateId
      completed: $completed
      notes: $notes
    ) {
      id
      isCompleted
      completedAt
      completedBy {
        id
        displayName
      }
      notes
    }
  }
`;

export const CREATE_MCR_DAILY_CHECK_TEMPLATE = gql`
  mutation CreateMCRDailyCheckTemplate($input: CreateDailyCheckTemplateInput!) {
    createMCRDailyCheckTemplate(input: $input) {
      id
      name
      description
      order
      isActive
      isDefault
    }
  }
`;

export const UPDATE_MCR_DAILY_CHECK_TEMPLATE = gql`
  mutation UpdateMCRDailyCheckTemplate($id: ID!, $input: UpdateDailyCheckTemplateInput!) {
    updateMCRDailyCheckTemplate(id: $id, input: $input) {
      id
      name
      description
      order
      isActive
      isDefault
    }
  }
`;

export const DEACTIVATE_MCR_DAILY_CHECK_TEMPLATE = gql`
  mutation DeactivateMCRDailyCheckTemplate($id: ID!) {
    deactivateMCRDailyCheckTemplate(id: $id) {
      id
      isActive
    }
  }
`;

// External exchange
export const CREATE_MCR_EXCHANGE_GROUP = gql`
  mutation CreateMCRExchangeGroup($input: CreateMCRExchangeGroupInput!) {
    createMCRExchangeGroup(input: $input) {
      id
      name
      description
      status
      takerCount
      synopsisCount
      linkedMcrEventIds
      createdAt
    }
  }
`;

export const CLOSE_MCR_EXCHANGE_GROUP = gql`
  mutation CloseMCRExchangeGroup($id: ID!) {
    closeMCRExchangeGroup(id: $id) {
      id
      status
    }
  }
`;

export const LINK_MCR_EXCHANGE_GROUP_TO_EVENT = gql`
  mutation LinkMCRExchangeGroupToEvent($groupId: ID!, $mcrEventId: ID!) {
    linkMCRExchangeGroupToEvent(groupId: $groupId, mcrEventId: $mcrEventId) {
      id
      linkedMcrEventIds
    }
  }
`;

export const UNLINK_MCR_EXCHANGE_GROUP_FROM_EVENT = gql`
  mutation UnlinkMCRExchangeGroupFromEvent($groupId: ID!, $mcrEventId: ID!) {
    unlinkMCRExchangeGroupFromEvent(groupId: $groupId, mcrEventId: $mcrEventId) {
      id
      linkedMcrEventIds
    }
  }
`;

export const ACCEPT_MCR_EXCHANGE_UPLOAD = gql`
  mutation AcceptMCRExchangeUpload($groupId: ID!, $uploadId: ID!) {
    acceptMCRExchangeUpload(groupId: $groupId, uploadId: $uploadId) {
      id
      pendingUploads {
        id
        isAccepted
        acceptedAt
      }
    }
  }
`;

export const ADD_MCR_EXCHANGE_UPLOAD = gql`
  mutation AddMCRExchangeUpload(
    $groupId: ID!
    $fileName: String!
    $uploadedByName: String
    $synopsisTitle: String
  ) {
    addMCRExchangeUpload(
      groupId: $groupId
      fileName: $fileName
      uploadedByName: $uploadedByName
      synopsisTitle: $synopsisTitle
    ) {
      id
      pendingUploads {
        id
        fileName
        synopsisTitle
        uploadedByName
        isAccepted
      }
    }
  }
`;

// Document parsing
export const PARSE_MCR_DOCUMENT = gql`
  mutation ParseMCRDocument($input: MCRDocumentParseInput!) {
    parseMCRDocument(input: $input) {
      itemCount
      feeds {
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
      platforms {
        name
        outputType
        status
        details
      }
    }
  }
`;
