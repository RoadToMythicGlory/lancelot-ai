import { gql } from '@apollo/client';

// ==================== ORGANIZATION ====================

export const CREATE_ORGANIZATION = gql`
  mutation CreateOrganization($input: CreateOrganizationInput!) {
    createOrganization(input: $input) {
      id
      name
      slug
      plan
      isTrial
      trialEndsAt
    }
  }
`;

export const UPDATE_ORGANIZATION = gql`
  mutation UpdateOrganization($input: UpdateOrganizationInput!) {
    updateOrganization(input: $input) {
      id
      name
      hebrewName
      logo
      contactEmail
      contactPhone
    }
  }
`;

export const UPDATE_ORGANIZATION_SETTINGS = gql`
  mutation UpdateOrganizationSettings($input: UpdateOrganizationSettingsInput!) {
    updateOrganizationSettings(input: $input) {
      id
      settings {
        timezone
        locale
        dateFormat
        brandColor
      }
    }
  }
`;

export const UPDATE_FEATURE_FLAGS = gql`
  mutation UpdateFeatureFlags($input: UpdateFeatureFlagsInput!) {
    updateFeatureFlags(input: $input) {
      id
      settings {
        features {
          chat
          aiAgent
          warehouse
          vizrt
          shifts
          mcr
          broadcasting
          liveMonitoring
        }
      }
    }
  }
`;

export const UPDATE_SECURITY_SETTINGS = gql`
  mutation UpdateSecuritySettings($input: UpdateSecuritySettingsInput!) {
    updateSecuritySettings(input: $input) {
      id
      settings {
        security {
          mfaRequired
          ssoEnabled
          passwordMinLength
          sessionTimeoutMinutes
        }
      }
    }
  }
`;

export const INVITE_USER = gql`
  mutation InviteUser($input: InviteUserInput!) {
    inviteUserToOrganization(input: $input) {
      id
      email
      role
      status
      expiresAt
    }
  }
`;

export const CANCEL_INVITE = gql`
  mutation CancelInvite($inviteId: ID!) {
    cancelOrganizationInvite(inviteId: $inviteId)
  }
`;

// ==================== BILLING ====================

export const CHANGE_PLAN = gql`
  mutation ChangePlan($input: ChangePlanInput!) {
    changePlan(input: $input) {
      id
      plan
      status
      billingCycle
      limits {
        maxUsers
        maxBroadcastEvents
        maxStorageGB
      }
    }
  }
`;

export const CANCEL_SUBSCRIPTION = gql`
  mutation CancelSubscription($reason: String) {
    cancelSubscription(reason: $reason) {
      id
      status
      cancelledAt
    }
  }
`;

