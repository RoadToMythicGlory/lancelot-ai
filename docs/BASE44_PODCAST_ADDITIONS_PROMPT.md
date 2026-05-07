# Base44 Prompt: Add Podcast Features to Lancelot Streamer

## Context

The app "Lancelot Streamer" already exists with 13 pages for live streaming management (Dashboard, Streams, Equipment, Collaborations, Media, Clips, Platforms, Analytics, Revenue, Team, AI, Notifications, Settings). It uses a dark theme (#0F0F0F background, #1A1A2E surfaces, #6C63FF primary accent), Tailwind CSS, shadcn/ui components, recharts for charts, moment.js for dates, and the Base44 SDK for data.

We need to **expand the app** to also support **podcasters**. The app should now serve BOTH streamers AND podcasters from the same interface. The user picks their content type during onboarding or can use both simultaneously.

**DO NOT recreate existing pages.** Only add new podcast-specific pages, modify existing pages where needed, and add new data models.

---

## New Data Models

### PodcastEpisode
- title (string, required)
- description (text)
- show_name (string) — the podcast series name
- episode_number (number)
- season_number (number)
- scheduled_record_date (string, date) — when recording is planned
- scheduled_publish_date (string, date) — when episode should go live
- record_start_time (string) — "14:00"
- record_end_time (string) — "15:30"
- status: "idea" | "scripted" | "scheduled" | "recording" | "editing" | "review" | "published" | "archived"
- format: "solo" | "interview" | "co_hosted" | "panel" | "narrative" | "live_recording"
- guests: array of { name, title, email, social_handle, bio, confirmed: boolean }
- topics: array of strings (episode topics/segments)
- show_notes (text) — published show notes / description
- script (text) — episode script or outline
- recording_file_url (string)
- edited_file_url (string)
- cover_art_url (string)
- duration_minutes (number) — final episode duration
- platforms_published: array of { platform: "spotify" | "apple_podcasts" | "youtube" | "google_podcasts" | "amazon_music" | "overcast" | "pocket_casts" | "rss" | "other", url, published_at }
- tags: array of strings
- equipment_checklist: array of equipment IDs
- metrics: { downloads, listens, avg_listen_duration, completion_rate, reviews, rating }
- monetization: { has_sponsor: boolean, sponsor_name, sponsor_read_type: "pre_roll" | "mid_roll" | "post_roll" | "host_read", sponsor_amount, ad_revenue }
- related_stream_id (string, optional) — if the episode was recorded during a live stream
- notes (text)

### PodcastShow
- name (string, required) — podcast series name
- description (text)
- cover_art_url (string)
- category: "technology" | "business" | "comedy" | "education" | "health" | "news" | "sports" | "entertainment" | "society" | "science" | "arts" | "gaming" | "music" | "true_crime" | "other"
- language (string, default "en")
- author_name (string)
- website_url (string)
- rss_feed_url (string)
- platforms: array of { platform, profile_url, subscriber_count }
- is_active (boolean, default true)
- total_episodes (number)
- frequency: "daily" | "weekly" | "biweekly" | "monthly" | "irregular"
- average_duration_minutes (number)

### GuestContact
- name (string, required)
- email (string)
- phone (string)
- title (string) — their professional title
- company (string)
- bio (text)
- social_links: { twitter, linkedin, instagram, website }
- avatar_url (string)
- topics_expertise: array of strings — what they can talk about
- previous_appearances: array of { episode_id, date, topic }
- status: "potential" | "contacted" | "confirmed" | "declined" | "appeared"
- rating (number, 1-5) — internal rating of how good a guest they were
- notes (text)

---

## New Pages

### Page: Podcast Episodes (`/Episodes`)

A page for managing all podcast episodes across all shows — the podcast equivalent of the Stream Calendar.

**Layout:**

**Top section:**
- PageHeader with title "Podcast Episodes", description "Plan, record, and publish your episodes"
- Action buttons: "New Episode" (primary), view toggle (Kanban | List | Calendar)

**Kanban View (default):**
- Columns by status: Idea → Scripted → Scheduled → Recording → Editing → Review → Published
- Each card shows:
  - Episode title
  - Show name (small badge)
  - Episode/Season number (e.g., "S2 E14")
  - Scheduled date
  - Format badge (solo, interview, panel, etc.)
  - Guest count indicator (if interview/panel)
  - Platform publish indicators (small dots for Spotify, Apple, YouTube, etc.)
- Drag and drop cards between columns to update status
- Click card to open edit modal

**List View:**
- Table with columns: #, Title, Show, Format, Status, Record Date, Publish Date, Duration, Downloads
- Sortable columns
- Row click opens edit modal

**Calendar View:**
- Month calendar (reuse pattern from Streams page)
- Shows recording dates and publish dates with different colors
- Recording dates: orange dots
- Publish dates: green dots

**Create/Edit Episode Modal:**
- Multi-section form (use Tabs inside the dialog):
  - **Details** tab: title, show_name (dropdown from shows), episode_number, season_number, format, description, topics (tag input), tags
  - **Schedule** tab: scheduled_record_date, record_start_time, record_end_time, scheduled_publish_date, equipment_checklist (multi-select from Equipment)
  - **Guests** tab: search/add from GuestContact database, or add inline (name, title, email, confirmed toggle). Show guest cards with avatar and status.
  - **Content** tab: script (textarea, large), show_notes (textarea)
  - **Publish** tab: platforms_published (checkboxes for each platform + URL field), cover_art_url upload
  - **Metrics** tab (only shown for published episodes): downloads, listens, avg_listen_duration, completion_rate, reviews, rating
  - **Monetization** tab: has_sponsor toggle, sponsor fields, ad_revenue

---

### Page: Podcast Shows (`/Shows`)

Manage podcast series/shows.

**Layout:**
- PageHeader: "My Shows", "Manage your podcast series"
- "New Show" button

**Grid of show cards:**
Each card:
- Cover art (or placeholder with initials)
- Show name (bold)
- Category badge
- Episode count
- Frequency badge (Weekly, Monthly, etc.)
- Platform icons (where it's published)
- "Active" / "Paused" status indicator
- Click to open show details

**Show Detail Modal:**
- Edit all PodcastShow fields
- Show a mini list of recent episodes for this show
- Platform links with subscriber counts
- RSS feed URL with copy button

---

### Page: Guest Manager (`/Guests`)

CRM-lite for managing podcast guests.

**Layout:**
- PageHeader: "Guest Manager", "Find and manage podcast guests"
- "Add Guest" button
- Search bar + filter by status (Potential, Contacted, Confirmed, Appeared)

**Guest cards (grid view):**
Each card:
- Avatar (or initials circle)
- Name (bold)
- Title & Company
- Topics expertise (2-3 tag pills)
- Status badge
- Star rating (if appeared before)
- Number of previous appearances
- Quick action buttons: Email, Schedule

**Guest Detail Modal:**
- All GuestContact fields editable
- "Previous Appearances" section: list of episodes they've been on, with dates
- "Schedule for Episode" button: links to create episode with this guest pre-filled
- Social links as clickable icons

---

## Modified Existing Pages

### Dashboard (`/Dashboard`)

Add a podcast section to the dashboard. The dashboard should now show BOTH streaming and podcast data.

**Add below the existing MetricsRow:**

New row of podcast-specific stat cards:
- Total Episodes (published count)
- Recording This Week (count of episodes with record_date this week)
- Avg Downloads (average downloads across all published episodes)
- Pending Guests (count of guests with status "contacted" or "confirmed")

**Add below the existing UpcomingStreams component:**

New component "UpcomingRecordings":
- List of next 5 episodes with status "scheduled" or "recording"
- Each row: episode title, show name, record date/time, guest count, format badge
- "View All" link to Episodes page

**Add to QuickActions:**
- "New Episode" (links to Episodes with ?new=true)
- "Add Guest" (links to Guests with ?new=true)

---

### Analytics (`/Analytics`)

Add a "Podcasts" tab alongside the existing streaming analytics.

**New "Podcasts" tab content:**

Overview Cards:
- Total Episodes Published
- Total Downloads (all time)
- Average Downloads per Episode
- Avg Completion Rate
- Total Revenue from Sponsorships

Charts:
- Downloads Over Time (line chart, per episode publish date)
- Downloads by Show (bar chart, if multiple shows)
- Episode Format Distribution (pie chart: solo vs interview vs panel vs etc.)
- Listener Retention / Completion Rate Trend (line chart)
- Top Episodes by Downloads (horizontal bar chart, top 10)

---

### Revenue (`/Revenue`)

Add podcast revenue sources to the existing revenue tracker.

**New source options to add:**
- "podcast_sponsorship"
- "podcast_ad_preroll"
- "podcast_ad_midroll"
- "podcast_ad_postroll"
- "podcast_premium"
- "podcast_donations"

**New platform options to add:**
- "spotify"
- "apple_podcasts"
- "patreon"

**In the Revenue by Source pie chart**, these podcast sources should appear in a distinct color range (warm tones like oranges/ambers to differentiate from the cool streaming blues/purples).

---

### Collaborations (`/Collaborations`)

Add podcast-specific collaboration types.

**New type options to add:**
- "podcast_guest_swap" — you appear on their podcast, they appear on yours
- "podcast_crossover" — joint episode published on both feeds
- "podcast_network" — collaboration within a podcast network

**Add a "Content Type" field to the collaboration model:**
- "stream" | "podcast" | "both"
- Show a small badge on each collaboration card indicating the type

---

### Equipment (`/Equipment`)

Add podcast-specific equipment categories.

**New categories to add:**
- "microphone_xlr"
- "microphone_usb"
- "audio_interface"
- "headphones"
- "pop_filter"
- "boom_arm"
- "acoustic_treatment"
- "mixer"
- "recorder"

---

### Clips (`/Clips`)

Expand clips to support podcast audiograms and snippets.

**New clip type options:**
- "audiogram" — short audio clip with waveform visualization for social media
- "podcast_highlight" — audio highlight from an episode
- "video_podcast_clip" — if the podcast is also filmed

**Add source field:**
- "stream" | "podcast"
- Show a badge on each clip indicating source

**New field:**
- source_episode_id (optional, reference to PodcastEpisode)

---

### Media (`/Media`)

Add podcast-specific media types.

**New type options to add:**
- "podcast_cover_art"
- "podcast_episode_art"
- "podcast_intro"
- "podcast_outro"
- "podcast_ad_read"
- "transcript"

---

### Multi-Platform Hub (`/Platforms`)

Add podcast platforms alongside streaming platforms.

**New platform cards to add:**
- Spotify (green #1DB954)
- Apple Podcasts (purple #872EC4)
- Google Podcasts (blue/yellow/green/red multicolor)
- Amazon Music (teal #25D1DA)
- YouTube Podcasts (red, same as YouTube streaming)
- Overcast (orange #FC7E0F)
- Pocket Casts (red #F43E37)

Each card shows:
- Platform icon + name
- Connection status
- Subscriber/follower count
- Last published episode date
- "Connect" / "Disconnect" button

Add a new section: "RSS Feed Management"
- Show RSS feed URL with copy button
- Validate RSS feed status
- Last build date

---

### AI Assistant (`/AI`)

Add podcast-specific suggestion chips:

- "Generate episode ideas for my tech podcast"
- "Write show notes for my latest episode"
- "Suggest interview questions for a guest about AI"
- "Help me plan my podcast content calendar for next month"
- "Analyze my podcast download trends"
- "Write a sponsor ad read for [brand]"
- "Create a podcast episode outline about [topic]"

---

### Notifications (`/Notifications`)

Add podcast-specific notification types:

- episode_reminder: "Recording for 'Episode 42: The Future of AI' starts in 1 hour"
- guest_confirmed: "Sarah Johnson confirmed for Episode 43"
- guest_declined: "Mark Lee declined the guest invitation"
- episode_published: "Episode 42 is now live on Spotify and Apple Podcasts"
- download_milestone: "Episode 42 hit 1,000 downloads!"
- review_received: "New 5-star review on Apple Podcasts"
- sponsor_deadline: "Sponsor ad read for BrandX due tomorrow"

---

### Settings (`/Settings`)

Add a "Podcast" tab to Settings:

- Default show (select from shows)
- Default recording equipment preset
- Auto-publish platforms (checkboxes: which platforms to publish to by default)
- Default episode format
- RSS feed settings (author name, email, copyright, explicit content flag)
- Transcript generation toggle (auto-generate transcripts)
- Default sponsor read positions (pre-roll, mid-roll, post-roll)

---

## Updated Sidebar Navigation

Add new items in a "Podcast" section separator:

```
--- Streaming ---
1. Dashboard
2. Stream Calendar
3. Collaborations
4. Equipment
5. Media Library
6. Clips & Highlights
7. Platform Hub

--- Podcast ---
8. Episodes
9. Shows
10. Guest Manager

--- Business ---
11. Analytics
12. Revenue

--- System ---
13. Team
14. AI Assistant
15. Notifications
16. Settings
```

The sidebar should show section headers as small uppercase gray text dividers between groups.

---

## Design Notes

- Keep the exact same dark theme, colors, and component patterns as the existing app
- Podcast-related accent color: use #FFA502 (warm amber) as a secondary accent for podcast features to visually distinguish from streaming (#6C63FF purple)
- Platform colors: Spotify #1DB954, Apple Podcasts #872EC4, Amazon #25D1DA, Overcast #FC7E0F, Pocket Casts #F43E37
- Use the existing StatCard, PageHeader, EmptyState, StatusBadge components
- All new modals should follow the existing Dialog pattern from shadcn/ui with dark theme styling
- Tables follow the existing pattern (dark background, subtle borders, hover states)
- Charts use recharts with the same tooltip styling as Revenue page
