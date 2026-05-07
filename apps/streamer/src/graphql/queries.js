import { gql } from '@apollo/client';

// ==================== Stream Events ====================
export const GET_STREAM_EVENTS = gql`
  query GetStreamEvents($limit: Int, $offset: Int, $status: String) {
    streamerEvents(limit: $limit, offset: $offset, status: $status) {
      id userId title description platforms scheduledDate startTime endTime
      category tags status streamType goLiveReminder equipmentChecklist
      collaborators { name platform role }
      notes thumbnailUrl vodUrl isRecurring
      metrics { peakViewers avgViewers chatMessages newFollowers revenue }
      createdAt updatedAt
    }
  }
`;

export const GET_STREAM_EVENT = gql`
  query GetStreamEvent($id: ID!) {
    streamerEvent(id: $id) {
      id userId title description platforms scheduledDate startTime endTime
      category tags status streamType goLiveReminder equipmentChecklist
      collaborators { name platform role }
      notes thumbnailUrl vodUrl isRecurring
      metrics { peakViewers avgViewers chatMessages newFollowers revenue }
      createdAt updatedAt
    }
  }
`;

// ==================== Podcast Episodes ====================
export const GET_PODCAST_EPISODES = gql`
  query GetPodcastEpisodes($limit: Int, $offset: Int, $status: String, $showId: String) {
    podcastEpisodes(limit: $limit, offset: $offset, status: $status, showId: $showId) {
      id userId title description showName showId episodeNumber seasonNumber
      scheduledRecordDate scheduledPublishDate recordStartTime recordEndTime
      status format
      guests { name title email socialHandle confirmed }
      topics showNotes script recordingFileUrl editedFileUrl coverArtUrl durationMinutes
      platformsPublished { platform url publishedAt }
      tags
      metrics { downloads listens avgListenDuration completionRate reviews rating }
      monetization { hasSponsor sponsorName sponsorReadType sponsorAmount adRevenue }
      relatedStreamId notes createdAt updatedAt
    }
  }
`;

export const GET_PODCAST_EPISODE = gql`
  query GetPodcastEpisode($id: ID!) {
    podcastEpisode(id: $id) {
      id userId title description showName showId episodeNumber seasonNumber
      scheduledRecordDate scheduledPublishDate recordStartTime recordEndTime
      status format
      guests { name title email socialHandle confirmed }
      topics showNotes script recordingFileUrl editedFileUrl coverArtUrl durationMinutes
      platformsPublished { platform url publishedAt }
      tags
      metrics { downloads listens avgListenDuration completionRate reviews rating }
      monetization { hasSponsor sponsorName sponsorReadType sponsorAmount adRevenue }
      relatedStreamId notes createdAt updatedAt
    }
  }
`;

// ==================== Podcast Shows ====================
export const GET_PODCAST_SHOWS = gql`
  query GetPodcastShows {
    podcastShows {
      id userId name description coverArtUrl category language authorName
      websiteUrl rssFeedUrl
      platforms { platform profileUrl subscriberCount }
      isActive totalEpisodes frequency averageDurationMinutes
      createdAt updatedAt
    }
  }
`;

// ==================== Guest Contacts ====================
export const GET_GUEST_CONTACTS = gql`
  query GetGuestContacts($status: String, $searchTerm: String) {
    guestContacts(status: $status, searchTerm: $searchTerm) {
      id userId name email phone title company bio
      socialLinks { twitter linkedin instagram website }
      avatarUrl topicsExpertise
      previousAppearances { episodeId date topic }
      status rating notes createdAt updatedAt
    }
  }
`;

// ==================== Clips ====================
export const GET_CLIPS = gql`
  query GetClips($status: String, $sourceType: String, $limit: Int) {
    streamerClips(status: $status, sourceType: $sourceType, limit: $limit) {
      id userId title sourceType sourceStreamId sourceEpisodeId platform
      clipUrl thumbnailUrl startTimestamp endTimestamp duration tags status clipType
      publishedTo { platform url publishedAt }
      viewCount likeCount createdAt updatedAt
    }
  }
`;

// ==================== Revenue ====================
export const GET_REVENUE_ENTRIES = gql`
  query GetRevenueEntries($limit: Int, $offset: Int) {
    revenueEntries(limit: $limit, offset: $offset) {
      id userId date source amount currency platform notes
      relatedStreamId relatedEpisodeId createdAt
    }
  }
`;

// ==================== Activity ====================
export const GET_STREAMER_ACTIVITIES = gql`
  query GetStreamerActivities($limit: Int) {
    streamerActivities(limit: $limit) {
      id userId action entityType entityId description metadata createdAt
    }
  }
`;

// ==================== User ====================
export const GET_STREAMER_ME = gql`
  query GetStreamerMe {
    streamerMe {
      id firstName lastName displayName email
      systemRole departments { departmentId departmentName roles }
      isActive lastLogin createdAt
    }
  }
`;

// ==================== Notifications (reuse SaaS) ====================
export const GET_NOTIFICATIONS = gql`
  query GetNotifications($limit: Int, $unreadOnly: Boolean) {
    notifications(limit: $limit, unreadOnly: $unreadOnly) {
      items {
        id type title message isRead priority createdAt actionUrl
      }
      unreadCount
    }
  }
`;
