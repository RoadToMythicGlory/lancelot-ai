import { gql } from '@apollo/client';

export const FLIGHT_BOARD_FIELDS = gql`
  fragment FlightBoardFields on FlightBoard {
    id
    title
    description
    refreshIntervalSec
    visibility
    isDefault
    createdAt
    updatedAt
    panels {
      id
      panelKey
      title
      type
      width
      itemTypes
      visibleColumns
      chartGroupBy
      chartMetric
      sortField
      sortDirection
      rowLimit
      order
    }
    createdBy {
      id
      displayName
    }
  }
`;

export const GET_FLIGHT_BOARDS = gql`
  query GetFlightBoards {
    flightBoards {
      ...FlightBoardFields
    }
  }
  ${FLIGHT_BOARD_FIELDS}
`;

export const GET_FLIGHT_BOARD = gql`
  query GetFlightBoard($id: ID!) {
    flightBoard(id: $id) {
      ...FlightBoardFields
    }
  }
  ${FLIGHT_BOARD_FIELDS}
`;

export const GET_FLIGHT_BOARD_DATA = gql`
  query GetFlightBoardData($boardId: ID!, $range: FlightBoardDateRangeInput!) {
    flightBoardData(boardId: $boardId, range: $range) {
      boardId
      rangeStart
      rangeEnd
      rangePreset
      generatedAt
      items {
        id
        type
        title
        date
        startTime
        endTime
        channel
        status
        description
        notes
        raw
        itemKey
        isManual
        panelKey
        hasOverride
      }
      overlay {
        hiddenItemKeys
        manualRows {
          rowId
          panelKey
          values
          createdAt
          updatedAt
        }
        itemOverrides {
          itemKey
          values
          updatedAt
        }
      }
    }
  }
`;

export const CREATE_FLIGHT_BOARD = gql`
  mutation CreateFlightBoard($input: CreateFlightBoardInput!) {
    createFlightBoard(input: $input) {
      ...FlightBoardFields
    }
  }
  ${FLIGHT_BOARD_FIELDS}
`;

export const UPDATE_FLIGHT_BOARD = gql`
  mutation UpdateFlightBoard($id: ID!, $input: UpdateFlightBoardInput!) {
    updateFlightBoard(id: $id, input: $input) {
      ...FlightBoardFields
    }
  }
  ${FLIGHT_BOARD_FIELDS}
`;

export const DELETE_FLIGHT_BOARD = gql`
  mutation DeleteFlightBoard($id: ID!) {
    deleteFlightBoard(id: $id)
  }
`;

export const SET_DEFAULT_FLIGHT_BOARD = gql`
  mutation SetDefaultFlightBoard($id: ID!) {
    setDefaultFlightBoard(id: $id) {
      ...FlightBoardFields
    }
  }
  ${FLIGHT_BOARD_FIELDS}
`;

// ---------------------------------------------------------------------------
// Overlay mutations — board-local edits.
// ---------------------------------------------------------------------------

export const ADD_FLIGHT_BOARD_MANUAL_ROW = gql`
  mutation AddFlightBoardManualRow(
    $boardId: ID!
    $input: FlightBoardManualRowInput!
  ) {
    addFlightBoardManualRow(boardId: $boardId, input: $input) {
      id
    }
  }
`;

export const UPDATE_FLIGHT_BOARD_MANUAL_ROW = gql`
  mutation UpdateFlightBoardManualRow(
    $boardId: ID!
    $rowId: ID!
    $values: JSON!
  ) {
    updateFlightBoardManualRow(boardId: $boardId, rowId: $rowId, values: $values) {
      id
    }
  }
`;

export const DELETE_FLIGHT_BOARD_MANUAL_ROW = gql`
  mutation DeleteFlightBoardManualRow($boardId: ID!, $rowId: ID!) {
    deleteFlightBoardManualRow(boardId: $boardId, rowId: $rowId) {
      id
    }
  }
`;

export const HIDE_FLIGHT_BOARD_ITEM = gql`
  mutation HideFlightBoardItem($boardId: ID!, $itemKey: String!) {
    hideFlightBoardItem(boardId: $boardId, itemKey: $itemKey) {
      id
    }
  }
`;

export const UNHIDE_FLIGHT_BOARD_ITEM = gql`
  mutation UnhideFlightBoardItem($boardId: ID!, $itemKey: String!) {
    unhideFlightBoardItem(boardId: $boardId, itemKey: $itemKey) {
      id
    }
  }
`;

export const SET_FLIGHT_BOARD_ITEM_OVERRIDE = gql`
  mutation SetFlightBoardItemOverride(
    $boardId: ID!
    $itemKey: String!
    $values: JSON!
  ) {
    setFlightBoardItemOverride(boardId: $boardId, itemKey: $itemKey, values: $values) {
      id
    }
  }
`;

export const CLEAR_FLIGHT_BOARD_ITEM_OVERRIDE = gql`
  mutation ClearFlightBoardItemOverride($boardId: ID!, $itemKey: String!) {
    clearFlightBoardItemOverride(boardId: $boardId, itemKey: $itemKey) {
      id
    }
  }
`;
