import { gql } from '@apollo/client';

// NOTE: This file historically held multi-tenant SaaS GraphQL operations.
// The product is now deployed on-prem for a single company, so org/billing/
// subscription/invite operations have been removed. The remaining operations
// are local on-prem features. New IT-support ticket queries live in
// `./itSupportQueries.ts`.

// ==================== ORGANIZATION (single-tenant settings) ====================

export const GET_MY_ORGANIZATION = gql`
  query GetMyOrganization {
    myOrganization {
      id
      name
      hebrewName
      logo
      favicon
      domain
      settings {
        timezone
        locale
        dateFormat
        defaultChannel
        brandColor
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
        security {
          mfaRequired
          ssoEnabled
          ssoProvider
          passwordMinLength
          sessionTimeoutMinutes
          ipWhitelist
        }
      }
      contactEmail
      contactPhone
      address
      country
      isActive
      createdAt
    }
  }
`;

// ==================== AUDIT LOGS ====================

export const GET_AUDIT_LOGS = gql`
  query GetAuditLogs($filter: AuditLogFilter, $limit: Int, $offset: Int) {
    auditLogs(filter: $filter, limit: $limit, offset: $offset) {
      items {
        id
        userId
        userEmail
        userName
        action
        resource
        resourceId
        resourceName
        changes {
          field
          oldValue
          newValue
        }
        severity
        ipAddress
        graphqlOperation
        createdAt
      }
      totalCount
      hasMore
    }
  }
`;

// ==================== NOTIFICATIONS ====================

export const GET_NOTIFICATIONS = gql`
  query GetNotifications($limit: Int, $offset: Int, $unreadOnly: Boolean) {
    notifications(limit: $limit, offset: $offset, unreadOnly: $unreadOnly) {
      items {
        id
        type
        title
        titleHe
        message
        messageHe
        resource
        resourceId
        actionUrl
        isRead
        readAt
        senderId
        senderName
        priority
        createdAt
      }
      totalCount
      unreadCount
      hasMore
    }
  }
`;

export const GET_NOTIFICATION_PREFERENCES = gql`
  query GetNotificationPreferences {
    notificationPreferences {
      id
      userId
      muteAll
      muteUntil
      quietHoursStart
      quietHoursEnd
    }
  }
`;

// ==================== WORKFLOWS ====================

export const GET_WORKFLOW_TEMPLATES = gql`
  query GetWorkflowTemplates($resourceType: String) {
    workflowTemplates(resourceType: $resourceType) {
      id
      name
      nameHe
      description
      triggerType
      steps {
        order
        type
        name
        assigneeType
        assigneeId
        timeoutMinutes
      }
      resourceType
      isActive
      createdAt
    }
  }
`;

export const GET_WORKFLOW_INSTANCES = gql`
  query GetWorkflowInstances($status: WorkflowStatus, $resourceType: String, $limit: Int) {
    workflowInstances(status: $status, resourceType: $resourceType, limit: $limit) {
      id
      templateName
      resourceType
      resourceId
      resourceName
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
      slaDeadline
      slaBreached
      initiatedByName
      createdAt
    }
  }
`;

export const GET_MY_PENDING_APPROVALS = gql`
  query GetMyPendingApprovals {
    myPendingApprovals {
      id
      templateName
      resourceType
      resourceId
      resourceName
      status
      currentStepIndex
      initiatedByName
      createdAt
    }
  }
`;

// ==================== MEDIA ASSETS ====================

export const GET_MEDIA_ASSETS = gql`
  query GetMediaAssets($filter: MediaAssetFilter, $limit: Int, $offset: Int) {
    mediaAssets(filter: $filter, limit: $limit, offset: $offset) {
      items {
        id
        filename
        originalFilename
        mimeType
        fileSize
        thumbnailUrl
        type
        category
        title
        titleHe
        description
        tags
        duration
        width
        height
        status
        uploadedByName
        createdAt
      }
      totalCount
      hasMore
    }
  }
`;

export const GET_MEDIA_FOLDERS = gql`
  query GetMediaFolders($parentFolderId: ID) {
    mediaFolders(parentFolderId: $parentFolderId) {
      id
      name
      nameHe
      parentFolderId
      path
      createdAt
    }
  }
`;

// ==================== RIGHTS & LICENSING ====================

export const GET_BROADCAST_RIGHTS = gql`
  query GetBroadcastRights($filter: BroadcastRightFilter, $limit: Int, $offset: Int) {
    broadcastRights(filter: $filter, limit: $limit, offset: $offset) {
      id
      title
      titleHe
      contentType
      sport
      league
      season
      rightsHolder
      contractNumber
      territories
      platforms
      channels
      startDate
      endDate
      exclusivity
      cost
      currency
      status
      notes
      createdAt
    }
  }
`;

export const GET_EXPIRING_RIGHTS = gql`
  query GetExpiringRights($days: Int!) {
    expiringRights(days: $days) {
      id
      title
      rightsHolder
      endDate
      status
      cost
      currency
    }
  }
`;

// ==================== HELP ARTICLES ====================

export const GET_HELP_ARTICLES = gql`
  query GetHelpArticles($category: String, $searchTerm: String) {
    helpArticles(category: $category, searchTerm: $searchTerm) {
      id
      title
      titleHe
      slug
      excerpt
      excerptHe
      category
      tags
      viewCount
      createdAt
    }
  }
`;

export const GET_HELP_ARTICLE = gql`
  query GetHelpArticle($slug: String!) {
    helpArticle(slug: $slug) {
      id
      title
      titleHe
      content
      contentHe
      category
      tags
      viewCount
      helpfulCount
      notHelpfulCount
      authorName
      createdAt
      updatedAt
    }
  }
`;

export const GET_CHANGELOG = gql`
  query GetChangelog($limit: Int) {
    changelog(limit: $limit) {
      id
      version
      title
      titleHe
      description
      descriptionHe
      changes {
        type
        description
        descriptionHe
      }
      publishedAt
    }
  }
`;

// ==================== API KEYS & WEBHOOKS ====================

export const GET_API_KEYS = gql`
  query GetApiKeys {
    apiKeys {
      id
      name
      description
      keyPrefix
      scopes
      rateLimit
      isActive
      lastUsedAt
      usageCount
      expiresAt
      createdByName
      createdAt
    }
  }
`;

export const GET_WEBHOOKS = gql`
  query GetWebhooks {
    webhooks {
      id
      name
      description
      url
      events
      isActive
      lastDeliveryAt
      lastDeliveryStatus
      consecutiveFailures
      createdAt
    }
  }
`;

// ==================== GLOBAL SEARCH ====================

export const GLOBAL_SEARCH = gql`
  query GlobalSearch($query: String!, $types: [String!], $limit: Int) {
    globalSearch(query: $query, types: $types, limit: $limit)
  }
`;

// ==================== BACKWARDS-COMPAT EXPORTS ====================
// `apps/web/src/app/help/page.tsx` still imports `GET_MY_SUPPORT_TICKETS` and
// `GET_SUPPORT_TICKET`; redirect them to the new IT-support operations so
// callers can be migrated at their own pace.
export { GET_MY_IT_TICKETS as GET_MY_SUPPORT_TICKETS, GET_IT_TICKET as GET_SUPPORT_TICKET } from './itSupportQueries';
