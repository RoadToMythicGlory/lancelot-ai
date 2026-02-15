/**
 * Trusted Sources Configuration
 * 
 * Defines allowlist and denylist for news/data sources.
 * The AI will ONLY fetch from allowed sources.
 */

export interface TrustedSource {
  domain: string;
  name: string;
  type: 'rss' | 'api' | 'web';
  feedUrl?: string;
  category: 'sports' | 'news' | 'weather' | 'general';
  reliability: number; // 0-1 confidence score
  isAllowed: boolean;
  languages: string[];
}

// Default trusted sources for Israeli broadcast
export const defaultTrustedSources: TrustedSource[] = [
  // Sports - Israeli
  {
    domain: 'example.com',
    name: 'Channel1',
    type: 'rss',
    feedUrl: 'https://www.example.com/rss',
    category: 'sports',
    reliability: 0.9,
    isAllowed: true,
    languages: ['he'],
  },
  {
    domain: 'one.co.il',
    name: 'ONE',
    type: 'rss',
    feedUrl: 'https://www.one.co.il/rss/sport',
    category: 'sports',
    reliability: 0.85,
    isAllowed: true,
    languages: ['he'],
  },
  
  // Sports - International
  {
    domain: 'espn.com',
    name: 'ESPN',
    type: 'rss',
    feedUrl: 'https://www.espn.com/espn/rss/news',
    category: 'sports',
    reliability: 0.95,
    isAllowed: true,
    languages: ['en'],
  },
  {
    domain: 'bbc.com/sport',
    name: 'BBC Sport',
    type: 'rss',
    feedUrl: 'https://feeds.bbci.co.uk/sport/rss.xml',
    category: 'sports',
    reliability: 0.95,
    isAllowed: true,
    languages: ['en'],
  },
  {
    domain: 'skysports.com',
    name: 'Sky Sports',
    type: 'rss',
    feedUrl: 'https://www.skysports.com/rss/12040',
    category: 'sports',
    reliability: 0.9,
    isAllowed: true,
    languages: ['en'],
  },
  
  // News - Israeli
  {
    domain: 'ynet.co.il',
    name: 'Ynet',
    type: 'rss',
    feedUrl: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    category: 'news',
    reliability: 0.85,
    isAllowed: true,
    languages: ['he'],
  },
  {
    domain: 'mako.co.il',
    name: 'Mako',
    type: 'rss',
    feedUrl: 'https://rcs.mako.co.il/rss/31750a2610f26110VgnVCM1000005201000aRCRD.xml',
    category: 'news',
    reliability: 0.85,
    isAllowed: true,
    languages: ['he'],
  },
  
  // Official Sports Data APIs
  {
    domain: 'api-football.com',
    name: 'API-Football',
    type: 'api',
    category: 'sports',
    reliability: 0.95,
    isAllowed: true,
    languages: ['en'],
  },
];

// Blocked sources - social media and unreliable sources
export const blockedDomains: string[] = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'whatsapp.com',
  'telegram.org',
  // Add more as needed
];

/**
 * Check if a domain is allowed
 */
export function isDomainAllowed(domain: string): boolean {
  // Check blocklist first
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  if (blockedDomains.some(blocked => normalizedDomain.includes(blocked))) {
    return false;
  }
  
  // Check allowlist
  return defaultTrustedSources.some(
    source => source.isAllowed && normalizedDomain.includes(source.domain)
  );
}

/**
 * Get source reliability score
 */
export function getSourceReliability(domain: string): number {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  const source = defaultTrustedSources.find(
    s => normalizedDomain.includes(s.domain)
  );
  return source?.reliability || 0;
}

export default {
  defaultTrustedSources,
  blockedDomains,
  isDomainAllowed,
  getSourceReliability,
};
