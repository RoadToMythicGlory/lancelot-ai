/**
 * Rights Board Tool
 * 
 * Manages broadcast rights and sports intelligence.
 * Provides fixture information, standings, and rights tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../llm';
import { RIGHTS_BOARD_PROMPT } from '../llm/prompt-templates';
import { createLogger } from '../utils/logger';
import { connectMongoDB } from '../data/mongodb-adapter';
import {
  RightsBoard,
  RightsBoardRequest,
  BroadcastRight,
  Fixture,
  InjuryReport,
  LeagueStandings,
  StandingEntry,
  RightsStatus,
  Territory,
} from '../schemas/rights-board';

const logger = createLogger('rights-board');

/**
 * Rights record in database
 */
interface StoredBroadcastRight {
  _id: string;
  league: string;
  competition: string;
  sport: string;
  territory: string;
  status: string;
  channels: string[];
  validFrom: Date;
  validUntil: Date;
  restrictions?: string[];
  notes?: string;
  lastUpdated: Date;
}

/**
 * Cached fixture
 */
interface CachedFixture {
  _id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  kickoffTime: Date;
  status: string;
  league: string;
  sport: string;
  fetchedAt: Date;
}

const RIGHTS_COLLECTION = 'broadcastRights';
const FIXTURES_COLLECTION = 'cachedFixtures';
const STANDINGS_COLLECTION = 'cachedStandings';

/**
 * Initialize rights collections with indexes
 */
