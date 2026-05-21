'use client';

import React, { useState } from 'react';
import { App, Button, Space, Tooltip } from 'antd';
import { DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import {
  exportReportToCsv,
  exportReportToPdf,
  type ExportReport,
} from '@/utils/warehouseReportExport';

/**
 * Buttons users see in every warehouse tab's toolbar.
 *
 * `buildReport` is invoked lazily (only on click) so each tab can do the
 * minimum work needed to flatten its current view. Returning `null`
 * means "nothing to export right now" and surfaces a Hebrew warning toast.
 *
 * The callback may be async — for tabs whose visible list is paginated
 * server-side (e.g. ציוד), the click handler can run a one-off fetch of
 * the full result set before returning the report.
 */
interface Props {
  /** Lazily produce the report when the user clicks. Return `null` for empty. */
  buildReport: () => ExportReport | null | Promise<ExportReport | null>;
  /**
   * Disables both buttons while the parent is still loading / has no data.
   * The exporter also disables itself while a build is in-flight to
   * prevent double clicks.
   */
  disabled?: boolean;
  /** Optional size pass-through. */
  size?: 'small' | 'middle' | 'large';
  /** Hide labels and show only icons (for tight toolbars). */
  compact?: boolean;
  className?: string;
}

const WarehouseExportButtons: React.FC<Props> = ({
  buildReport,
  disabled,
  size = 'middle',
  compact = false,
  className,
}) => {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);

  const handle = async (kind: 'csv' | 'pdf') => {
    if (busy) return;
    setBusy(kind);
    try {
      const report = await buildReport();
      if (!report) {
        message.warning('אין נתונים לייצוא');
        return;
      }
      if (kind === 'csv') {
        const ok = exportReportToCsv(report);
        if (!ok) {
          message.warning('אין נתונים לייצוא');
          return;
        }
        message.success('הקובץ יורד כעת');
        return;
      }
      const result = exportReportToPdf(report);
      if (result.ok) {
        message.success('חלון ההדפסה ייפתח – בחרו "שמור כ‑PDF" מתפריט היעד');
      } else if (result.reason === 'empty') {
        message.warning('אין נתונים לייצוא');
      } else {
        message.error('הדפדפן חסם את חלון ההדפסה. אנא אפשרו חלונות קופצים.');
      }
    } catch (err) {
      // Keep the error visible in dev console; user gets a friendly toast.
      // eslint-disable-next-line no-console
      console.error('[WarehouseExportButtons]', err);
      message.error('שגיאה ביצירת הקובץ לייצוא');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Space.Compact size={size} className={className}>
      <Tooltip title="ייצוא לקובץ CSV (Excel)">
        <Button
          icon={<DownloadOutlined />}
          onClick={() => handle('csv')}
          disabled={disabled}
          loading={busy === 'csv'}
        >
          {compact ? '' : 'CSV'}
        </Button>
      </Tooltip>
      <Tooltip title="ייצוא לדוח PDF מעוצב">
        <Button
          icon={<FilePdfOutlined />}
          onClick={() => handle('pdf')}
          disabled={disabled}
          loading={busy === 'pdf'}
        >
          {compact ? '' : 'PDF'}
        </Button>
      </Tooltip>
    </Space.Compact>
  );
};

export default WarehouseExportButtons;
