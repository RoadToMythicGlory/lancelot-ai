/**
 * NewsBrief Schema
 * 
 * Structured output for news summaries and briefs.
 */

import { z } from 'zod';
import { CitationSchema } from './chat-response';

// News category
export const NewsCategorySchema = z.enum([
  'sports',
  'breaking',
  'politics',
  'business',
  'weather',
  'entertainment',
  'technology',
  'local',
  'international',
]);

export type NewsCategory = z.infer<typeof NewsCategorySchema>;

// Relevance level
export const RelevanceSchema = z.enum([
  'critical',
  'high',
  'medium',
  'low',
]);

export type Relevance = z.infer<typeof RelevanceSchema>;

// Individual news item
export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  headlineHebrew: z.string().optional(),
  summary: z.string(),
  summaryHebrew: z.string().optional(),
  category: NewsCategorySchema,
  relevance: RelevanceSchema,
  source: CitationSchema,
  publishedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
  tags: z.array(z.string()).optional(),
  relatedTeams: z.array(z.string()).optional(),
  relatedLeagues: z.array(z.string()).optional(),
  suggestedForLineup: z.boolean().optional(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

// Complete NewsBrief
export const NewsBriefSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  generatedAt: z.string().datetime(),
  timeRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  items: z.array(NewsItemSchema),
  summary: z.string(), // AI-generated overall summary
  summaryHebrew: z.string().optional(),
  topStories: z.array(z.string()), // IDs of top stories
  breakingNews: z.array(z.string()).optional(), // IDs of breaking news
  totalSourcesChecked: z.number().int().min(0),
  metadata: z.object({
    categories: z.record(z.number()), // Count per category
    relevanceDistribution: z.record(z.number()),
    averageConfidence: z.number().min(0).max(1),
  }),
});

export type NewsBrief = z.infer<typeof NewsBriefSchema>;

// Request input for news brief
export const NewsBriefRequestSchema = z.object({
  categories: z.array(NewsCategorySchema).optional(),
  sports: z.array(z.string()).optional(), // Filter by sports
  leagues: z.array(z.string()).optional(), // Filter by leagues
  teams: z.array(z.string()).optional(), // Filter by teams
  maxItems: z.number().int().positive().optional(),
  timeRangeHours: z.number().positive().optional(), // Look back hours
  includeInternational: z.boolean().optional(),
  language: z.enum(['he', 'en', 'both']).optional(),
});

export type NewsBriefRequest = z.infer<typeof NewsBriefRequestSchema>;

export default NewsBriefSchema;
