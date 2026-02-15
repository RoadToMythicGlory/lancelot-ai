/**
 * RSS Deduplication Helpers
 *
 * Triple-hash deduplication: urlHash, titleHash, excerptHash.
 * Uses the existing generateHash() utility.
 */

import { generateHash } from '../utils/validation';

/**
 * Normalise and hash a URL.
 * Strips protocol, www, trailing slash, and common tracking params.
 */
export function hashUrl(url: string): string {
  let normalised = url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');

  // Remove common tracking query params
  try {
    const u = new URL(`https://${normalised}`);
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'];
    for (const p of paramsToRemove) u.searchParams.delete(p);
    normalised = u.hostname + u.pathname + (u.search || '');
  } catch {
    // URL parse failed — use as-is
  }

  return generateHash(normalised);
}

/**
 * Normalise and hash a title.
 * Lowercases, strips punctuation, collapses whitespace.
 */
export function hashTitle(title: string): string {
  const normalised = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // keep letters + numbers + whitespace
    .replace(/\s+/g, ' ')
    .trim();
  return generateHash(normalised);
}

/**
 * Normalise and hash an excerpt (first 300 chars).
 */
export function hashExcerpt(excerpt: string): string {
  const normalised = excerpt
    .substring(0, 300)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return generateHash(normalised);
}

/**
 * Check if a candidate is a duplicate based on existing hashes.
 *
 * Returns true if:
 * - urlHash matches (same URL seen before), OR
 * - BOTH titleHash AND excerptHash match (same content from different URL)
 */
export function isDuplicate(
  candidate: { urlHash: string; titleHash: string; excerptHash: string },
  existingUrlHashes: Set<string>,
  existingTitleExcerptPairs: Set<string>,
): boolean {
  if (existingUrlHashes.has(candidate.urlHash)) return true;

  const pairKey = `${candidate.titleHash}:${candidate.excerptHash}`;
  if (existingTitleExcerptPairs.has(pairKey)) return true;

  return false;
}

/**
 * Build a title+excerpt pair key for the dedup set.
 */
export function titleExcerptPairKey(titleHash: string, excerptHash: string): string {
  return `${titleHash}:${excerptHash}`;
}

export default {
  hashUrl,
  hashTitle,
  hashExcerpt,
  isDuplicate,
  titleExcerptPairKey,
};
