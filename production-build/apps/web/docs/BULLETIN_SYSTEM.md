# Bulletin System Documentation

## Overview

The Lancelot bulletin system provides a comprehensive way to share announcements, updates, and emergency notifications across the organization. It supports three types of posts:

1. **General Bulletins** - Visible to all employees
2. **Department Bulletins** - Visible only to specific department members
3. **Targeted Bulletins** - Visible to selected departments

## Features

### Post Types

- **General Posts**: Sent to all active users in the system
- **Department Posts**: Sent only to users in a specific department
- **Targeted Posts**: Sent to users in selected departments

### Post Options

- **Pin Posts**: Keep important posts at the top
- **Emergency Posts**: Highlight critical information with visual alerts
- **Expiration Dates**: Automatically hide posts after a certain date
- **Categories**: Organize posts by type (General, Announcement, Update, Alert, Emergency)

### Notifications

Each bulletin post automatically generates notifications:
- General posts → All users receive notifications
- Department posts → Only department members receive notifications
- Targeted posts → Only users in selected departments receive notifications

Emergency posts create high-priority notifications with special formatting.

## User Interface

### Bulletin Widget (Dashboard)

The bulletin widget appears on the main dashboard and shows:
- Latest 3 posts (prioritized by emergency, pinned, then date)
- Emergency alerts with pulsing animation
- Quick access to create new posts
- Full bulletin board access

### Create Post Modal

Users can create posts with:
- Post type selection (General/Department/Targeted)
- Title and content
- Category selection
- Pin/Emergency toggles
- Expiration date picker
- Department targeting (for targeted posts)

### Full Bulletin Board

The expanded view shows:
- All relevant posts with pagination
- Edit/Delete options for post authors and admins
- Detailed post information including author, timestamp, and targets
- Visual indicators for emergency and pinned posts

## Technical Implementation

### Backend Components

1. **Database Schema** (`bulletin_posts` table):
   - Stores post content, metadata, and targeting information
   - Tracks views, pins, and emergency status
   - Supports department arrays for targeted posts

2. **GraphQL Resolvers** (`bulletin.ts`):
   - Query: `bulletinPosts` - Fetches relevant posts
   - Mutation: `createBulletinPost` - Creates new posts with notifications
   - Mutation: `updateBulletinPost` - Updates existing posts
   - Mutation: `deleteBulletinPost` - Removes posts

3. **Notification System**:
   - Automatically creates notifications for relevant users
   - Uses WebSocket subscriptions for real-time updates
   - Differentiates notification types based on post properties

### Frontend Components

1. **BulletinWidget** (`BulletinWidget.tsx`):
   - Dashboard widget with preview functionality
   - Create post button integration
   - Edit/Delete actions for authorized users

2. **CreateBulletinModal** (`CreateBulletinModal.tsx`):
   - Form-based post creation/editing
   - Dynamic post type selection
   - Department targeting interface

3. **GraphQL Integration**:
   - Queries: `GET_BULLETIN_POSTS`
   - Mutations: `CREATE_BULLETIN_POST`, `UPDATE_BULLETIN_POST`, `DELETE_BULLETIN_POST`

## Permissions

- **Create Posts**: All authenticated users can create posts
- **Edit Posts**: Only post authors and admins
- **Delete Posts**: Only post authors and admins
- **View Posts**: Based on post targeting (general/department/targeted)

## Usage Examples

### Creating a General Announcement
1. Click "פוסט חדש" (New Post) in the bulletin widget
2. Select "פוסט כללי" (General Post)
3. Fill in title and content
4. Select appropriate category
5. Click "פרסם פוסט" (Publish Post)

### Creating an Emergency Department Alert
1. Click "פוסט חדש" (New Post)
2. Select "פוסט מחלקתי" (Department Post)
3. Fill in urgent information
4. Toggle "פוסט חירום" (Emergency Post)
5. Optionally set expiration date
6. Click "פרסם פוסט" (Publish Post)

### Targeting Multiple Departments
1. Click "פוסט חדש" (New Post)
2. Select "פוסט ממוקד" (Targeted Post)
3. Select relevant departments from the list
4. Fill in content
5. Click "פרסם פוסט" (Publish Post)

## Best Practices

1. Use **Emergency posts** sparingly - only for critical, time-sensitive information
2. **Pin important posts** that need to stay visible longer
3. Set **expiration dates** for temporary announcements
4. Choose appropriate **categories** to help users filter information
5. Keep **titles concise** and **content clear**
6. For department-wide changes, use **department posts** rather than general posts

## Future Enhancements

Potential improvements for the bulletin system:
- Rich text editor for formatted content
- File attachments support
- Read receipts tracking
- Comments/reactions on posts
- Scheduled posting
- Email digest for offline users
- Analytics on post engagement 