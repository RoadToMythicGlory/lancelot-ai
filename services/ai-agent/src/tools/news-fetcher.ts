/**
 * News Fetcher Tool
 * 
 * Fetches news from trusted RSS sources with deduplication and relevance scoring.
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { getAllowedSources, getSourcesByCategory, recordFetchSuccess, recordFetchError, StoredTrustedSource } from '../data/trusted-sources-store';
import { cacheArticle, getRecentArticles, CachedArticle } from '../data/news-cache';
import { NewsBrief, NewsItem, NewsBriefRequest, NewsCategory, Relevance } from '../schemas/news-brief';
import { containsHebrew } from '../utils/validation';

const logger = createLogger('news-fetcher');

/**
 * RSS feed item (parsed)
 */
interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  category?: string;
  author?: string;
}

/**
 * Parse RSS XML to items
 * Simple parser - for production use a proper XML library
 */
function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Match all <item> elements
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const description = extractTag(itemXml, 'description');
    const pubDate = extractTag(itemXml, 'pubDate');
    const category = extractTag(itemXml, 'category');
    const author = extractTag(itemXml, 'author') || extractTag(itemXml, 'dc:creator');
    
    if (title && link) {
      items.push({
        title: cleanHtml(title),
        link,
        description: cleanHtml(description || ''),
        pubDate,
        category,
        author,
      });
    }
  }
  
  return items;
}

/**
 * Extract content from XML tag
 */
function extractTag(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>|<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? (match[1] || match[2] || '').trim() : '';
}

/**
 * Remove HTML tags from text
 */
function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Calculate relevance score for an article
 */
function calculateRelevance(
  item: RSSItem,
  context: { sports?: string[]; leagues?: string[]; teams?: string[] }
): { score: number; reason: string } {
  let score = 0.5; // Base relevance
  const reasons: string[] = [];
  
  const titleLower = item.title.toLowerCase();
  const descLower = item.description.toLowerCase();
  const fullText = `${titleLower} ${descLower}`;
  
  // Check for breaking news keywords
  const breakingKeywords = ['breaking', 'urgent', 'flash', 'דחוף', 'מבזק', 'עכשיו'];
  for (const keyword of breakingKeywords) {
    if (fullText.includes(keyword)) {
      score += 0.2;
      reasons.push('Breaking news');
      break;
    }
  }
  
  // Check for sports context
  if (context.sports) {
    for (const sport of context.sports) {
      if (fullText.includes(sport.toLowerCase())) {
        score += 0.15;
        reasons.push(`Matches sport: ${sport}`);
      }
    }
  }
  
  // Check for league context
  if (context.leagues) {
    for (const league of context.leagues) {
      if (fullText.includes(league.toLowerCase())) {
        score += 0.15;
        reasons.push(`Matches league: ${league}`);
      }
    }
  }
  
  // Check for team context
  if (context.teams) {
    for (const team of context.teams) {
      if (fullText.includes(team.toLowerCase())) {
        score += 0.2;
        reasons.push(`Matches team: ${team}`);
      }
    }
  }
  
  // Cap at 1.0
  score = Math.min(score, 1.0);
  
  return {
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : 'General relevance',
  };
}

/**
 * Extract metadata from article
 */
function extractMetadata(item: RSSItem): CachedArticle['metadata'] {
  const fullText = `${item.title} ${item.description}`.toLowerCase();
  
  const metadata: CachedArticle['metadata'] = {};
  
  // Detect sport
  const sports = [
    { keywords: ['football', 'soccer', 'כדורגל', 'גול'], name: 'football' },
    { keywords: ['basketball', 'כדורסל', 'nba'], name: 'basketball' },
    { keywords: ['tennis', 'טניס'], name: 'tennis' },
    { keywords: ['mma', 'ufc', 'לחימה'], name: 'mma' },
  ];
  
  for (const sport of sports) {
    if (sport.keywords.some(k => fullText.includes(k))) {
      metadata.sport = sport.name;
      break;
    }
  }
  
  // Detect leagues
  const leagues = [
    { keywords: ['premier league', 'פרמייר ליג'], name: 'Premier League' },
    { keywords: ['la liga', 'לה ליגה', 'ליגה ספרדית'], name: 'La Liga' },
    { keywords: ['champions league', 'ליגת האלופות'], name: 'Champions League' },
    { keywords: ['bundesliga', 'בונדסליגה'], name: 'Bundesliga' },
    { keywords: ['serie a', 'סרייה א'], name: 'Serie A' },
    { keywords: ['ליגת העל', 'ligat haal', 'israeli premier'], name: 'Israeli Premier League' },
  ];
  
  for (const league of leagues) {
    if (league.keywords.some(k => fullText.includes(k))) {
      metadata.league = league.name;
      break;
    }
  }
  
  return metadata;
}

/**
 * Fetch RSS feed from a source
 */
