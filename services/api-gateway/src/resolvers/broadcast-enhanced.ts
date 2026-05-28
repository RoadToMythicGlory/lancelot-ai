import { connectMongoose } from '../config/mongodb';
import { 
  BroadcastEvent, 
  RoutingConfig, 
  RoutingSource, 
  SatelliteSchedule 
} from '../models/broadcast.models';
import { Equipment, EquipmentAssignment, EquipmentHistory } from '../models/equipment.models';
import { syncSharedEngineeringSnapshotForEvent } from '../services/sharedEngineeringSnapshot';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
dayjs.extend(tz);
dayjs.tz.setDefault('Asia/Jerusalem');
// Notifications removed - can be re-implemented later
// import { createBroadcastPlanningNotification } from './notifications';
import { pubsub } from '../utils/pubsub';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import type { Context } from '../types';
import { createLogger } from '../utils/logger';
import {
  ensureShadowMcrEventForBroadcast,
  syncShadowMcrEventFromBroadcast,
  detachShadowMcrEventOnBroadcastDelete,
} from '../services/mcrShadowEvent';

const log = createLogger('broadcast-enhanced');

// Stub notification function - replace with real implementation later
const createBroadcastPlanningNotification = async (event: any, action: string) => {
  log.debug('Broadcast notification stub', { action, eventId: event?.id, title: event?.title });
};

interface BroadcastEventInput {
  title: string;
  hebrewTitle?: string;
  description?: string;
  eventType: string;
  startTime: string;
  endTime?: string;
  koTime?: string;
  arrivalTime?: string;
  location?: string;
  venue?: string;
  synopsis?: string;
  channel?: string;
  parallelChannel?: string;
  channel1_4k?: boolean;
  live?: boolean;
  notes?: string;
  subtitles?: string;
  sport?: string;
  league?: string;
  stage?: string;
  homeTeam?: string;
  awayTeam?: string;
  source?: string;
  destination?: string;
  satellite?: string;
  technicalDirectorId?: string;
  controlOperatorId?: string;
  priority?: string;
  metadata?: any;
  departmentId?: string;
}

// Initialize MongoDB connection
let mongooseConnected = false;

async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

// Map database event_type values to GraphQL BroadcastEventType enum values
function mapEventTypeToEnum(dbEventType: string | null | undefined) {
  if (!dbEventType) return null;
  
  const eventTypeMapping: { [key: string]: string } = {
    'LIVE': 'live_show',
    'live': 'live_show',
    'RECORDED': 'pre_recorded',
    'recorded': 'pre_recorded',
    'REMOTE': 'live_show',
    'remote': 'live_show',
    'STUDIO': 'live_show',
    'studio': 'live_show',
    'news': 'news',
    'sports': 'sports',
    'entertainment': 'entertainment',
    'commercial': 'commercial',
    'break': 'break',
    'technical': 'technical'
  };
  
  return eventTypeMapping[dbEventType] || 'live_show';
}

// Map database accessibility/translation values to GraphQL AccessibilityType enum values  
function mapAccessibilityToEnum(dbValue: string | null | undefined) {
  if (!dbValue) return 'none';
  
  const accessibilityMapping: { [key: string]: string } = {
    'sign_language': 'sign_language',
    'subtitles': 'subtitles', 
    'closed_captions': 'subtitles',
    'none': 'none',
    'NONE': 'none',
    '': 'none'
  };
  
  return accessibilityMapping[dbValue] || 'none';
}

// Helper function to normalize channel name to Hebrew
function normalizeChannelToHebrew(channel: string | null | undefined): string | null {
  if (!channel) return null;
  
  const channelMappings = new Map([
    // 4K variants
    ['5 SPORT 4K', 'CHANNEL 1 4K'],
    ['SPORT 4K', 'CHANNEL 1 4K'],
    ['5SPORT4K', 'CHANNEL 1 4K'],
         ['CHANNEL1 4K', 'CHANNEL 1 4K'],
    // Main channel variants
    ['5 SPORT', 'CHANNEL 1'],
    ['SPORT', 'CHANNEL 1'],
    ['5SPORT', 'CHANNEL 1'],
    ['CHANNEL1', 'CHANNEL 1'],
    ['CHANNEL 1', 'CHANNEL 1'],
    // Live variants
    ['5 LIVE', 'CHANNEL 4'],
    ['LIVE', 'CHANNEL 4'],
    ['5LIVE', 'CHANNEL 4'],
    ['SPORT LIVE', 'CHANNEL 4'],
    ['CHANNEL 4', 'CHANNEL 4'],
    // Plus variants
    ['5 PLUS', 'CHANNEL 2'],
    ['PLUS', 'CHANNEL 2'],
    ['5PLUS', 'CHANNEL 2'],
    ['SPORT PLUS', 'CHANNEL 2'],
    ['CHANNEL 2', 'CHANNEL 2'],
    // Stars variants
    ['5 STARS', 'CHANNEL 5'],
    ['STARS', 'CHANNEL 5'],
    ['5STARS', 'CHANNEL 5'],
    ['SPORT STARS', 'CHANNEL 5'],
    ['CHANNEL 5', 'CHANNEL 5'],
    // Gold variants
    ['5 GOLD', 'CHANNEL 3'],
    ['GOLD', 'CHANNEL 3'],
    ['5GOLD', 'CHANNEL 3'],
    ['SPORT GOLD', 'CHANNEL 3'],
    ['CHANNEL 3', 'CHANNEL 3'],
    // Hebrew variants normalization
    ['CHANNEL 3', 'CHANNEL 3']
  ]);

  const upperChannel = channel.toUpperCase().trim();
  
  // Try exact match first
  if (channelMappings.has(upperChannel)) {
    return channelMappings.get(upperChannel) || null;
  }
  
  // Try substring matches (longer patterns first)
  const patterns = Array.from(channelMappings.keys()).sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    if (upperChannel.includes(pattern)) {
      return channelMappings.get(pattern) || null;
    }
  }
  
  // If already in Hebrew format, return as is
  if (/[\u0590-\u05FF]/.test(channel)) {
    return channel;
  }
  
  // Default fallback
  return 'CHANNEL 1';
}

function validateInput(input: BroadcastEventInput): string[] {
  const errors: string[] = [];
  
  if (!input.title || input.title.trim().length === 0) {
    errors.push('Title is required');
  }
  
  if (!input.eventType) {
    errors.push('Event type is required');
  }
  
  if (!input.startTime) {
    errors.push('Start time is required');
  }
  
  // Validate date format
  if (input.startTime && isNaN(Date.parse(input.startTime))) {
    errors.push('Invalid start time format');
  }
  
  if (input.endTime && isNaN(Date.parse(input.endTime))) {
    errors.push('Invalid end time format');
  }
  
  // Business logic validation
  if (input.startTime && input.endTime) {
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (start >= end) {
      errors.push('End time must be after start time');
    }
  }
  
  return errors;
}

