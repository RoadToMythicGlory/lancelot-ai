/**
 * Heuristic document parser for the MCR synopsis helper.
 *
 * Given a piece of text (possibly extracted from PDF / DOCX / XLSX / CSV
 * elsewhere on the client) this module looks for likely satellite / feed
 * configurations and likely output platform / destination definitions, and
 * returns them as structured suggestions for the operator to review.
 *
 * The matcher is intentionally conservative: only fields it is confident
 * about are filled in. The operator always reviews + selects before any
 * suggestion is persisted onto an MCR event.
 */

export interface FeedSuggestion {
  name?: string;
  satellite?: string;
  frequency?: string;
  symbolRate?: string;
  polarization?: string;
  fec?: string;
  encryptionType?: string;
  encryptionKey?: string;
  bissKey?: string;
  format?: string;
  notes?: string;
}

export type PlatformStatusGuess = 'PENDING' | 'CONFIRMED' | 'LIVE' | 'OFF';

export interface PlatformSuggestion {
  name?: string;
  outputType?: string;
  status?: PlatformStatusGuess;
  details?: string;
}

export interface ParseResult {
  feeds: FeedSuggestion[];
  platforms: PlatformSuggestion[];
}

/**
 * Try to extract feed-style records: blocks of lines that look like a
 * satellite configuration. Each "block" is separated by blank lines or
 * obvious headers.
 */
function extractBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  return normalized
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

const FREQUENCY_RE = /\b(\d{3,5}(?:[\.,]\d+)?)\s*(MHz|GHz)?\b/i;
const SYMBOL_RATE_RE = /\b(?:SR|symbol\s*rate|sr)\s*[:=]?\s*(\d{2,7}(?:[\.,]\d+)?)/i;
const FREQ_LABEL_RE = /\b(?:freq(?:uency)?|תדר)\s*[:=]?\s*(\d{3,5}(?:[\.,]\d+)?)\s*(MHz|GHz)?/i;
const POLARIZATION_RE = /\b(horizontal|vertical|circular|H|V|אנכי|אופקי)\b/i;
const FEC_RE = /\b(FEC|תיקון\s*שגיאות)\s*[:=]?\s*([0-9]\/[0-9]+|auto)/i;
const ENCRYPTION_RE = /\b(BISS|biss-?1|biss-?e|biss-?ca|conax|irdeto|nagra|nds|nagravision|none|clear)\b/i;
const BISS_KEY_RE = /\b(?:BISS\s*key|biss\s*ca|biss-?1)\s*[:=]?\s*([0-9a-fA-F]{12,32})\b/i;
const SATELLITE_RE = /\b(?:satellite|sat|לוויין)\s*[:=]?\s*([\p{L}A-Z0-9 \-]{2,40})/iu;
const FORMAT_RE = /\b(DVB-?S2X?|DVBS2X?|H\.264|H\.265|HEVC|MPEG-?2|MPEG-?4|HD|UHD|SD|4K)\b/i;
const URL_RE = /\b(srt:\/\/[^\s]+|rtmps?:\/\/[^\s]+|udp:\/\/[^\s]+|https?:\/\/[^\s]+)\b/i;
const PLATFORM_KW_RE = /\b(youtube|facebook|twitch|x\.com|twitter|instagram|tiktok|kan|reshet|keshet|הופ|כאן|חדשות|broadcast|live|ott|web|app|מובייל|פלטפורמה)\b/i;

function pickPolarization(text: string): string | undefined {
  const m = text.match(POLARIZATION_RE);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  if (v === 'h' || v === 'horizontal' || v === 'אופקי') return 'Horizontal';
  if (v === 'v' || v === 'vertical' || v === 'אנכי') return 'Vertical';
  if (v === 'circular') return 'Circular';
  return undefined;
}

function pickFrequency(text: string): string | undefined {
  const labelled = text.match(FREQ_LABEL_RE);
  if (labelled) {
    const num = labelled[1].replace(',', '.');
    const unit = labelled[2] || 'MHz';
    return `${num} ${unit}`.trim();
  }
  const m = text.match(FREQUENCY_RE);
  if (!m) return undefined;
  const num = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(num)) return undefined;
  if (num < 100 || num > 60000) return undefined;
  const unit = m[2] || (num < 100 ? 'GHz' : 'MHz');
  return `${num} ${unit}`.trim();
}

function pickSymbolRate(text: string): string | undefined {
  const m = text.match(SYMBOL_RATE_RE);
  if (!m) return undefined;
  return m[1].replace(',', '.');
}

function pickFec(text: string): string | undefined {
  const m = text.match(FEC_RE);
  if (!m) return undefined;
  return m[2];
}