async function fetchRSSFeed(source: StoredTrustedSource): Promise<RSSItem[]> {
  if (!source.feedUrl) {
    return [];
  }
  
  try {
    const response = await fetch(source.feedUrl, {
      headers: {
        'User-Agent': 'Lancelot-AI-Agent/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xml = await response.text();
    const items = parseRSS(xml);
    
    await recordFetchSuccess(source.domain);
    
    logger.info(`Fetched ${items.length} items from ${source.name}`, {
      domain: source.domain,
    });
    
    return items;
  } catch (error) {
    const errorMessage = (error as Error).message;
    await recordFetchError(source.domain, errorMessage);
    
    logger.error(`Failed to fetch RSS from ${source.name}`, {
      domain: source.domain,
      error: errorMessage,
    });
    
    return [];
  }
}

/**
 * Fetch and cache articles from all allowed sources
 */
export async function fetchAllSources(
  context: { sports?: string[]; leagues?: string[]; teams?: string[] } = {}
): Promise<{ fetched: number; cached: number; duplicates: number }> {
  const sources = await getAllowedSources();
  
  let totalFetched = 0;
  let totalCached = 0;
  let totalDuplicates = 0;
  
  for (const source of sources) {
    if (source.type !== 'rss' || !source.feedUrl) {
      continue;
    }
    
    const items = await fetchRSSFeed(source);
    totalFetched += items.length;
    
    for (const item of items) {
      const relevance = calculateRelevance(item, context);
      const metadata = extractMetadata(item);
      
      const result = await cacheArticle({
        sourceId: source._id || source.domain,
        sourceDomain: source.domain,
        sourceName: source.name,
        url: item.link,
        title: item.title,
        titleHebrew: containsHebrew(item.title) ? item.title : undefined,
        excerpt: item.description.substring(0, 500),
        relevanceScore: relevance.score,
        category: source.category,
        tags: item.category ? [item.category] : [],
        metadata,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
      });
      
      if (result.cached) {
        totalCached++;
      }
      if (result.isDuplicate) {
        totalDuplicates++;
      }
    }
  }
  
  logger.info('Fetch all sources complete', {
    sources: sources.length,
    fetched: totalFetched,
    cached: totalCached,
    duplicates: totalDuplicates,
  });
  
  return {
    fetched: totalFetched,
    cached: totalCached,
    duplicates: totalDuplicates,
  };
}

/**
 * Fetch from specific category
 */
export async function fetchByCategory(
  category: 'sports' | 'news' | 'weather' | 'general',
  context: { sports?: string[]; leagues?: string[]; teams?: string[] } = {}
): Promise<{ fetched: number; cached: number }> {
  const sources = await getSourcesByCategory(category);
  
  let totalFetched = 0;
  let totalCached = 0;
  
  for (const source of sources) {
    if (source.type !== 'rss' || !source.feedUrl) {
      continue;
    }
    
    const items = await fetchRSSFeed(source);
    totalFetched += items.length;
    
    for (const item of items) {
      const relevance = calculateRelevance(item, context);
      const metadata = extractMetadata(item);
      
      const result = await cacheArticle({
        sourceId: source._id || source.domain,
        sourceDomain: source.domain,
        sourceName: source.name,
        url: item.link,
        title: item.title,
        excerpt: item.description.substring(0, 500),
        relevanceScore: relevance.score,
        category: source.category,
        tags: [],
        metadata,
      });
      
      if (result.cached) {
        totalCached++;
      }
    }
  }
  
  return { fetched: totalFetched, cached: totalCached };
}

/**
 * Convert relevance score to level
 */
function scoreToRelevance(score: number): Relevance {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Generate a news brief from cached articles
 */
export async function generateNewsBrief(request: NewsBriefRequest = {}): Promise<NewsBrief> {
  const articles = await getRecentArticles({
    limit: request.maxItems || 20,
    category: request.categories?.[0],
    sport: request.sports?.[0],
    league: request.leagues?.[0],
    hoursBack: request.timeRangeHours || 24,
  });
  
  // Convert to NewsItems
  const items: NewsItem[] = articles.map(article => ({
    id: article._id?.toString() || uuidv4(),
    headline: article.title,
    headlineHebrew: article.titleHebrew,
    summary: article.excerpt,
    category: (article.category as NewsCategory) || 'general',
    relevance: scoreToRelevance(article.relevanceScore),
    source: {
      sourceName: article.sourceName,
      sourceUrl: article.url,
      fetchedAt: article.fetchedAt.toISOString(),
      excerptHash: article.excerptHash,
      confidence: 0.85, // Default confidence for RSS sources
      relevanceReason: 'Matched search criteria',
    },
    fetchedAt: article.fetchedAt.toISOString(),
    tags: article.tags,
    relatedLeagues: article.metadata.league ? [article.metadata.league] : undefined,
  }));
  
  // Identify top stories (highest relevance)
  const topStories = items
    .filter(i => i.relevance === 'critical' || i.relevance === 'high')
    .slice(0, 5)
    .map(i => i.id);
  
  // Identify breaking news
  const breakingNews = items
    .filter(i => {
      const text = `${i.headline} ${i.summary}`.toLowerCase();
      return text.includes('breaking') || text.includes('מבזק') || text.includes('דחוף');
    })
    .map(i => i.id);
  
  // Calculate category distribution
  const categories: Record<string, number> = {};
  const relevanceDistribution: Record<string, number> = {};
  let totalConfidence = 0;
  
  for (const item of items) {
    categories[item.category] = (categories[item.category] || 0) + 1;
    relevanceDistribution[item.relevance] = (relevanceDistribution[item.relevance] || 0) + 1;
    totalConfidence += item.source.confidence;
  }
  
  const now = new Date();
  const hoursBack = request.timeRangeHours || 24;
  
  return {
    id: uuidv4(),
    title: `News Brief - ${now.toLocaleDateString()}`,
    generatedAt: now.toISOString(),
    timeRange: {
      from: new Date(now.getTime() - hoursBack * 60 * 60 * 1000).toISOString(),
      to: now.toISOString(),
    },
    items,
    summary: `${items.length} articles from ${Object.keys(categories).length} categories`,
    topStories,
    breakingNews: breakingNews.length > 0 ? breakingNews : undefined,
    totalSourcesChecked: articles.length,
    metadata: {
      categories,
      relevanceDistribution,
      averageConfidence: items.length > 0 ? totalConfidence / items.length : 0,
    },
  };
}

export default {
  fetchAllSources,
  fetchByCategory,
  generateNewsBrief,
};