// ==================== NOTIFICATIONS ====================

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) {
      id
      isRead
      readAt
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export const DISMISS_NOTIFICATION = gql`
  mutation DismissNotification($id: ID!) {
    dismissNotification(id: $id)
  }
`;

export const UPDATE_NOTIFICATION_PREFERENCES = gql`
  mutation UpdateNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
    updateNotificationPreferences(input: $input) {
      id
      muteAll
    }
  }
`;

// ==================== WORKFLOWS ====================

export const CREATE_WORKFLOW_TEMPLATE = gql`
  mutation CreateWorkflowTemplate($input: CreateWorkflowTemplateInput!) {
    createWorkflowTemplate(input: $input) {
      id
      name
      triggerType
      isActive
    }
  }
`;

export const START_WORKFLOW = gql`
  mutation StartWorkflow($input: StartWorkflowInput!) {
    startWorkflow(input: $input) {
      id
      templateName
      status
      currentStepIndex
    }
  }
`;

export const PROCESS_WORKFLOW_ACTION = gql`
  mutation ProcessWorkflowAction($input: WorkflowActionInput!) {
    processWorkflowAction(input: $input) {
      id
      status
      currentStepIndex
      stepHistory {
        stepIndex
        stepName
        status
        assigneeName
        completedAt
        comment
      }
    }
  }
`;

// ==================== MEDIA ASSETS ====================

export const CREATE_MEDIA_ASSET = gql`
  mutation CreateMediaAsset($input: CreateMediaAssetInput!) {
    createMediaAsset(input: $input) {
      id
      title
      filename
      type
      status
    }
  }
`;

export const UPDATE_MEDIA_ASSET = gql`
  mutation UpdateMediaAsset($id: ID!, $input: UpdateMediaAssetInput!) {
    updateMediaAsset(id: $id, input: $input) {
      id
      title
      description
      tags
    }
  }
`;

export const DELETE_MEDIA_ASSET = gql`
  mutation DeleteMediaAsset($id: ID!) {
    deleteMediaAsset(id: $id)
  }
`;

export const CREATE_MEDIA_FOLDER = gql`
  mutation CreateMediaFolder($name: String!, $nameHe: String, $parentFolderId: ID) {
    createMediaFolder(name: $name, nameHe: $nameHe, parentFolderId: $parentFolderId) {
      id
      name
      path
    }
  }
`;

// ==================== RIGHTS & LICENSING ====================

export const CREATE_BROADCAST_RIGHT = gql`
  mutation CreateBroadcastRight($input: CreateBroadcastRightInput!) {
    createBroadcastRight(input: $input) {
      id
      title
      rightsHolder
      status
      startDate
      endDate
    }
  }
`;

export const UPDATE_BROADCAST_RIGHT = gql`
  mutation UpdateBroadcastRight($id: ID!, $input: UpdateBroadcastRightInput!) {
    updateBroadcastRight(id: $id, input: $input) {
      id
      title
      status
    }
  }
`;

export const DELETE_BROADCAST_RIGHT = gql`
  mutation DeleteBroadcastRight($id: ID!) {
    deleteBroadcastRight(id: $id)
  }
`;

// ==================== HELP & SUPPORT ====================

export const CREATE_SUPPORT_TICKET = gql`
  mutation CreateSaasTicket($input: CreateSupportTicketInput!) {
    createSaasTicket(input: $input) {
      id
      ticketNumber
      subject
      status
    }
  }
`;

export const ADD_TICKET_MESSAGE = gql`
  mutation AddTicketMessage($input: AddTicketMessageInput!) {
    addTicketMessage(input: $input) {
      id
      messages {
        senderName
        message
        createdAt
      }
    }
  }
`;

export const CLOSE_SUPPORT_TICKET = gql`
  mutation CloseSupportTicket($id: ID!, $satisfactionRating: Int, $satisfactionComment: String) {
    closeSupportTicket(id: $id, satisfactionRating: $satisfactionRating, satisfactionComment: $satisfactionComment) {
      id
      status
      closedAt
    }
  }
`;

export const RATE_HELP_ARTICLE = gql`
  mutation RateHelpArticle($articleId: ID!, $helpful: Boolean!) {
    rateHelpArticle(articleId: $articleId, helpful: $helpful) {
      id
      helpfulCount
      notHelpfulCount
    }
  }
`;

// ==================== API KEYS & WEBHOOKS ====================

export const CREATE_API_KEY = gql`
  mutation CreateApiKey($input: CreateApiKeyInput!) {
    createApiKey(input: $input) {
      apiKey {
        id
        name
        keyPrefix
        scopes
      }
      secret
    }
  }
`;

export const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($id: ID!) {
    revokeApiKey(id: $id)
  }
`;

export const CREATE_WEBHOOK = gql`
  mutation CreateWebhook($input: CreateWebhookInput!) {
    createWebhook(input: $input) {
      id
      name
      url
      events
      isActive
    }
  }
`;

export const UPDATE_WEBHOOK = gql`
  mutation UpdateWebhook($id: ID!, $input: UpdateWebhookInput!) {
    updateWebhook(id: $id, input: $input) {
      id
      name
      isActive
    }
  }
`;

export const DELETE_WEBHOOK = gql`
  mutation DeleteWebhook($id: ID!) {
    deleteWebhook(id: $id)
  }
`;

export const TEST_WEBHOOK = gql`
  mutation TestWebhook($id: ID!) {
    testWebhook(id: $id)
  }
`;