export async function initializeRightsStore(): Promise<void> {
  try {
    const db = await connectMongoDB();
    
    // Rights collection
    const rightsCol = db.collection(RIGHTS_COLLECTION);
    await rightsCol.createIndex({ league: 1 });
    await rightsCol.createIndex({ sport: 1 });
    await rightsCol.createIndex({ validUntil: 1 });
    
    // Fixtures collection (with TTL)
    const fixturesCol = db.collection(FIXTURES_COLLECTION);
    await fixturesCol.createIndex({ kickoffTime: 1 });
    await fixturesCol.createIndex({ league: 1 });
    await fixturesCol.createIndex({ fetchedAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL
    
    // Standings collection (with TTL)
    const standingsCol = db.collection(STANDINGS_COLLECTION);
    await standingsCol.createIndex({ league: 1 });
    await standingsCol.createIndex({ lastUpdated: 1 }, { expireAfterSeconds: 86400 });
    
    logger.info('Rights store initialized');
  } catch (error) {
    logger.error('Failed to initialize rights store', {
      error: (error as Error).message,
    });
  }
}

/**
 * Get broadcast rights from database
 */
async function getBroadcastRights(
  filters: { sports?: string[]; leagues?: string[] } = {}
): Promise<BroadcastRight[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredBroadcastRight>(RIGHTS_COLLECTION);
    
    const query: Record<string, unknown> = {
      validUntil: { $gte: new Date() }, // Only active rights
    };
    
    if (filters.sports && filters.sports.length > 0) {
      query.sport = { $in: filters.sports };
    }
    
    if (filters.leagues && filters.leagues.length > 0) {
      query.league = { $in: filters.leagues };
    }
    
    const rights = await collection.find(query).toArray();
    
    return rights.map(r => ({
      id: r._id.toString(),
      league: r.league,
      competition: r.competition,
      sport: r.sport,
      territory: r.territory as Territory,
      status: r.status as RightsStatus,
      channels: r.channels,
      validFrom: r.validFrom.toISOString(),
      validUntil: r.validUntil.toISOString(),
      restrictions: r.restrictions,
      notes: r.notes,
      lastUpdated: r.lastUpdated.toISOString(),
    }));
  } catch (error) {
    logger.error('Failed to get broadcast rights', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Get cached fixtures
 */
async function getCachedFixtures(
  filters: { leagues?: string[]; dateFrom?: Date; dateTo?: Date } = {}
): Promise<Fixture[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedFixture>(FIXTURES_COLLECTION);
    
    const query: Record<string, unknown> = {};
    
    if (filters.leagues && filters.leagues.length > 0) {
      query.league = { $in: filters.leagues };
    }
    
    if (filters.dateFrom || filters.dateTo) {
      query.kickoffTime = {};
      if (filters.dateFrom) {
        (query.kickoffTime as Record<string, Date>).$gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        (query.kickoffTime as Record<string, Date>).$lte = filters.dateTo;
      }
    }
    
    const fixtures = await collection
      .find(query)
      .sort({ kickoffTime: 1 })
      .limit(50)
      .toArray();
    
    // Check if we have rights for each fixture
    const rights = await getBroadcastRights({ leagues: fixtures.map(f => f.league) });
    const rightsSet = new Set(rights.map(r => r.league));
    
    return fixtures.map(f => ({
      id: f._id.toString(),
      competition: f.competition,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      venue: f.venue,
      kickoffTime: f.kickoffTime.toISOString(),
      status: f.status as Fixture['status'],
      hasRights: rightsSet.has(f.league),
      importance: determineFixtureImportance(f),
    }));
  } catch (error) {
    logger.error('Failed to get cached fixtures', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Determine fixture importance
 */
function determineFixtureImportance(fixture: CachedFixture): Fixture['importance'] {
  const text = `${fixture.homeTeam} ${fixture.awayTeam} ${fixture.competition}`.toLowerCase();
  
  // Top teams and competitions
  const criticalKeywords = ['final', 'גמר', 'derby', 'דרבי', 'clasico', 'el clasico'];
  const highKeywords = ['semi-final', 'חצי גמר', 'quarter', 'רבע'];
  
  if (criticalKeywords.some(k => text.includes(k))) {
    return 'critical';
  }
  if (highKeywords.some(k => text.includes(k))) {
    return 'high';
  }
  
  // Check for big teams
  const bigTeams = [
    'real madrid', 'barcelona', 'manchester', 'liverpool', 'bayern', 'juventus',
    'מכבי', 'הפועל', 'בית"ר',
  ];
  if (bigTeams.some(t => text.includes(t))) {
    return 'high';
  }
  
  return 'medium';
}

/**
 * Add a broadcast right
 */
export async function addBroadcastRight(right: Omit<BroadcastRight, 'id'>): Promise<string> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection(RIGHTS_COLLECTION);
    
    const result = await collection.insertOne({
      ...right,
      validFrom: new Date(right.validFrom),
      validUntil: new Date(right.validUntil),
      lastUpdated: new Date(right.lastUpdated),
    });
    
    logger.info('Added broadcast right', {
      league: right.league,
      id: result.insertedId.toString(),
    });
    
    return result.insertedId.toString();
  } catch (error) {
    logger.error('Failed to add broadcast right', {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Cache fixtures (from external API when online)
 */
export async function cacheFixtures(fixtures: Omit<CachedFixture, '_id' | 'fetchedAt'>[]): Promise<number> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection(FIXTURES_COLLECTION);
    
    const now = new Date();
    const documents = fixtures.map(f => ({
      ...f,
      kickoffTime: new Date(f.kickoffTime),
      fetchedAt: now,
    }));
    
    // Upsert based on homeTeam + awayTeam + kickoffTime
    let cached = 0;
    for (const doc of documents) {
      await collection.updateOne(
        {
          homeTeam: doc.homeTeam,
          awayTeam: doc.awayTeam,
          kickoffTime: doc.kickoffTime,
        },
        { $set: doc },
        { upsert: true }
      );
      cached++;
    }
    
    logger.info('Cached fixtures', { count: cached });
    return cached;
  } catch (error) {
    logger.error('Failed to cache fixtures', {
      error: (error as Error).message,
    });
    return 0;
  }
}

/**
 * Parse rights board request from natural language
 */
export async function parseRightsBoardRequest(message: string): Promise<Partial<RightsBoardRequest>> {
  const request: Partial<RightsBoardRequest> = {};
  const lower = message.toLowerCase();
  
  // Detect sports
  const sports: string[] = [];
  if (lower.includes('כדורגל') || lower.includes('football') || lower.includes('soccer')) {
    sports.push('football');
  }
  if (lower.includes('כדורסל') || lower.includes('basketball')) {
    sports.push('basketball');
  }
  if (lower.includes('טניס') || lower.includes('tennis')) {
    sports.push('tennis');
  }
  if (sports.length > 0) {
    request.sports = sports;
  }
  
  // Detect leagues
  const leagues: string[] = [];
  if (lower.includes('פרמייר') || lower.includes('premier')) {
    leagues.push('Premier League');
  }
  if (lower.includes('לה ליגה') || lower.includes('la liga')) {
    leagues.push('La Liga');
  }
  if (lower.includes('ליגת האלופות') || lower.includes('champions')) {
    leagues.push('Champions League');
  }
  if (lower.includes('ליגת העל') || lower.includes('israeli')) {
    leagues.push('Israeli Premier League');
  }
  if (leagues.length > 0) {
    request.leagues = leagues;
  }
  
  // Detect options
  if (lower.includes('טבלה') || lower.includes('standings') || lower.includes('דירוג')) {
    request.includeStandings = true;
  }
  if (lower.includes('פציעות') || lower.includes('injuries')) {
    request.includeInjuries = true;
  }
  
  return request;
}

/**
 * Generate rights board summary using LLM
 */
async function generateSummary(
  rights: BroadcastRight[],
  fixtures: Fixture[]
): Promise<string> {
  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    
    if (!isAvailable) {
      return `${rights.length} זכויות שידור פעילות, ${fixtures.length} משחקים קרובים.`;
    }
    
    const prompt = `Summarize this broadcast rights and fixtures data in Hebrew (2-3 sentences):
Rights: ${rights.length} active (leagues: ${[...new Set(rights.map(r => r.league))].join(', ')})
Upcoming fixtures: ${fixtures.length}
Key matches: ${fixtures.filter(f => f.importance === 'critical' || f.importance === 'high').map(f => `${f.homeTeam} vs ${f.awayTeam}`).slice(0, 3).join(', ')}`;
    
    const result = await provider.generate(prompt, {
      systemPrompt: RIGHTS_BOARD_PROMPT,
      temperature: 0.5,
      maxTokens: 256,
    });
    
    return result.text;
  } catch (error) {
    logger.warn('Failed to generate summary', { error: (error as Error).message });
    return `${rights.length} זכויות שידור, ${fixtures.length} משחקים קרובים.`;
  }
}

/**
 * Build rights board
 */
export async function buildRightsBoard(request: RightsBoardRequest = {}): Promise<RightsBoard> {
  logger.info('Building rights board', { request });
  
  // Get date range
  const now = new Date();
  const dateFrom = request.dateRange?.from 
    ? new Date(request.dateRange.from) 
    : now;
  const dateTo = request.dateRange?.to 
    ? new Date(request.dateRange.to) 
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
  
  // Get rights
  const rights = await getBroadcastRights({
    sports: request.sports,
    leagues: request.leagues,
  });
  
  // Get fixtures
  let fixtures = await getCachedFixtures({
    leagues: request.leagues,
    dateFrom,
    dateTo,
  });
  
  // Filter by rights if requested
  if (request.onlyWithRights) {
    const rightsLeagues = new Set(rights.map(r => r.league));
    fixtures = fixtures.filter(f => f.hasRights);
  }
  
  // Generate highlights
  const highlights = fixtures
    .filter(f => f.importance === 'critical' || f.importance === 'high')
    .slice(0, 5)
    .map(f => ({
      type: 'fixture' as const,
      title: `${f.homeTeam} vs ${f.awayTeam}`,
      description: `${f.competition} - ${new Date(f.kickoffTime).toLocaleDateString()}`,
      importance: f.importance,
    }));
  
  // Generate summary
  const summary = await generateSummary(rights, fixtures);
  
  // Check data freshness
  const lastFixtureFetch = fixtures.length > 0 
    ? fixtures[0].kickoffTime // This would be fetchedAt in real impl
    : undefined;
  
  const board: RightsBoard = {
    id: uuidv4(),
    generatedAt: now.toISOString(),
    dateRange: {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    rights,
    upcomingFixtures: fixtures,
    highlights,
    summary,
    isOfflineData: false, // Would be true if network unavailable
    dataFreshness: {
      fixtures: lastFixtureFetch,
    },
  };
  
  logger.info('Rights board built', {
    id: board.id,
    rights: rights.length,
    fixtures: fixtures.length,
  });
  
  return board;
}

/**
 * Seed sample rights data
 */
export async function seedSampleRights(): Promise<void> {
  const sampleRights: Array<Omit<BroadcastRight, 'id'>> = [
    {
      league: 'Premier League',
      competition: 'English Premier League',
      sport: 'football',
      territory: 'israel',
      status: 'licensed',
      channels: ['Sport 1', 'Sport 2'],
      validFrom: new Date('2024-08-01').toISOString(),
      validUntil: new Date('2025-05-31').toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    {
      league: 'La Liga',
      competition: 'Spanish La Liga',
      sport: 'football',
      territory: 'israel',
      status: 'licensed',
      channels: ['Sport 3'],
      validFrom: new Date('2024-08-01').toISOString(),
      validUntil: new Date('2025-05-31').toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    {
      league: 'Champions League',
      competition: 'UEFA Champions League',
      sport: 'football',
      territory: 'israel',
      status: 'owned',
      channels: ['Sport 1', 'Channel 1'],
      validFrom: new Date('2024-09-01').toISOString(),
      validUntil: new Date('2025-06-30').toISOString(),
      lastUpdated: new Date().toISOString(),
    },
  ];
  
  for (const right of sampleRights) {
    try {
      await addBroadcastRight(right);
    } catch (error) {
      // Ignore duplicate errors
    }
  }
  
  logger.info('Sample rights seeded');
}

export default {
  initializeRightsStore,
  getBroadcastRights,
  getCachedFixtures,
  addBroadcastRight,
  cacheFixtures,
  parseRightsBoardRequest,
  buildRightsBoard,
  seedSampleRights,
};
