/**
 * LineupRundown Schema
 * 
 * Structured output for program rundowns/lineups.
 */

import { z } from 'zod';
import { CitationSchema } from './chat-response';

// Segment types
export const SegmentTypeSchema = z.enum([
  'live',
  'vtr',
  'graphics',
  'interview',
  'break',
  'package',
  'teaser',
  'bumper',
]);

export type SegmentType = z.infer<typeof SegmentTypeSchema>;

// Priority levels
export const PrioritySchema = z.enum([
  'critical',
  'high',
  'normal',
  'filler',
]);

export type Priority = z.infer<typeof PrioritySchema>;

// CG spec reference (simplified)
export const CGSpecRefSchema = z.object({
  templateType: z.string(),
  fields: z.record(z.union([z.string(), z.number()])),
});

export type CGSpecRef = z.infer<typeof CGSpecRefSchema>;

// Individual segment
export const SegmentSchema = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  titleHebrew: z.string().optional(),
  type: SegmentTypeSchema,
  duration: z.number().positive(), // in seconds
  priority: PrioritySchema,
  notes: z.string().optional(),
  cgSpecs: z.array(CGSpecRefSchema).optional(),
  assignedTo: z.string().optional(),
  sourceFile: z.string().optional(),
});

export type Segment = z.infer<typeof SegmentSchema>;

// Asset requirement
export const AssetSchema = z.object({
  type: z.enum(['video', 'audio', 'graphic', 'document']),
  name: z.string(),
  path: z.string().optional(),
  status: z.enum(['available', 'pending', 'missing']),
  notes: z.string().optional(),
});

export type Asset = z.infer<typeof AssetSchema>;

// Staff requirement
export const StaffRequirementSchema = z.object({
  role: z.string(),
  count: z.number().int().positive(),
  assignedNames: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type StaffRequirement = z.infer<typeof StaffRequirementSchema>;

// Program types
export const ProgramTypeSchema = z.enum([
  'sports',
  'news',
  'comedy',
  'talk',
  'documentary',
  'entertainment',
  'special',
]);

export type ProgramType = z.infer<typeof ProgramTypeSchema>;

// Complete LineupRundown
export const LineupRundownSchema = z.object({
  id: z.string().uuid(),
  programType: ProgramTypeSchema,
  title: z.string(),
  titleHebrew: z.string().optional(),
  scheduledDate: z.string().datetime(),
  channel: z.string(),
  totalDuration: z.number().positive(), // in minutes
  segments: z.array(SegmentSchema),
  requiredAssets: z.array(AssetSchema).optional(),
  requiredStaff: z.array(StaffRequirementSchema).optional(),
  citations: z.array(CitationSchema).optional(),
  generatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export type LineupRundown = z.infer<typeof LineupRundownSchema>;

// Lineup type: "structure" = segment-based, "items" = content-item-based
export const LineupTypeSchema = z.enum(['structure', 'items']);
export type LineupType = z.infer<typeof LineupTypeSchema>;

// RSS brief citation (for items produced by the RSS pipeline)
export const LineupItemCitationSchema = z.object({
  source: z.string(),
  url: z.string(),
  publishedAt: z.string(),
});

export type LineupItemCitation = z.infer<typeof LineupItemCitationSchema>;

// Individual content item (for items-based lineups)
export const LineupItemSchema = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  titleHebrew: z.string().optional(),
  category: z.string(),
  duration: z.number().positive().optional(), // in seconds, optional for items
  priority: PrioritySchema,
  isPlaceholder: z.boolean(), // true if content is not from a verified source
  source: z.string().optional(), // citation or "user-provided" or "placeholder"
  notes: z.string().optional(),
  // ── RSS pipeline fields (optional, additive) ──
  /** Abstractive brief (broadcast-friendly summary) */
  brief: z.string().optional(),
  /** Factual bullet points */
  bullets: z.array(z.string()).optional(),
  /** Editorial "why it matters" line */
  whyItMatters: z.string().optional(),
  /** Quality of the brief — 'llm' for LLM-generated, 'rss_only' for RSS excerpt */
  briefQuality: z.enum(['llm', 'rss_only']).optional(),
  /** Source citation from the RSS pipeline */
  citation: LineupItemCitationSchema.optional(),
  /** Ranking score from the RSS pipeline */
  score: z.number().optional(),
});

export type LineupItem = z.infer<typeof LineupItemSchema>;

// Items-based lineup result
export const ItemsLineupSchema = z.object({
  id: z.string().uuid(),
  programType: ProgramTypeSchema,
  title: z.string(),
  titleHebrew: z.string().optional(),
  scheduledDate: z.string().datetime(),
  channel: z.string(),
  lineupType: z.literal('items'),
  totalItems: z.number().int().positive(),
  items: z.array(LineupItemSchema),
  categoryCounts: z.record(z.number()).optional(),
  citations: z.array(CitationSchema).optional(),
  generatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export type ItemsLineup = z.infer<typeof ItemsLineupSchema>;

// Request input for lineup generation
export const LineupRequestSchema = z.object({
  programType: ProgramTypeSchema,
  title: z.string().optional(),
  channel: z.string(),
  scheduledDate: z.string(),
  duration: z.number().optional(), // target duration in minutes
  sport: z.string().optional(),
  league: z.string().optional(),
  teams: z.array(z.string()).optional(),
  includeBreakingNews: z.boolean().optional(),
  additionalContext: z.string().optional(),
  /** Lineup subtype: "structure" for segment-based, "items" for content-item-based */
  lineupType: LineupTypeSchema.optional(),
  /** Target number of content items (for lineupType="items") */
  totalItems: z.number().int().positive().optional(),
  /** Category distribution (for lineupType="items"), e.g. { "sports": 3, "politics": 2 } */
  categoryCounts: z.record(z.number()).optional(),
  // ── RSS pipeline request fields (optional, additive) ──
  /** Time window for article recency (hours) */
  timeWindowHours: z.number().positive().optional(),
  /** Filter active feeds by ID */
  sources: z.array(z.string()).optional(),
});

export type LineupRequest = z.infer<typeof LineupRequestSchema>;

export default LineupRundownSchema;
