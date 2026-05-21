/**
 * Shared report exporter used by the warehouse-area tabs (ציוד, היסטוריה,
 * הקצאות פנימיות, ספקים, מחסנים, אירועים, סטים, שידורי חוץ, מעקב חי, ציוד
 * הנדסה שיתופי).
 *
 * Two outputs, one declarative shape:
 *
 *   - `exportReportToCsv(report)` – UTF‑8 with a BOM so Excel renders
 *     Hebrew correctly. Multi-section reports are emitted as a single
 *     file with a section header row between blocks; each block carries
 *     its own column headers.
 *
 *   - `exportReportToPdf(report)` – opens a popup with a fully styled,
 *     print-ready RTL HTML document and auto-triggers `window.print()`.
 *     The user picks "Save as PDF" from the dialog. This avoids
 *     bundling jsPDF/font assets while keeping Hebrew text crisp and
 *     selectable.
 *
 * Adding a tab? Build an `ExportReport` from the data the user can see
 * (respect filters / search) and pass it to either function. Both
 * functions are pure aside from triggering a download / opening a
 * window, so they're safe to call from anywhere in the UI.
 */

import dayjs from 'dayjs';

export type AccentColor =
  | 'events'
  | 'staff'
  | 'warehouse'
  | 'vendors'
  | 'sets'
  | 'tracking'
  | 'history'
  | 'requests'
  | 'maintenance';

export type StatusVariant =
  | 'active'
  | 'returned'
  | 'neutral'
  | 'warn'
  | 'danger'
  | 'info';

export interface ExportColumn<T = any> {
  /** Internal column key (used for stable identity, not displayed). */
  key: string;
  /** Hebrew header label shown in CSV + PDF. */
  label: string;
  /** Right/center/left alignment. Defaults to right (RTL). */
  align?: 'right' | 'center' | 'left';
  /** Render a numeric cell (centers + narrow). */
  numeric?: boolean;
  /** Render a monospace code cell (barcodes, IDs). */
  code?: boolean;
  /** Make this column wider so it gets more horizontal space in PDF. */
  emphasis?: boolean;
  /** Convert the row into the cell value. */
  value: (row: T) => string | number | null | undefined;
  /**
   * Optional status pill rendering for PDF. When present, the cell is
   * rendered as a colored chip rather than plain text. The returned
   * label still feeds into the CSV.
   */
  status?: (row: T) => { label: string; variant: StatusVariant } | null | undefined;
}

interface BaseSection {
  /** Stable section key (for React keys + section anchors). */
  key: string;
  /** Section title shown in PDF + as a CSV header row. */
  title: string;
  /** Accent color used for the section marker bar / summary card. */
  accent: AccentColor;
  /** Short stat line shown next to the section title in the PDF. */
  meta?: string;
  /** Optional descriptive paragraph under the section title. */
  description?: string;
  /** What to show when the section has no rows. */
  emptyText?: string;
}

export interface ExportTableSection<T = any> extends BaseSection {
  kind: 'table';
  columns: ExportColumn<T>[];
  rows: T[];
}

export interface ExportGroupedSection<T = any> extends BaseSection {
  kind: 'grouped';
  columns: ExportColumn<T>[];
  groups: Array<{
    key: string;
    title: string;
    subtitle?: string;
    secondary?: string;
    badge?: string;
    rows: T[];
  }>;
}

export type ExportSection<T = any> = ExportTableSection<T> | ExportGroupedSection<T>;

export interface ExportSummaryCard {
  label: string;
  value: string | number;
  hint?: string;
  accent: AccentColor;
}

