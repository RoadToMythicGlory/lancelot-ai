import { gql } from '@apollo/client';

// ==================== Stream Events ====================
export const CREATE_STREAM_EVENT = gql`
  mutation CreateStreamEvent($input: CreateStreamEventInput!) {
    createStreamEvent(input: $input) { id title scheduledDate status }
  }
`;

export const UPDATE_STREAM_EVENT = gql`
  mutation UpdateStreamEvent($id: ID!, $input: UpdateStreamEventInput!) {
    updateStreamEvent(id: $id, input: $input) { id title scheduledDate status }
  }
`;

export const DELETE_STREAM_EVENT = gql`
  mutation DeleteStreamEvent($id: ID!) { deleteStreamEvent(id: $id) }
`;

// ==================== Podcast Episodes ====================
export const CREATE_PODCAST_EPISODE = gql`
  mutation CreatePodcastEpisode($input: CreatePodcastEpisodeInput!) {
    createPodcastEpisode(input: $input) { id title status }
  }
`;

export const UPDATE_PODCAST_EPISODE = gql`
  mutation UpdatePodcastEpisode($id: ID!, $input: UpdatePodcastEpisodeInput!) {
    updatePodcastEpisode(id: $id, input: $input) { id title status }
  }
`;

export const DELETE_PODCAST_EPISODE = gql`
  mutation DeletePodcastEpisode($id: ID!) { deletePodcastEpisode(id: $id) }
`;

// ==================== Podcast Shows ====================
export const CREATE_PODCAST_SHOW = gql`
  mutation CreatePodcastShow($input: CreatePodcastShowInput!) {
    createPodcastShow(input: $input) { id name category }
  }
`;

export const UPDATE_PODCAST_SHOW = gql`
  mutation UpdatePodcastShow($id: ID!, $input: UpdatePodcastShowInput!) {
    updatePodcastShow(id: $id, input: $input) { id name }
  }
`;

export const DELETE_PODCAST_SHOW = gql`
  mutation DeletePodcastShow($id: ID!) { deletePodcastShow(id: $id) }
`;

// ==================== Guest Contacts ====================
export const CREATE_GUEST_CONTACT = gql`
  mutation CreateGuestContact($input: CreateGuestContactInput!) {
    createGuestContact(input: $input) { id name status }
  }
`;

export const UPDATE_GUEST_CONTACT = gql`
  mutation UpdateGuestContact($id: ID!, $input: UpdateGuestContactInput!) {
    updateGuestContact(id: $id, input: $input) { id name status }
  }
`;

export const DELETE_GUEST_CONTACT = gql`
  mutation DeleteGuestContact($id: ID!) { deleteGuestContact(id: $id) }
`;

// ==================== Clips ====================
export const CREATE_CLIP = gql`
  mutation CreateClip($input: CreateClipInput!) {
    createClip(input: $input) { id title status }
  }
`;

export const UPDATE_CLIP = gql`
  mutation UpdateClip($id: ID!, $input: UpdateClipInput!) {
    updateClip(id: $id, input: $input) { id title status }
  }
`;

export const DELETE_CLIP = gql`
  mutation DeleteClip($id: ID!) { deleteClip(id: $id) }
`;

// ==================== Revenue ====================
export const CREATE_REVENUE_ENTRY = gql`
  mutation CreateRevenueEntry($input: CreateRevenueEntryInput!) {
    createRevenueEntry(input: $input) { id date source amount }
  }
`;

export const DELETE_REVENUE_ENTRY = gql`
  mutation DeleteRevenueEntry($id: ID!) { deleteRevenueEntry(id: $id) }
`;

// ==================== Auth ====================
export const REGISTER_STREAMER = gql`
  mutation RegisterStreamer($email: String!, $password: String!, $displayName: String!) {
    registerStreamer(email: $email, password: $password, displayName: $displayName) {
      token
      user { id firstName lastName displayName email }
    }
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id firstName lastName }
    }
  }
`;

// ==================== Notifications ====================
export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) { id isRead }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead { markAllNotificationsRead }
`;
