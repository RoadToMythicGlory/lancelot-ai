# Base44 Prompt: Lancelot Streamer — Operations Platform for Content Creators

## App Overview

Build a complete operations management platform called **"Lancelot Streamer"** for content creators and streamers (Twitch, YouTube, Kick, TikTok Live). This is a professional-grade SaaS app that helps individual streamers and small creator teams manage their entire streaming operation — scheduling, equipment, collaborations, media assets, analytics, and team coordination.

The design language should be **dark mode by default** with a modern, sleek aesthetic (think Linear, Discord, or Streamlabs). It should feel like a tool built BY streamers FOR streamers — not a corporate enterprise app. RTL support is NOT needed — this is English-only, left-to-right.

---

## Tech Stack

- React frontend (TypeScript)
- Tailwind CSS for styling
- Dark theme as default (with light mode toggle)
- Responsive design (desktop-first, mobile-friendly)
- Dashboard-style layout with sidebar navigation

---

## Authentication & User Model

### User fields:
- email, password, displayName, avatar (URL)
- accountType: "solo" | "team_owner" | "team_member"
- subscription: "free" | "creator_pro" | "creator_team"
- connectedPlatforms: array of { platform: "twitch" | "youtube" | "kick" | "tiktok", username, profileUrl, isVerified }
- timezone, language (default "en")
- createdAt, lastLogin

### Auth flow:
- Sign up with email/password
- Login page with "Forgot password"
- After login, redirect to Dashboard
- Sidebar shows avatar + display name at the bottom

---

## Pages & Layout

### Global Layout:
- **Left sidebar** (collapsible, dark background):
  - Logo at top ("Lancelot Streamer" with a small knight/lance icon)
  - Navigation items with icons (listed below)
  - User avatar + name at bottom
  - Collapse/expand toggle

- **Top bar** (subtle, inside main content area):
  - Page title
  - Global search (Ctrl+K)
  - Notification bell with unread badge
  - Quick action button ("+ New Stream")

---

## Page 1: Dashboard (`/dashboard`)

The main hub. Shows a personalized overview of the streamer's operation at a glance.

### Layout (grid of cards):

**Row 1 — Key Metrics (4 stat cards):**
- Streams This Week: count
- Total Stream Hours This Month: hours
- Next Stream: date/time countdown
- Active Collaborations: count

**Row 2 — Two columns:**

**Left column — Upcoming Streams (list):**
- Next 5 scheduled streams
- Each row: title, platform icon(s), date, time, status badge ("Scheduled" / "Live Now" / "Completed")
- Click to open stream details
- "View All" link to Stream Calendar

**Right column — Recent Activity Feed:**
- Timeline-style feed showing recent events:
  - "You scheduled 'Friday Night Gaming' for Feb 20"
  - "Equipment check completed for webcam setup"
  - "Collab request from @GamerX accepted"
  - "New clip 'Epic Clutch' added to highlights"
- Timestamps relative ("2 hours ago", "yesterday")

**Row 3 — Quick Actions (button grid):**
- Schedule a Stream
- Check Equipment
- Find Collaborators
- Upload Media
- View Analytics
- AI Assistant

---

## Page 2: Stream Calendar (`/streams`)

A full calendar view for planning and managing streams.

### Views:
- **Month view** (default) — grid with stream events as colored dots/pills
- **Week view** — time-slot grid (like Google Calendar)
- **List view** — chronological list of all streams

### Stream Event fields:
- title (required)
- description
- platforms: multi-select ["twitch", "youtube", "kick", "tiktok"] — show platform icons
- scheduledDate, startTime, endTime
- category/game (text field)
- tags: array of strings
- status: "draft" | "scheduled" | "live" | "completed" | "cancelled"
- streamType: "solo" | "collab" | "subathon" | "special_event" | "restream"
- goLiveReminder: number (minutes before — default 30)
- equipmentChecklist: reference to equipment items
- collaborators: array of { name, platform, role }
- notes (rich text)
- thumbnailUrl
- vodUrl (filled after stream ends)
- metrics: { peakViewers, avgViewers, chatMessages, newFollowers, revenue } — filled post-stream