function pickEncryption(text: string): { type?: string; key?: string } {
  const out: { type?: string; key?: string } = {};
  const t = text.match(ENCRYPTION_RE);
  if (t) {
    out.type = t[1].toUpperCase();
  }
  const k = text.match(BISS_KEY_RE);
  if (k) {
    out.key = k[1];
  }
  return out;
}

function pickSatellite(text: string): string | undefined {
  const m = text.match(SATELLITE_RE);
  if (!m) return undefined;
  const name = m[1].trim();
  if (name.length < 2) return undefined;
  return name;
}

function pickFormat(text: string): string | undefined {
  const m = text.match(FORMAT_RE);
  return m ? m[1].toUpperCase() : undefined;
}

function looksLikeFeedBlock(text: string): boolean {
  const hits = [
    FREQUENCY_RE.test(text) || FREQ_LABEL_RE.test(text),
    SYMBOL_RATE_RE.test(text),
    POLARIZATION_RE.test(text),
    /\b(satellite|sat|לוויין|DVB|transponder)\b/i.test(text),
    BISS_KEY_RE.test(text),
  ].filter(Boolean).length;
  return hits >= 2;
}

function looksLikePlatformBlock(text: string): boolean {
  return URL_RE.test(text) || PLATFORM_KW_RE.test(text);
}

function pickPlatformName(block: string): string | undefined {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const kw = line.match(PLATFORM_KW_RE);
    if (kw) {
      const trimmed = line.replace(/^[\-•*\d\.\)\s]+/, '').trim();
      if (trimmed.length > 1 && trimmed.length < 80) return trimmed;
    }
  }
  return lines[0]?.slice(0, 80);
}

function pickOutputType(block: string): string | undefined {
  const u = block.match(URL_RE);
  if (u) {
    const url = u[1];
    if (url.startsWith('srt:')) return 'SRT';
    if (url.startsWith('rtmp:') || url.startsWith('rtmps:')) return 'RTMP';
    if (url.startsWith('udp:')) return 'UDP';
    if (url.startsWith('http:') || url.startsWith('https:')) return 'HTTP';
  }
  return undefined;
}

function pickPlatformStatus(block: string): PlatformStatusGuess {
  if (/\b(live|on\s*air|באוויר)\b/i.test(block)) return 'LIVE';
  if (/\b(off|disabled|כבוי)\b/i.test(block)) return 'OFF';
  if (/\b(confirmed|approved|מאושר)\b/i.test(block)) return 'CONFIRMED';
  return 'PENDING';
}

function pickFeedName(block: string): string | undefined {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return undefined;
  // First line is usually a title, unless it is clearly a key:value pair.
  const candidate = lines[0];
  if (/[:=]/.test(candidate) && candidate.length > 60) return undefined;
  return candidate.slice(0, 80);
}

export function parseMcrDocument(
  text: string,
  lookFor: ('FEED' | 'PLATFORM')[] = ['FEED', 'PLATFORM'],
): ParseResult {
  if (!text || typeof text !== 'string') {
    return { feeds: [], platforms: [] };
  }

  const want = new Set(lookFor);
  const blocks = extractBlocks(text);
  const feeds: FeedSuggestion[] = [];
  const platforms: PlatformSuggestion[] = [];

  for (const block of blocks) {
    if (want.has('FEED') && looksLikeFeedBlock(block)) {
      const enc = pickEncryption(block);
      const feed: FeedSuggestion = {
        name: pickFeedName(block),
        satellite: pickSatellite(block),
        frequency: pickFrequency(block),
        symbolRate: pickSymbolRate(block),
        polarization: pickPolarization(block),
        fec: pickFec(block),
        encryptionType: enc.type,
        encryptionKey: enc.key && enc.type !== 'BISS' ? enc.key : undefined,
        bissKey: enc.type === 'BISS' || /BISS/i.test(block) ? enc.key : undefined,
        format: pickFormat(block),
        notes: undefined,
      };
      // Reject empty rows where nothing useful was parsed.
      const useful = Object.values(feed).filter((v) => v && String(v).trim().length > 0).length;
      if (useful >= 2) {
        feeds.push(feed);
        continue;
      }
    }

    if (want.has('PLATFORM') && looksLikePlatformBlock(block)) {
      const platform: PlatformSuggestion = {
        name: pickPlatformName(block),
        outputType: pickOutputType(block),
        status: pickPlatformStatus(block),
        details: block.slice(0, 300),
      };
      const useful = Object.values(platform).filter((v) => v && String(v).trim().length > 0).length;
      if (useful >= 2) {
        platforms.push(platform);
      }
    }
  }

  return { feeds, platforms };
}
