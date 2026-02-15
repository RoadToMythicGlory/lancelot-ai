import { gql } from '@apollo/client';

export const GET_MY_CONVERSATIONS = gql`
  query GetMyConversations {
    privateConversations {
      id
      participant1 { 
        id 
        firstName 
        lastName 
        displayName 
        email 
        department
      }
      participant2 { 
        id 
        firstName 
        lastName 
        displayName 
        email 
        department
      }
      unreadCount
      lastMessageAt
    }
  }
`;

export const CREATE_PRIVATE_CONVERSATION = gql`
  mutation CreateOrGetConversation($userId: ID!) {
    createOrGetConversation(userId: $userId) {
      id
      participant1 { id displayName }
      participant2 { id displayName }
      unreadCount
    }
  }
`;

export const GET_CONVERSATION_MESSAGES = gql`
  query GetConversationMessages($conversationId: ID!, $limit: Int, $offset: Int) {
    conversationMessages(conversationId: $conversationId, limit: $limit, offset: $offset) {
      id
      message
      messageType
      isRead
      createdAt
      fromUser { 
        id 
        displayName
        firstName
        lastName
      }
    }
  }
`;

export const SEND_PRIVATE_MESSAGE = gql`
  mutation SendPrivateMessage($conversationId: ID!, $message: String!, $messageType: String) {
    sendPrivateMessage(conversationId: $conversationId, message: $message, messageType: $messageType) {
      id
      message
      messageType
      isRead
      createdAt
      fromUser { 
        id 
        displayName
        firstName
        lastName
      }
    }
  }
`;

export const MARK_MESSAGES_AS_READ = gql`
  mutation MarkMessagesAsRead($conversationId: ID!) {
    markMessagesAsRead(conversationId: $conversationId)
  }
`;