interface ChannelOverlap {
  eventId: string;
  eventTitle: string;
  startTime: string;
  endTime: string;
  channel: string;
}

// Check for channel overlaps with existing events
async function checkChannelOverlaps(
  input: BroadcastEventInput | any, 
  excludeEventId?: string
): Promise<ChannelOverlap[]> {
  try {
    await ensureMongoConnection();
    
    const overlaps: ChannelOverlap[] = [];
    
    console.log('🔍 checkChannelOverlaps called with input:', input);
    
    // Get channel(s) to check
    const channelsToCheck: string[] = [];
    if (input.channel) channelsToCheck.push(input.channel);
    if (input.parallelChannel) channelsToCheck.push(input.parallelChannel);
    
    console.log('📺 Channels to check:', channelsToCheck);
    
    if (channelsToCheck.length === 0) {
      console.log('⚠️ No channels provided, skipping overlap check');
      return overlaps; // No channels to check
    }
  
  const startTime = new Date(input.startTime);
  const endTime = input.endTime ? new Date(input.endTime) : new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours
  
  // Query for overlapping events on the same channels
  const query: any = {
    $and: [
      {
        $or: [
          { channel: { $in: channelsToCheck } },
          { parallelChannel: { $in: channelsToCheck } }
        ]
      },
      {
        $or: [
          // Event starts before and ends after our start
          {
            startTime: { $lte: startTime },
            $or: [
              { endTime: { $gte: startTime } },
              { endTime: null } // Events without end time are assumed to be long-running
            ]
          },
          // Event starts during our time range
          {
            startTime: { $gte: startTime, $lt: endTime }
          },
          // Our event starts during their time range
          {
            startTime: { $lte: endTime },
            $or: [
              { endTime: { $gte: endTime } },
              { endTime: null }
            ]
          }
        ]
      }
    ]
  };
  
  // Exclude the current event if updating
  if (excludeEventId) {
    const mongoose = require('mongoose');
    query._id = { $ne: new mongoose.Types.ObjectId(excludeEventId) };
  }
  
  console.log('🔍 Checking for channel overlaps with query:', JSON.stringify(query, null, 2));
  
  const overlappingEvents = await BroadcastEvent.find(query).exec();
  
  for (const event of overlappingEvents) {
    // Check which specific channel is overlapping
    const eventChannels = [event.channel, event.parallelChannel].filter(Boolean);
    const overlappingChannels = channelsToCheck.filter(ch => eventChannels.includes(ch));
    
    for (const channel of overlappingChannels) {
      overlaps.push({
        eventId: event._id.toString(),
        eventTitle: event.title || event.hebrewTitle || 'אירוע ללא שם',
        startTime: event.startTime.toISOString(),
        endTime: event.endTime ? event.endTime.toISOString() : new Date(event.startTime.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        channel: channel
      });
    }
  }
  
  console.log('⚠️  Found channel overlaps:', overlaps.length);
  return overlaps;
  } catch (error) {
    console.error('❌ Error in checkChannelOverlaps:', error);
    throw error;
  }
}

// Map database status values to GraphQL BroadcastEventStatus enum values
function mapStatusToEnum(dbStatus: string | null | undefined): string {
  // Handle null/undefined values
  if (!dbStatus) {
    return 'planned';
  }
  
  const statusMapping: { [key: string]: string } = {
    'PLANNED': 'planned',
    'planned': 'planned',
    'scheduled': 'planned',
    'SCHEDULED': 'planned',
    'CONFIRMED': 'confirmed', 
    'confirmed': 'confirmed',
    'IN_PROGRESS': 'in_progress',
    'in_progress': 'in_progress',
    'COMPLETED': 'completed',
    'completed': 'completed',
    'CANCELLED': 'cancelled',
    'cancelled': 'cancelled',
    'ERROR': 'cancelled',
    'error': 'cancelled'
  };
  
  // Return mapped value or default to 'planned' if unknown
  return statusMapping[dbStatus] || 'planned';
}

function mapDocumentToResult(doc: any): any {
  return {
    id: doc._id?.toString() || doc.id,
    eventNumber: doc.eventNumber || 0,
    title: doc.title || doc.original_title || doc.programName,
    hebrewTitle: doc.hebrewTitle || doc.hebrew_title,
    description: doc.description || doc.synopsis,
    eventType: doc.eventType || doc.type,
    startTime: doc.startTime?.toISOString() || doc.start_time?.toISOString(),
    endTime: doc.endTime?.toISOString() || doc.end_time?.toISOString(),
    koTime: doc.koTime?.toISOString(),
    arrivalTime: doc.arrivalTime?.toISOString(),
    actualStartTime: doc.actualStartTime?.toISOString(),
    actualEndTime: doc.actualEndTime?.toISOString(),
    location: doc.location,
    venue: doc.venue,
    liveLocation: doc.liveLocation,
    synopsis: doc.synopsis,
    synopsisFile: doc.synopsisFile,
    channel: doc.channel,
    parallelChannel: doc.parallelChannel,
    channel1_4k: doc.channel1_4k || false,
    live: doc.live || false,
    backup: doc.backup || false,
    requiresSignLanguage: doc.requiresSignLanguage || false,
    requiresSubtitles: doc.requiresSubtitles || false,
    accessibilityStatus: mapAccessibilityToEnum(doc.translationType) || doc.accessibilityStatus,
    contentDuration: doc.contentDuration,
    contentType: doc.contentType,
    contentSource: doc.contentSource,
    source: doc.source,
    destination: doc.destination,
    satellite: doc.satellite,
    technicalDirectorId: doc.technicalDirectorId,
    controlOperatorId: doc.controlOperatorId,
    priority: doc.priority || 'normal',
    routingConfig: doc.routingConfig || {},
    routingPreset: doc.routingPreset,
    notes: doc.notes,
    subtitles: doc.subtitles,
    sport: doc.sport,
    league: doc.league,
    stage: doc.stage,
    homeTeam: doc.homeTeam,
    awayTeam: doc.awayTeam,
    productionCrew: doc.productionCrew || [],
    equipmentList: doc.equipmentList || [],
    filePath: doc.filePath,
    receptionStartTime: doc.receptionStartTime?.toISOString(),
    gmtStartTime: doc.gmtStartTime?.toISOString(),
    gmtEndTime: doc.gmtEndTime?.toISOString(),
    metadata: doc.metadata || {},
    createdBy: doc.createdBy ? {
      id: doc.createdBy,
      firstName: null,
      lastName: null
    } : null,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
    
    // Legacy fields for compatibility
    type: mapEventTypeToEnum(doc.type || doc.eventType),
    status: mapStatusToEnum(doc.status || doc.event_status),
    originalTitle: doc.original_title || doc.title,
    programName: doc.programName || doc.title,
    episodeName: doc.episodeName,
    projectCode: doc.projectCode || doc.project_code,
    episodeNumber: doc.episodeNumber || doc.episode_number,
    season: doc.season,
    isLive: doc.isLive ?? doc.is_live ?? false,
    isRerun: doc.isRerun ?? doc.is_rerun ?? false,
    departmentId: doc.departmentId,
    departmentData: doc.departmentData,
    
    // Map snake_case fields to match frontend expectations
    production_crew: doc.productionCrew || [],
    equipment_list: doc.equipmentList || [],
    file_path: doc.filePath,
    reception_start_time: doc.receptionStartTime?.toISOString(),
    gmt_start_time: doc.gmtStartTime?.toISOString(),
    gmt_end_time: doc.gmtEndTime?.toISOString()
  };
}

export const enhancedBroadcastResolvers = {
  Query: {
    broadcastEvents: async (_: any, args: { startDate?: string; endDate?: string; filter?: any; limit?: number; offset?: number }, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_VIEW);
        await ensureMongoConnection();

        // Build MongoDB query
        const query: any = {};

        // Add date filters
        if (args.startDate || args.endDate) {
          query.startTime = {};
          if (args.startDate) {
            query.startTime.$gte = new Date(args.startDate);
          }
          if (args.endDate) {
            query.startTime.$lte = new Date(args.endDate);
          }
        }

        // Add additional filters
        if (args.filter) {
          if (args.filter.eventType) {
            query.eventType = args.filter.eventType;
          }

          if (args.filter.departmentId) {
            query.departmentId = args.filter.departmentId;
          }
        }

        // Apply pagination defaults / hard cap to prevent loading the full collection.
        const MAX_LIMIT = 500;
        const limit = Math.min(Math.max(args.limit ?? 200, 1), MAX_LIMIT);
        const offset = Math.max(args.offset ?? 0, 0);

        // Debug-only: capture inputs without leaking the full event payload.
        // Set LOG_LEVEL=debug to surface these in non-prod environments.
        log.debug('broadcastEvents query', {
          startDate: args.startDate,
          endDate: args.endDate,
          eventType: args.filter?.eventType,
          departmentId: args.filter?.departmentId,
          limit,
          offset,
        });

        const events = await BroadcastEvent.find(query)
          .sort({ startTime: 1 })
          .skip(offset)
          .limit(limit)
          .exec();

        const mappedResults = events.map(mapDocumentToResult);

        log.debug('broadcastEvents result', { count: mappedResults.length });
        return mappedResults;

      } catch (error) {
        log.error('Failed to fetch broadcast events', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error) {
          if (error.message.includes('connection')) {
            throw new Error('Database connection error. Please check your network connection and try again.');
          } else {
            throw new Error(`Failed to fetch broadcast events: ${error.message}`);
          }
        }

        throw new Error('Unknown error occurred while fetching broadcast events');
      }
    },

    // Commented out - not defined in schema
    // broadcastEventDepartmentData: async (_: any, { eventId, department }: { eventId: string; department: string }) => {
    //   try {
    //     await ensureMongoConnection();
    //     
    //     const event = await BroadcastEvent.findById(eventId).exec();
    //     
    //     if (!event) {
    //       throw new Error(`Broadcast event with ID ${eventId} not found`);
    //     }
    //     
    //     const metadata = event.metadata || {};
    //     const departmentData = metadata.departments?.[department] || null;
    //     
    //     return departmentData;
    //   } catch (error) {
    //     console.error('❌ Error fetching department data:', error);
    //     throw error instanceof Error ? error : new Error('Failed to fetch department data');
    //   }
    // },

    broadcastEvent: async (_: any, { id }: { id: string }, context: Context) => {
      try {
        const user = requirePermission(context, Permission.BROADCAST_VIEW);
        await ensureMongoConnection();

        if (!id) {
          throw new Error('Event ID is required');
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid broadcast event ID');
        }

        const event = await BroadcastEvent.findById(id).exec();

        if (!event) {
          throw new Error(`Broadcast event with ID ${id} not found`);
        }

        // Department-scoped access: department users can only read events
        // belonging to a department they are a member of (system admins
        // and IT admins bypass this check via requirePermission's role
        // hierarchy).
        const eventDept = (event as any).departmentId;
        if (
          eventDept &&
          user.systemRole !== 'SYSTEM_ADMIN' &&
          user.systemRole !== 'IT_ADMIN' &&
          !user.hasForDept(Permission.BROADCAST_VIEW, eventDept)
        ) {
          throw new Error('You do not have access to this broadcast event');
        }

        return mapDocumentToResult(event);

      } catch (error) {
        console.error('❌ Error fetching broadcast event:', error);
        throw error instanceof Error ? error : new Error('Failed to fetch broadcast event');
      }
    },
  },

  Mutation: {
    createBroadcastEvent: async (_: any, { input }: { input: BroadcastEventInput }, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        // Validate input
        const validationErrors = validateInput(input);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }
        
        console.log('🆕 Creating broadcast event with input:', input);
        
        // Map input to MongoDB document
        const eventData: any = {
          title: input.title,
          hebrewTitle: input.hebrewTitle,
          description: input.description,
          eventType: input.eventType,
          startTime: new Date(input.startTime),
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          koTime: input.koTime ? new Date(input.koTime) : undefined,
          arrivalTime: input.arrivalTime ? new Date(input.arrivalTime) : undefined,
          location: input.location,
          venue: input.venue,
          synopsis: input.synopsis,
          source: input.source,
          destination: input.destination,
          satellite: input.satellite,
          technicalDirectorId: input.technicalDirectorId,
          controlOperatorId: input.controlOperatorId,
          priority: input.priority || 'normal',
          metadata: input.metadata || {}
        };
        
        // Add enhanced fields if provided (normalize channels to Hebrew)
        if ('channel' in input) eventData.channel = normalizeChannelToHebrew(input.channel);
        if ('parallelChannel' in input) eventData.parallelChannel = normalizeChannelToHebrew(input.parallelChannel);
        if ('channel1_4k' in input) eventData.channel1_4k = input.channel1_4k;
        if ('live' in input) eventData.live = input.live;
        if ('notes' in input) eventData.notes = input.notes;
        if ('subtitles' in input) eventData.subtitles = input.subtitles;
        if ('sport' in input) eventData.sport = input.sport;
        if ('league' in input) eventData.league = input.league;
        if ('stage' in input) eventData.stage = input.stage;
        if ('homeTeam' in input) eventData.homeTeam = input.homeTeam;
        if ('awayTeam' in input) eventData.awayTeam = input.awayTeam;
        if ('departmentId' in input) eventData.departmentId = input.departmentId;
        
        const event = new BroadcastEvent(eventData);
        const savedEvent = await event.save();
        
        const created = mapDocumentToResult(savedEvent);
        console.log('✅ Successfully created broadcast event:', created.id);

        // Mirror into the MCR workspace.
        await ensureShadowMcrEventForBroadcast(savedEvent, context?.user?.userId);

        // Send notification about new broadcast event
        try {
          await createBroadcastPlanningNotification(created, 'created');
        } catch (notificationError) {
          console.error('⚠️ Failed to send notification for new broadcast event:', notificationError);
          // Don't fail the main operation if notification fails
        }
        
        // Publish event for real-time updates
        pubsub.publish('BROADCAST_EVENT_UPDATED', { broadcastEventUpdated: created });
        if (created.departmentId) {
          pubsub.publish(`BROADCAST_EVENT_UPDATED_${created.departmentId}`, { broadcastEventUpdated: created });
        }
        
        return created;
        
      } catch (error) {
        console.error('❌ Enhanced Error creating broadcast event:', error);
        
        if (error instanceof Error) {
          if (error.message.includes('duplicate key')) {
            throw new Error('A broadcast event with this information already exists');
          } else if (error.message.includes('Validation failed')) {
            throw error;
          } else {
            throw new Error(`Failed to create broadcast event: ${error.message}`);
          }
        }
        
        throw new Error('Unknown error occurred while creating broadcast event');
      }
    },

    updateBroadcastEvent: async (_: any, { id, input }: { id: string; input: Partial<BroadcastEventInput> }, context: Context) => {
      try {
        const user = requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        if (!id) {
          throw new Error('Event ID is required');
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid broadcast event ID');
        }

        // Check if event exists
        const existingEvent = await BroadcastEvent.findById(id).exec();
        if (!existingEvent) {
          throw new Error(`Broadcast event with ID ${id} not found`);
        }

        const existingDept = (existingEvent as any).departmentId;
        if (
          existingDept &&
          user.systemRole !== 'SYSTEM_ADMIN' &&
          user.systemRole !== 'IT_ADMIN' &&
          !user.hasForDept(Permission.BROADCAST_MANAGE, existingDept)
        ) {
          throw new Error('You do not have permission to modify this broadcast event');
        }
        
        // Build update data
        const updateData: any = {};
        
        // Map input fields to update data
        if (input.title !== undefined) updateData.title = input.title;
        if (input.hebrewTitle !== undefined) updateData.hebrewTitle = input.hebrewTitle;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.eventType !== undefined) updateData.eventType = input.eventType;
        if (input.startTime !== undefined) updateData.startTime = new Date(input.startTime);
        if (input.endTime !== undefined) updateData.endTime = new Date(input.endTime);
        if (input.koTime !== undefined) updateData.koTime = input.koTime ? new Date(input.koTime) : null;
        if (input.arrivalTime !== undefined) updateData.arrivalTime = input.arrivalTime ? new Date(input.arrivalTime) : null;
        if (input.location !== undefined) updateData.location = input.location;
        if (input.venue !== undefined) updateData.venue = input.venue;
        if (input.synopsis !== undefined) updateData.synopsis = input.synopsis;
        if (input.source !== undefined) updateData.source = input.source;
        if (input.destination !== undefined) updateData.destination = input.destination;
        if (input.satellite !== undefined) updateData.satellite = input.satellite;
        if (input.technicalDirectorId !== undefined) updateData.technicalDirectorId = input.technicalDirectorId;
        if (input.controlOperatorId !== undefined) updateData.controlOperatorId = input.controlOperatorId;
        if (input.priority !== undefined) updateData.priority = input.priority;
        if (input.metadata !== undefined) updateData.metadata = input.metadata;
        
        // Enhanced fields (normalize channels to Hebrew)
        if ('channel' in input) updateData.channel = normalizeChannelToHebrew(input.channel);
        if ('parallelChannel' in input) updateData.parallelChannel = normalizeChannelToHebrew(input.parallelChannel);
        if ('channel1_4k' in input) updateData.channel1_4k = input.channel1_4k;
        if ('live' in input) updateData.live = input.live;
        if ('notes' in input) updateData.notes = input.notes;
        if ('subtitles' in input) updateData.subtitles = input.subtitles;
        if ('sport' in input) updateData.sport = input.sport;
        if ('league' in input) updateData.league = input.league;
        if ('stage' in input) updateData.stage = input.stage;
        if ('homeTeam' in input) updateData.homeTeam = input.homeTeam;
        if ('awayTeam' in input) updateData.awayTeam = input.awayTeam;
        if ('departmentId' in input) updateData.departmentId = input.departmentId;
        
        const updatedEvent = await BroadcastEvent.findByIdAndUpdate(
          id,
          updateData,
          { new: true, runValidators: true }
        ).exec();
        
        if (!updatedEvent) {
          throw new Error('Failed to update broadcast event');
        }
        
        const result = mapDocumentToResult(updatedEvent);
        console.log('✅ Successfully updated broadcast event:', result.id);

        // Sync the shadow MCR event's title/start/end.
        await syncShadowMcrEventFromBroadcast(updatedEvent);

        // Send notification about updated broadcast event
        try {
          await createBroadcastPlanningNotification(result, 'updated');
        } catch (notificationError) {
          console.error('⚠️ Failed to send notification for updated broadcast event:', notificationError);
          // Don't fail the main operation if notification fails
        }
        
        // Publish event for real-time updates
        pubsub.publish('BROADCAST_EVENT_UPDATED', { broadcastEventUpdated: result });
        if (result.departmentId) {
          pubsub.publish(`BROADCAST_EVENT_UPDATED_${result.departmentId}`, { broadcastEventUpdated: result });
        }
        
        return result;
        
      } catch (error) {
        console.error('❌ Enhanced Error updating broadcast event:', error);
        
        if (error instanceof Error) {
          throw new Error(`Failed to update broadcast event: ${error.message}`);
        }
        
        throw new Error('Unknown error occurred while updating broadcast event');
      }
    },

    deleteBroadcastEvent: async (_: any, { id }: { id: string }, context: Context) => {
      try {
        const user = requirePermission(context, Permission.BROADCAST_DELETE);
        await ensureMongoConnection();

        if (!id) {
          throw new Error('Event ID is required');
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid broadcast event ID');
        }

        // Check if event exists and has dependencies
        const event = await BroadcastEvent.findById(id).exec();
        if (!event) {
          throw new Error(`Broadcast event with ID ${id} not found`);
        }

        const eventDept = (event as any).departmentId;
        if (
          eventDept &&
          user.systemRole !== 'SYSTEM_ADMIN' &&
          user.systemRole !== 'IT_ADMIN' &&
          !user.hasForDept(Permission.BROADCAST_DELETE, eventDept)
        ) {
          throw new Error('You do not have permission to delete this broadcast event');
        }
        
        // Check for related data
        const routingConfigs = await RoutingConfig.countDocuments({ eventId: id });
        const satelliteSchedules = await SatelliteSchedule.countDocuments({ eventId: id });
        
        if (routingConfigs > 0 || satelliteSchedules > 0) {
          throw new Error('Cannot delete broadcast event with related data. Please remove all assignments, routing configs, and schedules first.');
        }
        
        const result = await BroadcastEvent.findByIdAndDelete(id).exec();
        
        console.log('✅ Successfully deleted broadcast event:', id);

        if (result) {
          await detachShadowMcrEventOnBroadcastDelete(id);
        }

        // Send notification about deleted broadcast event
        try {
          await createBroadcastPlanningNotification({ id, title: event.title }, 'deleted');
        } catch (notificationError) {
          console.error('⚠️ Failed to send notification for deleted broadcast event:', notificationError);
          // Don't fail the main operation if notification fails
        }
        
        // Publish event for real-time updates
        const deletedEvent = mapDocumentToResult(event);
        deletedEvent.id = id; // Ensure the ID is included for the deleted event
        pubsub.publish('BROADCAST_EVENT_UPDATED', { broadcastEventUpdated: deletedEvent });
        if (event.departmentId) {
          pubsub.publish(`BROADCAST_EVENT_UPDATED_${event.departmentId}`, { broadcastEventUpdated: deletedEvent });
        }
        
        return true;
        
      } catch (error) {
        console.error('❌ Enhanced Error deleting broadcast event:', error);
        throw error instanceof Error ? error : new Error('Failed to delete broadcast event');
      }
    },

    updateBroadcastEventDepartmentData: async (_: any, { eventId, department, data }: { eventId: string; department: string; data: any }, context: Context) => {
      try {
        const user = requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        console.log('🔄 Updating department data for event:', eventId, 'department:', department);
        console.log('📦 Department data:', JSON.stringify(data, null, 2));

        if (!eventId) {
          throw new Error('Event ID is required');
        }

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
          throw new Error('Invalid broadcast event ID');
        }

        // Check if event exists
        const existingEvent = await BroadcastEvent.findById(eventId).exec();
        if (!existingEvent) {
          throw new Error(`Broadcast event with ID ${eventId} not found`);
        }

        const eventDept = (existingEvent as any).departmentId;
        if (
          eventDept &&
          user.systemRole !== 'SYSTEM_ADMIN' &&
          user.systemRole !== 'IT_ADMIN' &&
          !user.hasForDept(Permission.BROADCAST_MANAGE, eventDept)
        ) {
          throw new Error('You do not have permission to update this broadcast event');
        }
        
        // Get existing metadata or create new
        const currentMetadata = existingEvent.metadata || {};
        const departments = currentMetadata.departments || {};
        
        // Extract the department-specific data and custom data
        const departmentData = data[department] || {};
        const customData = data.customData || {};

        // NOTE: The warehouse branch of this resolver used to ALSO mutate
        // `Equipment.quantityAvailable`/`quantityAssigned` and create
        // `EquipmentAssignment` documents inline whenever `data.warehouse.assignedItems`
        // changed. That ran in addition to the modal's own
        // `createEquipmentAssignment` -> `allocateEquipment` call (which already
        // does an atomic `$inc`) and the modal's `updateWarehouseEquipmentQuantity`
        // call, producing 2-3× over-counts on every scan and leaving orphan
        // `quantityAssigned` units after a return.
        //
        // The single source of truth for stock is now:
        //   createEquipmentAssignment / updateEquipmentAssignment / returnEquipmentFromEvent
        // This resolver only persists event metadata.

        // Merge department data with custom data
        departments[department] = {
          ...departments[department],
          ...departmentData,
          ...customData, // Merge custom fields at the same level
          lastUpdated: new Date().toISOString(),
        };
        
        // Update the metadata with the new department data
        const updatedMetadata = {
          ...currentMetadata,
          departments
        };
        
        // Update the event with the new metadata
        const updatedEvent = await BroadcastEvent.findByIdAndUpdate(
          eventId,
          { 
            metadata: updatedMetadata,
            updatedAt: new Date()
          },
          { new: true, runValidators: true }
        ).exec();
        
        if (!updatedEvent) {
          throw new Error('Failed to update broadcast event department data');
        }
        
        // Mirror flagged shared engineering equipment into the broadcast
        // metadata + linked MCR shadow event whenever the warehouse
        // department was just synced. Best-effort.
        if (department === 'warehouse') {
          await syncSharedEngineeringSnapshotForEvent(eventId).catch((err) =>
            console.error('Shared engineering snapshot sync (enhanced dept data) failed', err),
          );
        }

        const result = mapDocumentToResult(updatedEvent);
        console.log('✅ Successfully updated department data for event:', result.id);
        
        return result;
        
      } catch (error) {
        console.error('❌ Error updating broadcast event department data:', error);
        
        if (error instanceof Error) {
          throw new Error(`Failed to update department data: ${error.message}`);
        }
        
        throw new Error('Unknown error occurred while updating department data');
      }
    },

    createBroadcastEventsFromExcel: async (_: any, { events }: { events: any[] }, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        const createdEvents: any[] = [];
        const errors: string[] = [];
        
        console.log('📊 Creating broadcast events from Excel:', events.length, 'events');
        
        for (const eventData of events) {
          try {
            // Parse date and time
            const [day, month, year] = eventData.date.split('/');
            const [hours, minutes] = eventData.startTime.split(':');
            const startTime = dayjs.tz(`${day}/${month}/${year} ${hours}:${minutes}`, 'Asia/Jerusalem').toDate();
            
            // Calculate end time (default to 2 hours if not specified)
            const endTime = dayjs(startTime).add(2, 'hour').toDate();
            
            // Extract additional fields from eventData.metadata.eventDetails
            const eventDetails = eventData.metadata?.eventDetails || {};
            
            // Parse KO time if available
            let koTime = null;
            if (eventDetails.koTime) {
              const [koHours, koMinutes] = eventDetails.koTime.split(':');
              koTime = dayjs.tz(`${day}/${month}/${year} ${koHours}:${koMinutes}`, 'Asia/Jerusalem').toDate();
            }
            
            // Parse end time if available
            let actualEndTime = endTime;
            if (eventDetails.endTime) {
              const [endHours, endMinutes] = eventDetails.endTime.split(':');
              actualEndTime = dayjs.tz(`${day}/${month}/${year} ${endHours}:${endMinutes}`, 'Asia/Jerusalem').toDate();
            }
            
            // Create the event data with all available fields
            const newEventData = {
              title: eventData.title,
              hebrewTitle: eventData.title,
              eventType: eventData.eventType || 'live',
              startTime: startTime,
              endTime: actualEndTime,
              koTime: koTime,
              channel: normalizeChannelToHebrew(eventData.channel) || 'CHANNEL 1',
              parallelChannel: normalizeChannelToHebrew(eventDetails.parallelChannel) || null,
              channel1_4k: eventDetails.channel1_4k === 'כן' || eventDetails.channel1_4k === true || false,
              live: eventDetails.live === 'LIVE' || eventDetails.live === 'כן' || true,
              location: eventData.location || '',
              notes: eventData.notes || '',
              subtitles: eventDetails.subtitles || null,
              sport: eventDetails.sport || null,
              league: eventDetails.league || null,
              stage: eventDetails.stage || null,
              homeTeam: eventDetails.homeTeam || null,
              awayTeam: eventDetails.awayTeam || null,
              metadata: {
                ...eventData.metadata,
                importedFromExcel: true,
                importedAt: new Date()
              }
            };
            
            // Create the event in MongoDB
            const event = new BroadcastEvent(newEventData);
            const savedEvent = await event.save();
            
            createdEvents.push(mapDocumentToResult(savedEvent));
            console.log('✅ Created event:', savedEvent.title);

            await ensureShadowMcrEventForBroadcast(savedEvent, context?.user?.userId);

            // Send notification for the created event
            try {
              await createBroadcastPlanningNotification(mapDocumentToResult(savedEvent), 'created');
            } catch (notificationError) {
              console.error('⚠️ Failed to send notification for batch created event:', notificationError);
              // Don't fail the batch operation if notification fails
            }
            
            // Publish event for real-time updates
            const createdEvent = mapDocumentToResult(savedEvent);
            pubsub.publish('BROADCAST_EVENT_UPDATED', { broadcastEventUpdated: createdEvent });
            if (createdEvent.departmentId) {
              pubsub.publish(`BROADCAST_EVENT_UPDATED_${createdEvent.departmentId}`, { broadcastEventUpdated: createdEvent });
            }
          } catch (error: any) {
            console.error(`Error creating event "${eventData.title}":`, error);
            errors.push(`Failed to create event "${eventData.title}": ${error.message}`);
          }
        }
        
        console.log('✅ Batch creation complete:', createdEvents.length, 'created,', errors.length, 'errors');
        
        return {
          success: createdEvents.length > 0,
          eventsCreated: createdEvents.length,
          errors,
          events: createdEvents
        };
      } catch (error: any) {
        console.error('❌ Error in batch event creation:', error);
        throw new Error(`Failed to create events from Excel: ${error.message}`);
      }
    },

    deleteBroadcastEventsByDateRange: async (_: any, { startDate, endDate }: { startDate: string; endDate: string }, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_DELETE);
        await ensureMongoConnection();

        const errors: string[] = [];
        
        console.log('🗑️ Deleting broadcast events between:', startDate, 'and', endDate);
        
        // Build query for date range
        const query = {
          startTime: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        };
        
        // First, count how many events will be deleted
        const countToDelete = await BroadcastEvent.countDocuments(query);
        console.log(`📊 Found ${countToDelete} events to delete`);
        
        if (countToDelete === 0) {
          return {
            success: true,
            deletedCount: 0,
            errors: ['No events found in the specified date range']
          };
        }
        
        // Collect ids first so we can detach their MCR shadows after the
        // bulk delete completes.
        const toDelete = await BroadcastEvent.find(query, { _id: 1 }).lean();

        // Delete the events
        const deleteResult = await BroadcastEvent.deleteMany(query);
        
        console.log('✅ Batch delete complete:', deleteResult.deletedCount, 'events deleted');

        for (const doc of toDelete) {
          await detachShadowMcrEventOnBroadcastDelete(doc._id.toString());
        }
        
        return {
          success: deleteResult.acknowledged,
          deletedCount: deleteResult.deletedCount,
          errors
        };
      } catch (error: any) {
        console.error('❌ Error in batch delete:', error);
        return {
          success: false,
          deletedCount: 0,
          errors: [`Failed to delete events: ${error.message}`]
        };
      }
    },

    deleteImportedBroadcastEvents: async (_: any, __: any, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_DELETE);
        await ensureMongoConnection();

        const errors: string[] = [];
        
        console.log('🗑️ Deleting all imported broadcast events...');
        
        // Query for events that were imported from Excel
        const query = {
          'metadata.importedFromExcel': true
        };
        
        // First, count how many events will be deleted
        const countToDelete = await BroadcastEvent.countDocuments(query);
        console.log(`📊 Found ${countToDelete} imported events to delete`);
        
        if (countToDelete === 0) {
          return {
            success: true,
            deletedCount: 0,
            errors: ['No imported events found']
          };
        }
        
        // Delete the events
        const deleteResult = await BroadcastEvent.deleteMany(query);
        
        console.log('✅ Batch delete complete:', deleteResult.deletedCount, 'imported events deleted');
        
        return {
          success: deleteResult.acknowledged,
          deletedCount: deleteResult.deletedCount,
          errors
        };
      } catch (error: any) {
        console.error('❌ Error deleting imported events:', error);
        return {
          success: false,
          deletedCount: 0,
          errors: [`Failed to delete imported events: ${error.message}`]
        };
      }
    },

    // Channel overlap detection resolvers
    // Commented out - overlap checking is integrated into createBroadcastEventWithOverlapCheck
    // checkChannelOverlaps: async (_: any, { input }: { input: BroadcastEventInput }) => {
    //   try {
    //     const overlaps = await checkChannelOverlaps(input);
    //     const hasOverlaps = overlaps.length > 0;
        
    //     let message = '';
    //     if (hasOverlaps) {
    //       message = `נמצאו ${overlaps.length} חפיפות ערוצים`;
    //     } else {
    //       message = 'לא נמצאו חפיפות ערוצים';
    //     }
        
    //     return {
    //       hasOverlaps,
    //       overlaps,
    //       message
    //     };
    //   } catch (error: any) {
    //     console.error('❌ Error checking channel overlaps:', error);
    //     throw new Error(`Failed to check channel overlaps: ${error.message}`);
    //   }
    // },

    createBroadcastEventWithOverlapCheck: async (_: any, { input, forceCreate = false }: { input: BroadcastEventInput; forceCreate?: boolean }, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        console.log('🚀 createBroadcastEventWithOverlapCheck called with:', { input, forceCreate });
        
        // First, check for overlaps
        const overlaps = await checkChannelOverlaps(input);
        const hasOverlaps = overlaps.length > 0;
        
        console.log('📊 Overlap check result:', { hasOverlaps, overlapCount: overlaps.length });
        
        if (hasOverlaps && !forceCreate) {
          // Create detailed overlap message with all overlapping events
          let message = '';
          if (overlaps.length === 1) {
            const overlap = overlaps[0];
            const startTime = new Date(overlap.startTime).toLocaleString('he-IL', { 
              hour: '2-digit', 
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit'
            });
            const endTime = new Date(overlap.endTime).toLocaleString('he-IL', { 
              hour: '2-digit', 
              minute: '2-digit'
            });
            message = `חפיפת ערוץ עם אירוע "${overlap.eventTitle}"\nבערוץ ${overlap.channel} (${startTime} - ${endTime})\nהאם ברצונך להמשיך?`;
          } else {
            message = `נמצאו ${overlaps.length} חפיפות ערוצים:\n`;
            overlaps.forEach((overlap, index) => {
              const startTime = new Date(overlap.startTime).toLocaleString('he-IL', { 
                hour: '2-digit', 
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
              });
              const endTime = new Date(overlap.endTime).toLocaleString('he-IL', { 
                hour: '2-digit', 
                minute: '2-digit'
              });
              message += `${index + 1}. "${overlap.eventTitle}" בערוץ ${overlap.channel} (${startTime} - ${endTime})\n`;
            });
            message += 'האם ברצונך להמשיך?';
          }
          
          // Return overlap information without creating
          return {
            success: false,
            event: null,
            overlapCheck: {
              hasOverlaps: true,
              overlaps,
              message
            },
            requiresConfirmation: true
          };
        }
        
        // Create the event (either no overlaps or forced creation)
        console.log('✅ Proceeding to create event');
        await ensureMongoConnection();
        
        // Validate input
        const validationErrors = validateInput(input);
        if (validationErrors.length > 0) {
          console.log('❌ Validation errors:', validationErrors);
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }
        
        console.log('🆕 Creating broadcast event with overlap check:', input);
        
        // Map input to MongoDB document
        const eventData: any = {
          title: input.title,
          hebrewTitle: input.hebrewTitle,
          description: input.description,
          eventType: input.eventType,
          startTime: new Date(input.startTime),
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          koTime: input.koTime ? new Date(input.koTime) : undefined,
          arrivalTime: input.arrivalTime ? new Date(input.arrivalTime) : undefined,
          location: input.location,
          venue: input.venue,
          synopsis: input.synopsis,
          source: input.source,
          destination: input.destination,
          satellite: input.satellite,
          technicalDirectorId: input.technicalDirectorId,
          controlOperatorId: input.controlOperatorId,
          priority: input.priority || 'normal',
          metadata: input.metadata || {}
        };
        
        // Add enhanced fields if provided (normalize channels to Hebrew)
        if ('channel' in input) eventData.channel = normalizeChannelToHebrew(input.channel);
        if ('parallelChannel' in input) eventData.parallelChannel = normalizeChannelToHebrew(input.parallelChannel);
        if ('channel1_4k' in input) eventData.channel1_4k = input.channel1_4k;
        if ('live' in input) eventData.live = input.live;
        if ('notes' in input) eventData.notes = input.notes;
        if ('subtitles' in input) eventData.subtitles = input.subtitles;
        if ('sport' in input) eventData.sport = input.sport;
        if ('league' in input) eventData.league = input.league;
        if ('stage' in input) eventData.stage = input.stage;
        if ('homeTeam' in input) eventData.homeTeam = input.homeTeam;
        if ('awayTeam' in input) eventData.awayTeam = input.awayTeam;
        if ('departmentId' in input) eventData.departmentId = input.departmentId;
        
        console.log('💾 About to save event data:', eventData);
        const event = new BroadcastEvent(eventData);
        console.log('📝 Created MongoDB document, about to save...');
        const savedEvent = await event.save();
        console.log('💾 Successfully saved event to MongoDB');
        
        const created = mapDocumentToResult(savedEvent);
        console.log('✅ Successfully created broadcast event with overlap check:', created.id);

        await ensureShadowMcrEventForBroadcast(savedEvent, context?.user?.userId);

        // Send notification for the created event
        try {
          console.log('🔔 About to send notification for event:', created.id, created.title);
          await createBroadcastPlanningNotification(created, 'created');
          console.log('📧 Notification sent successfully for created broadcast event');
        } catch (notificationError) {
          console.error('⚠️ Failed to send notification for created event:', notificationError);
          // Don't fail the operation if notification fails
        }
        
        return {
          success: true,
          event: created,
          overlapCheck: {
            hasOverlaps,
            overlaps,
            message: hasOverlaps ? 'האירוע נוצר למרות החפיפה' : 'האירוע נוצר בהצלחה'
          },
          requiresConfirmation: false
        };
        
      } catch (error: any) {
        console.error('❌ Error creating broadcast event with overlap check:', error);
        throw new Error(`Failed to create broadcast event: ${error.message}`);
      }
    },

    createBroadcastEventsFromExcelWithOverlapCheck: async (_: any, { events, forceCreate = false }: { events: any[]; forceCreate?: boolean }, context: Context) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        console.log('📊 Creating broadcast events from Excel with overlap check:', events.length, 'events');
        
        // First, check for overlaps across all events
        const allOverlaps: ChannelOverlap[] = [];
        const eventsWithOverlaps: string[] = [];
        
        for (const eventData of events) {
          // Parse the event data into input format for overlap checking
          const [day, month, year] = eventData.date.split('/');
          const [hours, minutes] = eventData.startTime.split(':');
          const startTime = dayjs.tz(`${day}/${month}/${year} ${hours}:${minutes}`, 'Asia/Jerusalem').toDate();
          
          const eventDetails = eventData.metadata?.eventDetails || {};
          let actualEndTime = dayjs(startTime).add(2, 'hour').toDate(); // Default 2 hours
          if (eventDetails.endTime) {
            const [endHours, endMinutes] = eventDetails.endTime.split(':');
            actualEndTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(endHours), parseInt(endMinutes));
          }
          
          const checkInput = {
            startTime: startTime.toISOString(),
            endTime: actualEndTime.toISOString(),
            channel: eventData.channel || 'CHANNEL 1',
            parallelChannel: eventDetails.parallelChannel || null
          };
          
          const overlaps = await checkChannelOverlaps(checkInput);
          if (overlaps.length > 0) {
            allOverlaps.push(...overlaps);
            eventsWithOverlaps.push(eventData.title);
          }
        }
        
        const hasOverlaps = allOverlaps.length > 0;
        
        if (hasOverlaps && !forceCreate) {
          // Create detailed overlap message with specific event information
          let message = `נמצאו ${allOverlaps.length} חפיפות ערוצים:\n\n`;
          
          // Group overlaps by channel for better readability
          const overlapsByChannel = new Map<string, ChannelOverlap[]>();
          allOverlaps.forEach(overlap => {
            if (!overlapsByChannel.has(overlap.channel)) {
              overlapsByChannel.set(overlap.channel, []);
            }
            overlapsByChannel.get(overlap.channel)!.push(overlap);
          });
          
          overlapsByChannel.forEach((channelOverlaps, channel) => {
            message += `ערוץ ${channel}:\n`;
            channelOverlaps.forEach((overlap, index) => {
              const startTime = new Date(overlap.startTime).toLocaleString('he-IL', { 
                hour: '2-digit', 
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
              });
              const endTime = new Date(overlap.endTime).toLocaleString('he-IL', { 
                hour: '2-digit', 
                minute: '2-digit'
              });
              message += `  • "${overlap.eventTitle}" (${startTime} - ${endTime})\n`;
            });
            message += '\n';
          });
          
          message += 'האם ברצונך להמשיך?';
          
          return {
            success: false,
            eventsCreated: 0,
            errors: [],
            events: [],
            overlapCheck: {
              hasOverlaps: true,
              overlaps: allOverlaps,
              message
            },
            requiresConfirmation: true
          };
        }
        
        // Create the events (either no overlaps or forced creation)
        const createdEvents: any[] = [];
        const errors: string[] = [];
        
        for (const eventData of events) {
          try {
            // Parse date and time
            const [day, month, year] = eventData.date.split('/');
            const [hours, minutes] = eventData.startTime.split(':');
            const startTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
            
            // Calculate end time (default to 2 hours if not specified)
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
            
            // Extract additional fields from eventData.metadata.eventDetails
            const eventDetails = eventData.metadata?.eventDetails || {};
            
            // Parse KO time if available
            let koTime = null;
            if (eventDetails.koTime) {
              const [koHours, koMinutes] = eventDetails.koTime.split(':');
            koTime = dayjs.tz(`${day}/${month}/${year} ${koHours}:${koMinutes}`, 'Asia/Jerusalem').toDate();
            }
            
            // Parse end time if available
            let actualEndTime = endTime;
            if (eventDetails.endTime) {
              const [endHours, endMinutes] = eventDetails.endTime.split(':');
            actualEndTime = dayjs.tz(`${day}/${month}/${year} ${endHours}:${endMinutes}`, 'Asia/Jerusalem').toDate();
            }
            
            // Create the event data with all available fields
            const newEventData = {
              title: eventData.title,
              hebrewTitle: eventData.title,
              eventType: eventData.eventType || 'live',
              startTime: startTime,
              endTime: actualEndTime,
              koTime: koTime,
              channel: normalizeChannelToHebrew(eventData.channel) || 'CHANNEL 1',
              parallelChannel: normalizeChannelToHebrew(eventDetails.parallelChannel) || null,
              channel1_4k: eventDetails.channel1_4k === 'כן' || eventDetails.channel1_4k === true || false,
              live: eventDetails.live === 'LIVE' || eventDetails.live === 'כן' || true,
              location: eventData.location || '',
              notes: eventData.notes || '',
              subtitles: eventDetails.subtitles || null,
              sport: eventDetails.sport || null,
              league: eventDetails.league || null,
              stage: eventDetails.stage || null,
              homeTeam: eventDetails.homeTeam || null,
              awayTeam: eventDetails.awayTeam || null,
              metadata: {
                ...eventData.metadata,
                importedFromExcel: true,
                importedAt: new Date()
              }
            };
            
            // Create the event in MongoDB
            const event = new BroadcastEvent(newEventData);
            const savedEvent = await event.save();
            
            createdEvents.push(mapDocumentToResult(savedEvent));
            console.log('✅ Created event:', savedEvent.title);

            await ensureShadowMcrEventForBroadcast(savedEvent, context?.user?.userId);

            // Send notification for the created event
            try {
              await createBroadcastPlanningNotification(mapDocumentToResult(savedEvent), 'created');
            } catch (notificationError) {
              console.error('⚠️ Failed to send notification for batch created event:', notificationError);
              // Don't fail the batch operation if notification fails
            }
            
            // Publish event for real-time updates
            const createdEvent = mapDocumentToResult(savedEvent);
            pubsub.publish('BROADCAST_EVENT_UPDATED', { broadcastEventUpdated: createdEvent });
            if (createdEvent.departmentId) {
              pubsub.publish(`BROADCAST_EVENT_UPDATED_${createdEvent.departmentId}`, { broadcastEventUpdated: createdEvent });
            }
          } catch (error: any) {
            console.error(`Error creating event "${eventData.title}":`, error);
            errors.push(`Failed to create event "${eventData.title}": ${error.message}`);
          }
        }
        
        console.log('✅ Batch creation with overlap check complete:', createdEvents.length, 'created,', errors.length, 'errors');
        
        return {
          success: createdEvents.length > 0,
          eventsCreated: createdEvents.length,
          errors,
          events: createdEvents,
          overlapCheck: {
            hasOverlaps,
            overlaps: allOverlaps,
            message: hasOverlaps ? 'האירועים נוצרו למרות החפיפות' : 'האירועים נוצרו בהצלחה'
          },
          requiresConfirmation: false
        };
      } catch (error: any) {
        console.error('❌ Error in batch event creation with overlap check:', error);
        throw new Error(`Failed to create events from Excel: ${error.message}`);
      }
    },
  },

  Subscription: {
    broadcastEventUpdated: {
      subscribe: (_: any, { departmentId }: { departmentId?: string }, context: Context) => {
        // Subscriptions arrive over the WebSocket. The connection-level
        // auth check already enforces a valid JWT (see index.ts WS context),
        // but we still require BROADCAST_VIEW here so a logged-in user
        // without that permission can't tap the firehose.
        requirePermission(context, Permission.BROADCAST_VIEW);
        const topics = departmentId
          ? [`BROADCAST_EVENT_UPDATED_${departmentId}`, 'BROADCAST_EVENT_UPDATED']
          : ['BROADCAST_EVENT_UPDATED'];
        return pubsub.asyncIterator(topics);
      }
    }
  },
  
  // Field resolvers
  // Removed BroadcastEvent field resolvers as they're not in the simplified schema
}; 