export interface ExportReport {
  /** Document title (cover + browser print title). */
  title: string;
  /** One-line description under the title in the cover. */
  subtitle?: string;
  /** Base filename without extension (e.g. "ספקים"). */
  filenameStem: string;
  /** Short context chips printed next to the date on the cover. */
  metaChips?: string[];
  /** Optional summary cards under the cover. */
  summary?: ExportSummaryCard[];
  /** Sections (each becomes a CSV block + PDF section). */
  sections: ExportSection[];
  /** Tab where the report originated (footer label). */
  origin?: string;
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

const ACCENT_HEX: Record<AccentColor, string> = {
  events: '#6d28d9',
  staff: '#b45309',
  warehouse: '#1d4ed8',
  vendors: '#0891b2',
  sets: '#0d9488',
  tracking: '#7c3aed',
  history: '#475569',
  requests: '#db2777',
  maintenance: '#dc2626',
};

const STATUS_PILL: Record<StatusVariant, { bg: string; fg: string }> = {
  active: { bg: 'rgba(31, 122, 77, 0.12)', fg: '#1f7a4d' },
  returned: { bg: 'rgba(91, 100, 120, 0.12)', fg: '#5b6478' },
  neutral: { bg: 'rgba(30, 58, 138, 0.10)', fg: '#1e3a8a' },
  warn: { bg: 'rgba(180, 83, 9, 0.12)', fg: '#b45309' },
  danger: { bg: 'rgba(220, 38, 38, 0.12)', fg: '#b91c1c' },
  info: { bg: 'rgba(8, 145, 178, 0.12)', fg: '#0e7490' },
};

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function valueAsString(col: ExportColumn, row: any): string {
  const raw = col.value(row);
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

function statusFor(col: ExportColumn, row: any): { label: string; variant: StatusVariant } | null {
  if (!col.status) return null;
  const s = col.status(row);
  return s ? { label: s.label, variant: s.variant } : null;
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilenameStem(stem: string): string {
  // Keep Hebrew, Latin, digits, hyphen, underscore, space; strip everything
  // else (slashes, colons, etc. break Windows file names).
  return stem
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function totalRows(section: ExportSection): number {
  if (section.kind === 'table') return section.rows.length;
  return section.groups.reduce((n, g) => n + g.rows.length, 0);
}

function reportIsEmpty(report: ExportReport): boolean {
  return report.sections.every((s) => totalRows(s) === 0);
}

/* -------------------------------------------------------------------------- */
/*  CSV                                                                       */
/* -------------------------------------------------------------------------- */

export function exportReportToCsv(report: ExportReport): boolean {
  if (reportIsEmpty(report)) return false;

  const lines: string[] = [];

  // Title line so the file is self-describing when opened in Excel.
  lines.push(toCsvCell(report.title));
  const stamp = dayjs().format('DD/MM/YYYY HH:mm');
  const metaLine = [stamp, ...(report.metaChips || [])].filter(Boolean).join(' · ');
  if (metaLine) lines.push(toCsvCell(metaLine));
  lines.push('');

  report.sections.forEach((section, idx) => {
    if (idx > 0) lines.push('');

    const sectionHeader = section.meta ? `${section.title} (${section.meta})` : section.title;
    lines.push(toCsvCell(`■ ${sectionHeader}`));

    if (section.kind === 'table') {
      if (section.rows.length === 0) {
        lines.push(toCsvCell(section.emptyText || 'אין נתונים'));
        return;
      }
      lines.push(section.columns.map((c) => toCsvCell(c.label)).join(','));
      section.rows.forEach((row) => {
        lines.push(section.columns.map((c) => toCsvCell(valueAsString(c, row))).join(','));
      });
      return;
    }

    // grouped
    if (section.groups.length === 0) {
      lines.push(toCsvCell(section.emptyText || 'אין נתונים'));
      return;
    }
    const groupColumnHeader = ['קבוצה', ...section.columns.map((c) => c.label)];
    lines.push(groupColumnHeader.map(toCsvCell).join(','));
    section.groups.forEach((group) => {
      if (group.rows.length === 0) {
        lines.push(toCsvCell(`${group.title} – ללא פריטים`));
        return;
      }
      const groupLabel = [group.title, group.subtitle, group.secondary]
        .filter(Boolean)
        .join(' · ');
      group.rows.forEach((row) => {
        lines.push(
          [groupLabel, ...section.columns.map((c) => valueAsString(c, row))]
            .map(toCsvCell)
            .join(','),
        );
      });
    });
  });

  const csv = '\ufeff' + lines.join('\r\n');
  const filenameStem = sanitizeFilenameStem(report.filenameStem || 'warehouse-report');
  const filename = `${filenameStem}-${dayjs().format('DD.MM.YYYY-HHmm')}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;
}

/* -------------------------------------------------------------------------- */
/*  PDF (print HTML)                                                          */
/* -------------------------------------------------------------------------- */

function renderTableHtml(columns: ExportColumn[], rows: any[]): string {
  if (rows.length === 0) {
    return '<div class="empty-row">אין שורות בקבוצה זו</div>';
  }
  const thead = columns
    .map((c) => {
      const cls = [
        c.numeric ? 'th-num' : '',
        c.emphasis ? 'th-name' : '',
        c.align ? `th-align-${c.align}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<th class="${cls}">${escapeHtml(c.label)}</th>`;
    })
    .join('');

  const tbody = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const status = statusFor(c, row);
          const raw = valueAsString(c, row);
          const text = raw === '' ? '–' : raw;
          const cls = [
            c.numeric ? 'td-num' : '',
            c.code ? 'td-code' : '',
            c.emphasis ? 'td-name' : '',
            c.align ? `td-align-${c.align}` : '',
          ]
            .filter(Boolean)
            .join(' ');
          if (status) {
            return `<td class="${cls}"><span class="status-pill status-pill--${status.variant}">${escapeHtml(status.label)}</span></td>`;
          }
          return `<td class="${cls}">${escapeHtml(text)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="data-table">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;
}

function renderSectionHtml(section: ExportSection): string {
  const accent = section.accent;
  const headHtml = `
    <div class="section-head">
      <div class="section-title">
        <span class="section-marker section-marker--${accent}"></span>
        ${escapeHtml(section.title)}
      </div>
      ${section.meta ? `<div class="section-meta">${escapeHtml(section.meta)}</div>` : ''}
    </div>
    ${section.description ? `<div class="section-desc">${escapeHtml(section.description)}</div>` : ''}`;

  if (section.kind === 'table') {
    if (section.rows.length === 0) {
      return `<section class="section">
        ${headHtml}
        <div class="empty-state">${escapeHtml(section.emptyText || 'אין שורות להצגה')}</div>
      </section>`;
    }
    return `<section class="section">
      ${headHtml}
      <div class="section-body">
        ${renderTableHtml(section.columns, section.rows)}
      </div>
    </section>`;
  }

  // grouped
  if (section.groups.length === 0) {
    return `<section class="section">
      ${headHtml}
      <div class="empty-state">${escapeHtml(section.emptyText || 'אין קבוצות להצגה')}</div>
    </section>`;
  }

  const groupsHtml = section.groups
    .map(
      (group) => `
      <div class="group">
        <div class="group-head">
          <div>
            <div class="group-title">${escapeHtml(group.title)}</div>
            ${group.subtitle ? `<div class="group-sub">${escapeHtml(group.subtitle)}</div>` : ''}
            ${group.secondary ? `<div class="group-sub group-sub--secondary">${escapeHtml(group.secondary)}</div>` : ''}
          </div>
          ${group.badge ? `<div class="group-badge group-badge--${accent}">${escapeHtml(group.badge)}</div>` : ''}
        </div>
        ${renderTableHtml(section.columns, group.rows)}
      </div>`,
    )
    .join('');

  return `<section class="section">
    ${headHtml}
    <div class="section-body">${groupsHtml}</div>
  </section>`;
}

function renderSummaryHtml(report: ExportReport): string {
  if (!report.summary || report.summary.length === 0) return '';
  const cards = report.summary
    .map(
      (card) => `
      <div class="summary-card summary-card--${card.accent}">
        <div class="summary-label">${escapeHtml(card.label)}</div>
        <div class="summary-value">${escapeHtml(card.value)}</div>
        ${card.hint ? `<div class="summary-hint">${escapeHtml(card.hint)}</div>` : ''}
      </div>`,
    )
    .join('');
  return `<div class="summary summary--cols-${report.summary.length}">${cards}</div>`;
}

function buildReportHtml(report: ExportReport): string {
  const stampHuman = dayjs().format('DD/MM/YYYY HH:mm');
  const totalRowCount = report.sections.reduce((n, s) => n + totalRows(s), 0);

  const metaChipsHtml = (report.metaChips || [])
    .map((chip) => `<span class="meta-chip">${escapeHtml(chip)}</span>`)
    .join('');

  const sectionsHtml = report.sections.map(renderSectionHtml).join('');
  const accentVars = (Object.keys(ACCENT_HEX) as AccentColor[])
    .map((k) => `--accent-${k}: ${ACCENT_HEX[k]};`)
    .join(' ');
  const pillVars = (Object.keys(STATUS_PILL) as StatusVariant[])
    .map(
      (k) =>
        `--pill-${k}-bg: ${STATUS_PILL[k].bg}; --pill-${k}-fg: ${STATUS_PILL[k].fg};`,
    )
    .join(' ');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(report.title)} – ${escapeHtml(stampHuman)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap');

    :root {
      --primary: #0f1f4b;
      --primary-2: #1e3a8a;
      --accent: #c8a35a;
      --background: #f5f6fa;
      --surface: #ffffff;
      --surface-alt: #fbfbfd;
      --border: #e3e6ee;
      --text: #0b1530;
      --muted: #5b6478;
      ${accentVars}
      ${pillVars}
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Heebo', 'Segoe UI', Tahoma, Arial, sans-serif;
      background: var(--background);
      color: var(--text);
      direction: rtl;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      font-size: 12px;
    }

    .doc { max-width: 1080px; margin: 0 auto; padding: 0 24px 48px; }

    .cover {
      background: radial-gradient(circle at 85% 0%, #1e3a8a 0%, #0f1f4b 55%, #08123a 100%);
      color: #fff;
      padding: 36px 32px;
      border-radius: 0 0 20px 20px;
      position: relative;
      overflow: hidden;
      margin-bottom: 28px;
    }
    .cover::after {
      content: '';
      position: absolute; inset: 0;
      background:
        radial-gradient(600px 280px at 10% 100%, rgba(200, 163, 90, 0.16), transparent 60%),
        radial-gradient(420px 220px at 90% 110%, rgba(255,255,255,0.08), transparent 60%);
      pointer-events: none;
    }
    .cover-inner { position: relative; z-index: 1; }
    .eyebrow {
      display: inline-block;
      letter-spacing: 0.16em;
      font-size: 0.72rem;
      color: #d9c490;
      text-transform: uppercase;
      margin-bottom: 10px;
      font-weight: 600;
    }
    .cover h1 { font-size: 1.9rem; font-weight: 700; margin: 0 0 8px; }
    .cover p.subtitle {
      margin: 0 0 22px;
      color: #d6deef;
      font-size: 0.95rem;
      max-width: 760px;
    }
    .cover-meta { display: flex; flex-wrap: wrap; gap: 10px; }
    .meta-chip {
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 0.78rem;
      font-weight: 500;
    }

    .summary {
      display: grid;
      gap: 14px;
      margin-bottom: 28px;
    }
    .summary--cols-1 { grid-template-columns: 1fr; }
    .summary--cols-2 { grid-template-columns: repeat(2, 1fr); }
    .summary--cols-3 { grid-template-columns: repeat(3, 1fr); }
    .summary--cols-4 { grid-template-columns: repeat(4, 1fr); }
    .summary--cols-5 { grid-template-columns: repeat(5, 1fr); }
    .summary--cols-6 { grid-template-columns: repeat(3, 1fr); }
    .summary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(15, 31, 75, 0.04);
    }
    .summary-card::before {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
      width: 4px;
      height: 100%;
    }
    .summary-card--events::before { background: var(--accent-events); }
    .summary-card--staff::before { background: var(--accent-staff); }
    .summary-card--warehouse::before { background: var(--accent-warehouse); }
    .summary-card--vendors::before { background: var(--accent-vendors); }
    .summary-card--sets::before { background: var(--accent-sets); }
    .summary-card--tracking::before { background: var(--accent-tracking); }
    .summary-card--history::before { background: var(--accent-history); }
    .summary-card--requests::before { background: var(--accent-requests); }
    .summary-card--maintenance::before { background: var(--accent-maintenance); }
    .summary-label {
      color: var(--muted);
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .summary-value {
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--primary);
      line-height: 1.1;
    }
    .summary-hint { color: var(--muted); font-size: 0.72rem; margin-top: 6px; }

    .section {
      margin-bottom: 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(15, 31, 75, 0.04);
      page-break-inside: avoid;
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: linear-gradient(180deg, var(--surface) 0%, var(--surface-alt) 100%);
      border-bottom: 1px solid var(--border);
    }
    .section-desc {
      padding: 10px 18px 0;
      color: var(--muted);
      font-size: 0.82rem;
    }
    .section-body { padding: 6px 0 0; }
    .section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--primary);
    }
    .section-marker {
      display: inline-block;
      width: 10px;
      height: 22px;
      border-radius: 4px;
    }
    .section-marker--events { background: var(--accent-events); }
    .section-marker--staff { background: var(--accent-staff); }
    .section-marker--warehouse { background: var(--accent-warehouse); }
    .section-marker--vendors { background: var(--accent-vendors); }
    .section-marker--sets { background: var(--accent-sets); }
    .section-marker--tracking { background: var(--accent-tracking); }
    .section-marker--history { background: var(--accent-history); }
    .section-marker--requests { background: var(--accent-requests); }
    .section-marker--maintenance { background: var(--accent-maintenance); }
    .section-meta {
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .group {
      padding: 14px 18px;
      border-bottom: 1px dashed var(--border);
    }
    .group:last-child { border-bottom: none; }
    .group-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 10px;
    }
    .group-title {
      font-weight: 700;
      color: var(--primary);
      font-size: 0.98rem;
    }
    .group-sub {
      color: var(--muted);
      font-size: 0.78rem;
      margin-top: 2px;
    }
    .group-sub--secondary { color: var(--accent-staff); }
    .group-badge {
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 0.72rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .group-badge--events { background: rgba(109, 40, 217, 0.10); color: var(--accent-events); }
    .group-badge--staff { background: rgba(180, 83, 9, 0.10); color: var(--accent-staff); }
    .group-badge--warehouse { background: rgba(29, 78, 216, 0.10); color: var(--accent-warehouse); }
    .group-badge--vendors { background: rgba(8, 145, 178, 0.10); color: var(--accent-vendors); }
    .group-badge--sets { background: rgba(13, 148, 136, 0.10); color: var(--accent-sets); }
    .group-badge--tracking { background: rgba(124, 58, 237, 0.10); color: var(--accent-tracking); }
    .group-badge--history { background: rgba(71, 85, 105, 0.10); color: var(--accent-history); }
    .group-badge--requests { background: rgba(219, 39, 119, 0.10); color: var(--accent-requests); }
    .group-badge--maintenance { background: rgba(220, 38, 38, 0.10); color: var(--accent-maintenance); }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    .data-table thead th {
      text-align: right;
      background: var(--surface-alt);
      color: var(--muted);
      font-weight: 600;
      font-size: 0.74rem;
      letter-spacing: 0.02em;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
    }
    .data-table tbody td {
      padding: 8px 12px;
      border-bottom: 1px solid #f0f2f7;
      vertical-align: top;
    }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table tbody tr:nth-child(even) td { background: #fbfcfe; }
    .td-name { font-weight: 600; color: var(--text); }
    .th-name { width: 24%; }
    .td-num, .th-num { text-align: center; width: 64px; }
    .td-align-left, .th-align-left { text-align: left; }
    .td-align-center, .th-align-center { text-align: center; }
    .td-align-right, .th-align-right { text-align: right; }
    .td-code {
      font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
      font-size: 0.76rem;
      color: var(--primary-2);
      direction: ltr;
      text-align: right;
    }

    .status-pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .status-pill--active { background: var(--pill-active-bg); color: var(--pill-active-fg); }
    .status-pill--returned { background: var(--pill-returned-bg); color: var(--pill-returned-fg); }
    .status-pill--neutral { background: var(--pill-neutral-bg); color: var(--pill-neutral-fg); }
    .status-pill--warn { background: var(--pill-warn-bg); color: var(--pill-warn-fg); }
    .status-pill--danger { background: var(--pill-danger-bg); color: var(--pill-danger-fg); }
    .status-pill--info { background: var(--pill-info-bg); color: var(--pill-info-fg); }

    .empty-state, .empty-row {
      padding: 22px;
      text-align: center;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .empty-row { padding: 14px; }

    footer.doc-footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 0.74rem;
    }

    @media print {
      body { background: #fff; font-size: 11px; }
      .doc { padding: 0; }
      .cover {
        border-radius: 0;
        margin-bottom: 18px;
        padding: 24px 28px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .summary, .section, .summary-card, .status-pill, .group-badge, .section-marker {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .section { box-shadow: none; }
      .group, .section { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }

    @page {
      size: A4;
      margin: 14mm 12mm;
    }
  </style>
</head>
<body>
  <div class="doc">
    <header class="cover">
      <div class="cover-inner">
        <div class="eyebrow">Lancelot · ${escapeHtml(report.origin || 'מחסן')}</div>
        <h1>${escapeHtml(report.title)}</h1>
        ${report.subtitle ? `<p class="subtitle">${escapeHtml(report.subtitle)}</p>` : ''}
        <div class="cover-meta">
          <span class="meta-chip">נוצר ב־${escapeHtml(stampHuman)}</span>
          ${metaChipsHtml}
          <span class="meta-chip">סה״כ שורות: ${totalRowCount}</span>
        </div>
      </div>
    </header>

    ${renderSummaryHtml(report)}

    ${sectionsHtml}

    <footer class="doc-footer">
      <div>Lancelot · מערכת ניהול מחסן ושידור</div>
      <div>נוצר אוטומטית · ${escapeHtml(stampHuman)}</div>
    </footer>
  </div>
  <script>
    window.addEventListener('load', function () {
      window.requestAnimationFrame(function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 350);
      });
    });
  </script>
</body>
</html>`;
}

export function exportReportToPdf(report: ExportReport): { ok: boolean; reason?: 'empty' | 'blocked' } {
  if (reportIsEmpty(report)) return { ok: false, reason: 'empty' };

  const html = buildReportHtml(report);
  const printWindow = window.open('', '_blank', 'width=1100,height=820');
  if (!printWindow) {
    return { ok: false, reason: 'blocked' };
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Small shared helpers                                                      */
/* -------------------------------------------------------------------------- */

export const formatDateTime = (value?: string | null): string =>
  value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY HH:mm') : '';

export const formatDate = (value?: string | null): string =>
  value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY') : '';
