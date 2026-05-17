import { gql } from '@apollo/client';

// ==================== INTERNAL IT SUPPORT TICKETS ====================

export const CREATE_IT_TICKET = gql`
  mutation CreateItTicket($input: CreateItTicketInput!) {
    createItTicket(input: $input) {
      id
      ticketNumber
      subject
      status
    }
  }
`;

export const ADD_IT_TICKET_MESSAGE = gql`
  mutation AddItTicketMessage($input: AddItTicketMessageInput!) {
    addItTicketMessage(input: $input) {
      id
      messages {
        senderId
        senderName
        senderType
        message
        createdAt
      }
    }
  }
`;

export const ASSIGN_IT_TICKET = gql`
  mutation AssignItTicket($id: ID!, $assigneeId: ID) {
    assignItTicket(id: $id, assigneeId: $assigneeId) {
      id
      assignedToName
      status
    }
  }
`;

export const UPDATE_IT_TICKET_STATUS = gql`
  mutation UpdateItTicketStatus($id: ID!, $status: ItTicketStatus!) {
    updateItTicketStatus(id: $id, status: $status) {
      id
      status
      resolvedAt
      closedAt
    }
  }
`;

export const CLOSE_IT_TICKET = gql`
  mutation CloseItTicket($id: ID!, $satisfactionRating: Int, $satisfactionComment: String) {
    closeItTicket(id: $id, satisfactionRating: $satisfactionRating, satisfactionComment: $satisfactionComment) {
      id
      status
      closedAt
    }
  }
`;
