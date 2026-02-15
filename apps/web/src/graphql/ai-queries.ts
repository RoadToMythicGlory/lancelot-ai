import { gql } from '@apollo/client';

/**
 * AI Agent GraphQL Queries
 */

// Get AI Agent user for chat
export const GET_AI_AGENT_USER = gql`
  query GetAIAgentUser {
    aiAgentUser {
      id
      firstName
      lastName
      displayName
      email
      department
      isActive
      systemRole
      permissions
    }
  }
`;

// Get AI Agent status
export const GET_AI_AGENT_STATUS = gql`
  query GetAIAgentStatus {
    aiAgentStatus {
      isOnline
      modelLoaded
      lastActive
      capabilities
    }
  }
`;

// Get AI conversation history
export const GET_AI_CONVERSATION_HISTORY = gql`
  query GetAIConversationHistory($conversationId: ID!, $limit: Int) {
    aiConversationHistory(conversationId: $conversationId, limit: $limit) {
      id
      role
      content
      timestamp
      toolsUsed
      metadata
    }
  }
`;

// Send message to AI
export const SEND_AI_MESSAGE = gql`
  mutation SendAIMessage($input: AIMessageInput!) {
    sendAIMessage(input: $input) {
      messageId
      intent {
        primary
        confidence
        entities
      }
      response {
        text
        structuredData
        citations {
          sourceName
          sourceUrl
          confidence
          relevanceReason
        }
      }
      toolsUsed {
        name
        durationMs
        success
      }
      explanation
      followUp {
        suggestedActions
        clarificationNeeded
      }
      metadata {
        modelUsed
        totalLatencyMs
        isOffline
      }
    }
  }
`;

// Request lineup from AI
export const REQUEST_AI_LINEUP = gql`
  mutation RequestLineup($input: LineupRequestInput!) {
    requestLineup(input: $input)
  }
`;

// Request CG spec from AI  
export const REQUEST_AI_CG_SPEC = gql`
  mutation RequestCGSpec($input: CGRequestInput!) {
    requestCGSpec(input: $input)
  }
`;
