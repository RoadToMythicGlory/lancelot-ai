/**
 * Lightweight HTML sanitizer for MCR rich-text fields rendered via
 * dangerouslySetInnerHTML.
 *
 * We keep an allow-list of safe inline formatting tags + a couple of
 * block-level wrappers used by TipTap. Everything else is stripped. This is
 * intentionally conservative — operator-facing content should never run
 * <script>, attach event handlers, embed iframes, or render arbitrary
 * external resources.
 *
 * No external dependency is used to keep the bundle small; for stricter
 * server-side sanitization we would reach for `sanitize-html` or DOMPurify,
 * but since this content is also typed by trusted operators in our own UI,
 * a tight allow-list is adequate here.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'mark',
  'span',
  'ul',
  'ol',
  'li',
  'div',
  'sub',
  'sup',
  'code',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'h4',
]);

const ALLOWED_ATTRS = new Set(['style', 'class']);

// Disallow url(...), expressions, behaviours, and css imports inside inline
// styles. We only keep simple color / background-color / font-weight rules.
function sanitizeStyle(style: string): string {
  const rules = style
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const rule of rules) {
    const [rawProp, rawVal] = rule.split(':');
    if (!rawProp || !rawVal) continue;
    const prop = rawProp.trim().toLowerCase();
    const val = rawVal.trim();
    if (/[<>]/.test(val)) continue;
    if (/url\(|expression\(|@import|javascript:/i.test(val)) continue;
    if (
      [
        'color',
        'background-color',
        'background',
        'font-weight',
        'font-style',
        'text-decoration',
        'text-align',
        'direction',
      ].includes(prop)
    ) {
      kept.push(`${prop}: ${val}`);
    }
  }
  return kept.join('; ');
}

export function sanitizeMcrHtml(input: string | null | undefined): string {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // SSR safety: strip everything that looks like a tag.
    return String(input).replace(/<[^>]*>/g, '');
  }
  try {
    const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
    const root = doc.body.firstChild as HTMLElement | null;
    if (!root) return '';

    const walk = (node: HTMLElement | ChildNode) => {
      if (!node) return;
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          const tag = el.tagName.toLowerCase();
          if (!ALLOWED_TAGS.has(tag)) {
            // Replace disallowed elements with their text content.
            const replacement = doc.createTextNode(el.textContent || '');
            el.replaceWith(replacement);
            continue;
          }
          // Strip all attributes except allowed ones.
          const attrs = Array.from(el.attributes);
          for (const attr of attrs) {
            if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) {
              el.removeAttribute(attr.name);
            } else if (attr.name.toLowerCase() === 'style') {
              const cleaned = sanitizeStyle(attr.value);
              if (cleaned) {
                el.setAttribute('style', cleaned);
              } else {
                el.removeAttribute('style');
              }
            }
          }
          walk(el);
        }
      }
    };

    walk(root);
    return root.innerHTML;
  } catch {
    return String(input).replace(/<[^>]*>/g, '');
  }
}
