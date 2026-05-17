import { gql } from '@apollo/client';

// ==================== INTERNAL IT SUPPORT TICKETS ====================
// On-prem tickets only — no hosted SaaS support back-end.

export const GET_MY_IT_TICKETS = gql`
  query GetMyItTickets {
    myItTickets {
      id
      ticketNumber
      subject
      category
      priority
      status
      createdAt
      updatedAt
    }
  }
`;

export const GET_IT_TICKETS = gql`
  query GetItTickets($status: ItTicketStatus, $limit: Int, $offset: Int) {
    itTickets(status: $status, limit: $limit, offset: $offset) {
      id
      ticketNumber
      subject
      category
      priority
      status
      createdByName
      createdByEmail
      assignedToName
      createdAt
      updatedAt
    }
  }
`;

export const GET_IT_TICKET = gql`
  query GetItTicket($id: ID!) {
    itTicket(id: $id) {
      id
      ticketNumber
      subject
      description
      category
      priority
      status
      createdByName
      createdByEmail
      assignedToName
      messages {
        senderId
        senderName
        senderType
        message
        createdAt
      }
      resolvedAt
      closedAt
      createdAt
    }
  }
`;
