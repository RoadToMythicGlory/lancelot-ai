/**
 * CGSpec Schema
 * 
 * Structured output for graphics/CG instructions.
 */

import { z } from 'zod';

// Template types that map to VizRT categories
export const CGTemplateTypeSchema = z.enum([
  'lower_third',
  'scorebug',
  'ticker',
  'match_slate',
  'sponsor_bug',
  'name_super',
  'full_screen',
  'side_panel',
  'breaking_news',
  'weather',
  'custom',
]);

export type CGTemplateType = z.infer<typeof CGTemplateTypeSchema>;

// Animation types
export const AnimationTypeSchema = z.enum([
  'cut',
  'fade',
  'wipe',
  'slide',
  'zoom',
  'none',
]);

export type AnimationType = z.infer<typeof AnimationTypeSchema>;

// Timing specification
export const CGTimingSchema = z.object({
  inPoint: z.string(), // Timecode (HH:MM:SS:FF) or segment reference
  duration: z.number().positive(), // in seconds
  outAnimation: AnimationTypeSchema.optional(),
  inAnimation: AnimationTypeSchema.optional(),
});

export type CGTiming = z.infer<typeof CGTimingSchema>;

// Validation result
export const CGValidationSchema = z.object({
  isValid: z.boolean(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()).optional(),
});

export type CGValidation = z.infer<typeof CGValidationSchema>;

// Complete CGSpec
export const CGSpecSchema = z.object({
  id: z.string().uuid(),
  templateType: CGTemplateTypeSchema,
  templateId: z.string().optional(), // Reference to VizrtTemplate._id
  templateName: z.string().optional(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
  timing: CGTimingSchema.optional(),
  validation: CGValidationSchema,
  notes: z.string().optional(),
  generatedAt: z.string().datetime(),
});

export type CGSpec = z.infer<typeof CGSpecSchema>;

// Specific CG types with their required fields

// Lower Third (name + title)
export const LowerThirdFieldsSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  logo: z.string().optional(),
});

export type LowerThirdFields = z.infer<typeof LowerThirdFieldsSchema>;

// Score Bug
export const ScoreBugFieldsSchema = z.object({
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  time: z.string(), // Match time (e.g., "45:00", "HT", "FT")
  period: z.string().optional(), // "1st Half", "2nd Half", etc.
  homeTeamLogo: z.string().optional(),
  awayTeamLogo: z.string().optional(),
  competition: z.string().optional(),
});

export type ScoreBugFields = z.infer<typeof ScoreBugFieldsSchema>;

// Ticker item
export const TickerItemSchema = z.object({
  text: z.string(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  category: z.string().optional(),
});

export type TickerItem = z.infer<typeof TickerItemSchema>;

// Ticker
export const TickerFieldsSchema = z.object({
  items: z.array(TickerItemSchema),
  speed: z.enum(['slow', 'normal', 'fast']).optional(),
  loop: z.boolean().optional(),
});

export type TickerFields = z.infer<typeof TickerFieldsSchema>;

// Match Slate (pre-match graphic)
export const MatchSlateFieldsSchema = z.object({
  competition: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  venue: z.string().optional(),
  kickoffTime: z.string(),
  date: z.string(),
  homeTeamLogo: z.string().optional(),
  awayTeamLogo: z.string().optional(),
  broadcaster: z.string().optional(),
});

export type MatchSlateFields = z.infer<typeof MatchSlateFieldsSchema>;

// CG Request input
export const CGRequestSchema = z.object({
  templateType: CGTemplateTypeSchema,
  context: z.string().optional(), // Natural language description
  fields: z.record(z.unknown()).optional(), // Pre-filled fields
  broadcastEventId: z.string().optional(), // Link to event
  segmentId: z.string().optional(),
});

export type CGRequest = z.infer<typeof CGRequestSchema>;

export default CGSpecSchema;
