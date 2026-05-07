import { gql } from '@apollo/client';

// ==================== ORGANIZATION ====================

export const GET_MY_ORGANIZATION = gql`
  query GetMyOrganization {
    myOrganization {
      id
      name
      slug
      hebrewName
      logo
      favicon
      domain
      plan
      planExpiresAt
      maxUsers
      maxBroadcastEvents
      maxStorageGB
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
      isTrial
      trialEndsAt
      createdAt
    }
  }
`;

export const GET_ORGANIZATION_INVITES = gql`
  query GetOrganizationInvites {
    organizationInvites {
      id
      email
      role
      status
      expiresAt
      createdAt
    }
  }
`;

// ==================== BILLING ====================

export const GET_MY_SUBSCRIPTION = gql`
  query GetMySubscription {
    mySubscription {
      id
      plan
      status
      billingCycle
      currentPeriodStart
      currentPeriodEnd
      trialStart
      trialEnd
      limits {
        maxUsers
        maxBroadcastEvents
        maxStorageGB
        maxDepartments
        maxApiCalls
      }
      currentUsage {
        users
        broadcastEvents
        storageUsedGB
        departments
        apiCalls
      }
      cancelledAt
    }
  }
`;

export const GET_INVOICES = gql`
  query GetInvoices($limit: Int, $offset: Int) {
    invoices(limit: $limit, offset: $offset) {
      id
      invoiceNumber
      status
      currency
      total
      amountPaid
      amountDue
      periodStart
      periodEnd
      paidAt
      invoicePdfUrl
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

// ==================== HELP & SUPPORT ====================

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

export const GET_MY_SUPPORT_TICKETS = gql`
  query GetMySupportTickets {
    mySaasTickets {
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

export const GET_SUPPORT_TICKET = gql`
  query GetSupportTicket($id: ID!) {
    saasTicket(id: $id) {
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