### Create/Edit Stream Modal:
- Multi-step or single form with all fields above
- Platform selector with icons (Twitch purple, YouTube red, Kick green, TikTok black)
- Equipment checklist selector (multi-select from user's equipment)
- Collaborator search/add
- "Save as Draft" and "Schedule" buttons

### Features:
- Drag and drop to reschedule
- Color-coded by platform
- Recurring streams (weekly pattern)
- Conflict detection (overlapping times)

---

## Page 3: Equipment Manager (`/equipment`)

Track all streaming gear and ensure everything is ready before going live.

### Equipment Item fields:
- name (e.g., "Logitech C920 Webcam")
- category: "camera" | "microphone" | "lighting" | "capture_card" | "computer" | "audio_interface" | "green_screen" | "chair" | "other"
- brand, model
- status: "ready" | "needs_setup" | "charging" | "broken" | "in_repair" | "retired"
- condition: "excellent" | "good" | "fair" | "poor"
- purchaseDate, purchasePrice
- notes
- imageUrl
- serialNumber
- warrantyExpiry

### Layout:
- **Grid view** (default) — cards with image, name, status badge, category tag
- **List view** — table with sortable columns
- Filter by: category, status, condition
- Search bar

### Pre-Stream Checklist:
- When creating a stream, select equipment items
- Before going live, show a checklist: "Camera ready? ✓" / "Mic tested? ✓" / "Lighting set? ✓"
- Mark items as checked/not-checked
- Show overall readiness score ("4/5 items ready")

---

## Page 4: Collaborations (`/collabs`)

Manage collaborations with other creators.

### Collaboration fields:
- title (e.g., "Duo stream with @GamerX")
- collaboratorName, collaboratorPlatform, collaboratorContact
- scheduledDate, startTime, endTime
- status: "proposed" | "accepted" | "confirmed" | "completed" | "cancelled" | "declined"
- type: "guest_appearance" | "co_stream" | "raid_train" | "tournament" | "interview" | "other"
- notes
- relatedStreamId (link to a stream event)

### Layout:
- **Kanban board** (default) — columns by status: Proposed → Accepted → Confirmed → Completed
- **List view** — table
- Drag cards between columns to update status
- Click to expand details

### Features:
- Send collab request (creates a card in "Proposed")
- Accept/decline workflow
- Link collab to a scheduled stream
- History of past collaborations

---

## Page 5: Media Library (`/media`)

Digital asset management for stream-related files.

### Asset fields:
- title, description
- type: "overlay" | "alert" | "emote" | "banner" | "thumbnail" | "vod" | "clip" | "sound_effect" | "music" | "graphic" | "other"
- fileUrl, thumbnailUrl
- fileSize, mimeType
- tags: array of strings
- folderId (for organization)
- usedInStreams: array of stream IDs
- createdAt

### Layout:
- **Folder tree** on the left sidebar (user-created folders)
- **Grid view** (default) — thumbnail cards with name, type badge, size
- **List view** — table
- Filter by: type, tags, folder
- Search bar
- Upload button (drag & drop area)

### Features:
- Create/rename/delete folders
- Bulk upload
- Preview (images inline, video player for clips/VODs)
- Tag management
- "Used in" — see which streams use this asset

---

## Page 6: Analytics (`/analytics`)

Dashboard with streaming performance metrics.

### Time range selector: Last 7 days | Last 30 days | Last 90 days | This Year | Custom range

### Sections:

**Overview Cards (top row):**
- Total Streams
- Total Hours Streamed
- Average Viewers
- Peak Viewers (best stream)
- New Followers
- Total Revenue

**Charts:**
- **Streams per Week** — bar chart
- **Viewer Count Trend** — line chart (avg viewers over time)
- **Stream Duration Distribution** — histogram
- **Revenue Over Time** — line chart (if monetization tracked)
- **Platform Breakdown** — pie/donut chart (hours per platform)
- **Category/Game Breakdown** — horizontal bar chart (top 10 games/categories)

**Stream Performance Table:**
- Table of all streams in the selected period
- Columns: Date, Title, Platform, Duration, Peak Viewers, Avg Viewers, Followers Gained, Revenue
- Sortable, filterable
- Click to see stream details

---

## Page 7: AI Assistant (`/ai`)

A chat-based AI assistant for streamers.

### Layout:
- Chat interface (like ChatGPT)
- Message bubbles (user on right, AI on left)
- Input bar at bottom with send button
- Conversation history in a sidebar (list of past chats)

### Capabilities (show as suggestion chips):
- "Suggest a stream title for Valorant"
- "Plan my streaming schedule for next week"
- "What equipment should I upgrade next?"
- "Give me content ideas for growing my channel"
- "Summarize my streaming stats this month"
- "Help me write a collab proposal"

### Features:
- Conversation memory (remembers context within a chat)
- Multiple conversations (create new, switch between)
- Markdown rendering in responses
- Code blocks for OBS settings / chatbot commands

---

## Page 8: Notifications (`/notifications`)

Full notification center.

### Notification types:
- stream_reminder: "Your stream 'Friday Night Gaming' starts in 30 minutes"
- collab_request: "@GamerX wants to collaborate"
- collab_update: "Collab with @GamerX confirmed"
- equipment_alert: "Webcam warranty expires in 7 days"
- milestone: "You hit 100 streams!"
- system: "New feature available: Clip Manager"

### Layout:
- List of notifications, newest first
- Each row: icon (by type), title, message, timestamp, read/unread indicator
- Click to navigate to related item
- "Mark all as read" button
- Filter: All | Unread | By type

### Settings (accessible from this page):
- Toggle notifications on/off per type
- Email notification preferences
- Reminder timing preferences (how many minutes before stream)

---

## Page 9: Clips & Highlights (`/clips`)

Manage stream clips and highlight reels.

### Clip fields:
- title
- sourceStream: reference to a stream event
- platform: where the clip originated
- clipUrl, thumbnailUrl
- startTimestamp, endTimestamp (within the VOD)
- duration
- tags
- status: "raw" | "edited" | "published" | "archived"
- publishedTo: array of { platform, url, publishedAt }
- viewCount, likeCount (if tracked)

### Layout:
- **Grid view** — video thumbnail cards with play button overlay
- **List view** — table
- Filter by: status, platform, source stream, tags
- Search

### Features:
- Add clip with URL or upload
- Link to source stream
- Track where it's been published (YouTube Shorts, TikTok, Twitter)
- Status workflow: Raw → Edited → Published
- Bulk actions (archive, tag, publish)

---

## Page 10: Multi-Platform Hub (`/platforms`)

Manage connected streaming platforms in one view.

### Layout:
- **Platform cards** — one card per connected platform:
  - Platform icon + name (Twitch, YouTube, Kick, TikTok)
  - Username + profile link
  - Connection status (Connected / Disconnected)
  - Quick stats: Followers, Last Stream Date, Total Streams
  - "Disconnect" / "Reconnect" buttons

- **Unified Schedule** — a combined calendar showing streams across all platforms, color-coded by platform

- **Cross-platform Stats Comparison:**
  - Side-by-side metrics: Followers, Avg Viewers, Stream Hours per platform
  - Growth comparison chart

### Connect Flow:
- "Connect Platform" button
- Select platform → Enter username → Mark as connected
- (Note: actual OAuth integration comes later — for now, just store the username and platform)

---

## Page 11: Team Management (`/team`)

For creator teams — manage members and their roles.

### Team Member fields:
- userId (reference)
- displayName, email, avatar
- role: "owner" | "manager" | "moderator" | "editor" | "graphic_designer" | "social_media" | "custom"
- permissions: array of strings (e.g., "manage_streams", "upload_media", "view_analytics", "manage_equipment", "manage_collabs")
- joinedAt
- isActive

### Layout:
- **Member list** — cards or table showing all team members
- Each card: avatar, name, role badge, permissions summary, last active
- "Invite Member" button (by email)
- Click member to edit role/permissions

### Features:
- Role-based permissions
- Invite by email (generates invite link)
- Remove/deactivate member
- Activity log per member (what they did recently)

---

## Page 12: Monetization Tracker (`/revenue`)

Track streaming revenue across platforms.

### Revenue Entry fields:
- date
- source: "twitch_subs" | "twitch_bits" | "youtube_superchat" | "youtube_membership" | "donations" | "sponsorship" | "merch" | "ad_revenue" | "other"
- amount, currency (default USD)
- platform
- notes
- relatedStreamId (optional)

### Layout:

**Overview Cards (top row):**
- Total Revenue (this month)
- Revenue vs Last Month (% change)
- Top Revenue Source
- Average Revenue per Stream

**Charts:**
- Revenue Over Time — line chart (daily/weekly/monthly)
- Revenue by Source — pie chart
- Revenue by Platform — bar chart
- Revenue per Stream — scatter plot (revenue vs viewers)

**Revenue Log:**
- Table of all entries
- Columns: Date, Source, Platform, Amount, Related Stream
- Add new entry button
- Import from CSV
- Filter by: date range, source, platform

---

## Page 13: Settings (`/settings`)

### Tabs:
- **Profile** — edit displayName, avatar, bio, timezone
- **Platforms** — manage connected platforms (link to /platforms)
- **Notifications** — toggle preferences per notification type
- **Appearance** — dark/light mode toggle, accent color picker
- **Subscription** — current plan, usage, upgrade button
- **Team** — team settings (if team plan)
- **Data** — export data, delete account

---

## Design System

### Colors (Dark Mode):
- Background: #0F0F0F (near black)
- Surface: #1A1A2E (dark navy)
- Card: #16213E (dark blue-gray)
- Border: #2A2A4A
- Primary: #6C63FF (purple — the Lancelot brand accent)
- Secondary: #00D4AA (teal/mint green)
- Danger: #FF4757
- Warning: #FFA502
- Success: #2ED573
- Text Primary: #FFFFFF
- Text Secondary: #A0A0B0
- Text Muted: #6B6B80

### Platform Colors:
- Twitch: #9146FF
- YouTube: #FF0000
- Kick: #53FC18
- TikTok: #000000 (with neon accent #69C9D0)

### Typography:
- Headings: Inter (bold/semibold)
- Body: Inter (regular)
- Monospace: JetBrains Mono (for stats/numbers)

### Component Style:
- Cards: rounded-xl, subtle border, soft shadow
- Buttons: rounded-lg, medium padding, hover glow effect
- Inputs: dark background, lighter border on focus, rounded-lg
- Badges/Tags: rounded-full, small, colored background with opacity
- Tables: minimal borders, hover row highlight
- Modals: centered, backdrop blur, slide-in animation

---

## Data Models Summary

### Core entities:
1. **User** — account info, subscription, connected platforms
2. **StreamEvent** — scheduled/past streams with full metadata
3. **Equipment** — gear inventory with status tracking
4. **Collaboration** — collab requests and history
5. **MediaAsset** — files organized in folders
6. **Clip** — stream highlights and clips
7. **RevenueEntry** — monetization records
8. **TeamMember** — team roles and permissions
9. **Notification** — notification items with type/status
10. **AIConversation** — chat history with AI assistant

### Relationships:
- StreamEvent has many Equipment (checklist)
- StreamEvent has many Collaborations
- StreamEvent has many Clips
- StreamEvent has many RevenueEntries
- MediaAsset belongs to a Folder
- Clip belongs to a StreamEvent
- TeamMember belongs to User
- Notification belongs to User

---

## Navigation Order (sidebar):
1. Dashboard
2. Stream Calendar
3. Collaborations
4. Equipment
5. Media Library
6. Clips & Highlights
7. Multi-Platform Hub
8. Analytics
9. Revenue
10. Team (if team plan)
11. AI Assistant
12. Notifications
13. Settings
