/**
 * RSS Feed Verification Script
 *
 * CLI: npm run rss:verify
 *
 * For each feed in rssFeedSources:
 * 0. SKIP if url === '<TODO_VERIFY>'
 * 1. FAIL if domain not in allowlist (terminal)
 * 2. HTTP GET + latency measurement
 * 3. XML validity check
 * 4. Minimum item count (≥3 with title + link)
 * 5. Date field check (≥70% with pubDate/updated → WARN if below)
 * 6. Latency report
 *
 * Does NOT import rssPipelineConfig.enabled — runs regardless of pipeline state.
 * Does NOT auto-activate feeds.
 */

import { rssFeedSources } from '../rss/rss-config';
import { isDomainAllowed } from '../config/trusted-sources';

// Dynamic import for fast-xml-parser to handle module resolution
async function run(): Promise<void> {
  const { XMLParser } = await import('fast-xml-parser');

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => ['item', 'entry'].includes(name),
    trimValues: true,
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Lancelot RSS Feed Verification');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Feeds configured: ${rssFeedSources.length}`);
  console.log('');

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  let skipCount = 0;

  for (const feed of rssFeedSources) {
    // Step 0: Skip <TODO_VERIFY>
    if (feed.url === '<TODO_VERIFY>') {
      console.log(`  [SKIP] ${feed.id} (${feed.name}) - URL not configured`);
      skipCount++;
      continue;
    }

    // Step 1: Domain allowlist check (terminal)
    let domain: string;
    try {
      domain = new URL(feed.url).hostname.replace(/^www\./, '');
    } catch {
      console.log(`  [FAIL] ${feed.id} (${feed.name}) - Invalid URL: ${feed.url}`);
      failCount++;
      continue;
    }

    if (!isDomainAllowed(domain)) {
      console.log(`  [FAIL] ${feed.id} (${feed.name}) - domain "${domain}" not in allowlist`);
      failCount++;
      continue;
    }

    // Step 2: HTTP GET + latency
    const startMs = Date.now();
    let xml: string;
    try {
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Lancelot-AI-Agent/2.0 RSS-Verify',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const elapsed = Date.now() - startMs;
        console.log(`  [FAIL] ${feed.id} (${feed.name}) - HTTP ${response.status} ${response.statusText}, ${elapsed}ms`);
        failCount++;
        continue;
      }

      xml = await response.text();
    } catch (fetchErr) {
      const elapsed = Date.now() - startMs;
      console.log(`  [FAIL] ${feed.id} (${feed.name}) - ${(fetchErr as Error).message}, ${elapsed}ms`);
      failCount++;
      continue;
    }

    const latencyMs = Date.now() - startMs;

    // Step 3: XML validity
    let parsed: any;
    try {
      parsed = xmlParser.parse(xml);
    } catch (xmlErr) {
      console.log(`  [FAIL] ${feed.id} (${feed.name}) - Invalid XML: ${(xmlErr as Error).message}, ${latencyMs}ms`);
      failCount++;
      continue;
    }

    // Step 4: Extract items and check minimum count
    const items = extractItems(parsed);
    const validItems = items.filter((item) => item.title && item.link);

    if (validItems.length < 3) {
      console.log(`  [FAIL] ${feed.id} (${feed.name}) - Only ${validItems.length} valid items (need ≥3), ${latencyMs}ms`);
      failCount++;
      continue;
    }

    // Step 5: Date field check (relaxed — WARN if <70%)
    const itemsWithDate = validItems.filter((item) => item.date);
    const dateRatio = validItems.length > 0 ? itemsWithDate.length / validItems.length : 0;
    const datePercent = Math.round(dateRatio * 100);

    if (dateRatio < 0.7) {
      console.log(`  [WARN] ${feed.id} (${feed.name}) - ${validItems.length} items, ${latencyMs}ms, ${itemsWithDate.length}/${validItems.length} have pubDate (${datePercent}%)`);
      warnCount++;
    } else {
      console.log(`  [PASS] ${feed.id} (${feed.name}) - ${validItems.length} items, ${latencyMs}ms, ${itemsWithDate.length}/${validItems.length} have pubDate`);
      passCount++;
    }
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Results: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL, ${skipCount} SKIP`);
  console.log('');
  console.log('  To activate a feed: set active: true in src/rss/rss-config.ts');
  console.log('  and replace the URL with the verified feed URL.');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Exit with non-zero if any feeds failed
  if (failCount > 0) {
    process.exit(1);
  }
}

// ─── Item extraction helpers ─────────────────────────────────────────────────

interface FeedItem {
  title: string;
  link: string;
  date: string;
}

function extractItems(parsed: any): FeedItem[] {
  // RSS 2.0
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) return normaliseRssItems(rssItems);

  // Atom
  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) return normaliseAtomEntries(atomEntries);

  // RDF
  const rdfItems = parsed?.['rdf:RDF']?.item;
  if (rdfItems) return normaliseRssItems(rdfItems);

  return [];
}

function normaliseRssItems(items: any): FeedItem[] {
  if (!Array.isArray(items)) items = [items];
  return items.filter(Boolean).map((item: any) => ({
    title: typeof item.title === 'object' ? item.title?.['#text'] || '' : String(item.title || ''),
    link: typeof item.link === 'object' ? item.link?.['#text'] || item.link?.['@_href'] || '' : String(item.link || ''),
    date: item.pubDate || item['dc:date'] || '',
  }));
}

function normaliseAtomEntries(entries: any): FeedItem[] {
  if (!Array.isArray(entries)) entries = [entries];
  return entries.filter(Boolean).map((entry: any) => {
    let link = '';
    if (Array.isArray(entry.link)) {
      const altLink = entry.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
      link = altLink?.['@_href'] || entry.link[0]?.['@_href'] || '';
    } else if (typeof entry.link === 'object') {
      link = entry.link['@_href'] || '';
    } else {
      link = String(entry.link || '');
    }

    return {
      title: typeof entry.title === 'object' ? entry.title?.['#text'] || '' : String(entry.title || ''),
      link,
      date: entry.published || entry.updated || '',
    };
  });
}

// ─── Run ─────────────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
