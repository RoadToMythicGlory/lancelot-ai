/**
 * Minimal client-side CSV export used by the MCR Events and Schedule tabs.
 *
 * We deliberately keep this dependency-free: the volume of MCR rows per
 * day/week/month is small enough that a plain CSV download is the most
 * predictable and copy-paste-friendly format for operators on Windows.
 *
 * The CSV is prefixed with a BOM so Excel/LibreOffice on Hebrew-locale
 * Windows machines opens it with the correct UTF-8 encoding.
 */

function stripHtml(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') return String(value);
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function csvEscape(value: unknown): string {
  const stringValue = stripHtml(value);
  if (/[",\n\r;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function exportCsv(filename: string, headers: string[], rows: any[][]) {
  const csvLines: string[] = [];
  csvLines.push(headers.map(csvEscape).join(','));
  for (const row of rows) {
    csvLines.push(row.map(csvEscape).join(','));
  }

  // Prefix with UTF-8 BOM so Hebrew renders correctly in Excel.
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
