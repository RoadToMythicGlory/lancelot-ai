/**
 * RightsBoard Schema
 * 
 * Structured output for broadcast rights and sports intelligence.
 */

import { z } from 'zod';

// Rights status
export const RightsStatusSchema = z.enum([
  'owned',
  'licensed',
  'sublicensed',
  'expired',
  'pending',
  'none',
]);

export type RightsStatus = z.infer<typeof RightsStatusSchema>;

// Territory
export const TerritorySchema = z.enum([
  'israel',
  'middle_east',
  'worldwide',
  'europe',
  'other',
]);

export type Territory = z.infer<typeof TerritorySchema>;

// Individual rights entry
export const BroadcastRightSchema = z.object({
  id: z.string(),
  league: z.string(),
  competition: z.string(),
  sport: z.string(),
  territory: TerritorySchema,
  status: RightsStatusSchema,
  channels: z.array(z.string()),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  restrictions: z.array(z.string()).optional(),
  notes: z.string().optional(),
  lastUpdated: z.string().datetime(),
});

export type BroadcastRight = z.infer<typeof BroadcastRightSchema>;

// Fixture (upcoming match/event)
export const FixtureSchema = z.object({
  id: z.string(),
  competition: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  venue: z.string().optional(),
  kickoffTime: z.string().datetime(),
  status: z.enum(['scheduled', 'live', 'finished', 'postponed', 'cancelled']),
  hasRights: z.boolean(),
  channelAssignment: z.string().optional(),
  importance: z.enum(['critical', 'high', 'medium', 'low']),
  notes: z.string().optional(),
});

export type Fixture = z.infer<typeof FixtureSchema>;

// Team/Player injury
export const InjuryReportSchema = z.object({
  id: z.string(),
  playerName: z.string(),
  team: z.string(),
  injuryType: z.string(),
  status: z.enum(['out', 'doubtful', 'questionable', 'probable']),
  expectedReturn: z.string().optional(),
  source: z.string(),
  reportedAt: z.string().datetime(),
});

export type InjuryReport = z.infer<typeof InjuryReportSchema>;

// Standing entry
export const StandingEntrySchema = z.object({
  position: z.number().int().positive(),
  team: z.string(),
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  drawn: z.number().int().min(0),
  lost: z.number().int().min(0),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  goalDifference: z.number().int(),
  points: z.number().int().min(0),
  form: z.string().optional(), // e.g., "WWDLW"
});

export type StandingEntry = z.infer<typeof StandingEntrySchema>;

// League standings
export const LeagueStandingsSchema = z.object({
  league: z.string(),
  season: z.string(),
  lastUpdated: z.string().datetime(),
  standings: z.array(StandingEntrySchema),
});

export type LeagueStandings = z.infer<typeof LeagueStandingsSchema>;

// Complete RightsBoard
export const RightsBoardSchema = z.object({
  id: z.string().uuid(),
  generatedAt: z.string().datetime(),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  rights: z.array(BroadcastRightSchema),
  upcomingFixtures: z.array(FixtureSchema),
  injuryReports: z.array(InjuryReportSchema).optional(),
  standings: z.array(LeagueStandingsSchema).optional(),
  highlights: z.array(z.object({
    type: z.enum(['fixture', 'injury', 'transfer', 'news']),
    title: z.string(),
    description: z.string(),
    importance: z.enum(['critical', 'high', 'medium', 'low']),
  })),
  summary: z.string(),
  isOfflineData: z.boolean(),
  dataFreshness: z.object({
    fixtures: z.string().datetime().optional(),
    standings: z.string().datetime().optional(),
    injuries: z.string().datetime().optional(),
  }),
});

export type RightsBoard = z.infer<typeof RightsBoardSchema>;

// Request input
export const RightsBoardRequestSchema = z.object({
  sports: z.array(z.string()).optional(),
  leagues: z.array(z.string()).optional(),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  includeStandings: z.boolean().optional(),
  includeInjuries: z.boolean().optional(),
  onlyWithRights: z.boolean().optional(),
});

export type RightsBoardRequest = z.infer<typeof RightsBoardRequestSchema>;

export default RightsBoardSchema;
