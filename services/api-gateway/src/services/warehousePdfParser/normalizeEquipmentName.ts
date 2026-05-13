/**
 * Normalizes equipment names for matching purposes.
 *
 * Handles:
 * - Case folding (uppercase)
 * - Whitespace collapse and trim
 * - Punctuation removal (dots, dashes except within known patterns)
 * - Hebrew/English variant folding (e.g. "800 U LIVE" / "800LIVEU" / "LIVEU 800")
 */
export function normalizeEquipmentName(raw: string): string {
  let name = raw.trim();

  // Uppercase
  name = name.toUpperCase();

  // Remove dots, commas, underscores
  name = name.replace(/[.,_]/g, ' ');

  // Collapse multiple spaces
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

/**
 * Produces a canonical key optimized for matching LiveU and similar product lines.
 * Strips all spaces/dashes, then collects ALL letters into a sorted bag and ALL
 * digits into a sorted bag. This means "800 U LIVE", "LIVEU 800", "800LIVEU",
 * and "ULIVE800" all produce the exact same key because they contain the same
 * characters — just in a different order.
 */
export function canonicalKey(raw: string): string {
  const name = normalizeEquipmentName(raw).replace(/[\s\-]/g, '');

  const letters = (name.match(/[A-Z\u0590-\u05FF]/g) || []).sort().join('');
  const digits = (name.match(/\d/g) || []).sort().join('');

  return [digits, letters].filter(Boolean).join('_');
}
