'use client';

/**
 * Import-from-Excel flow for the Broadcast Array grid.
 *
 *  1. User picks an .xlsx file (the weekly "מערך שידורים" sheet).
 *  2. The file is POSTed to the excel-parser service, which returns a
 *     list of parsed rows (date, time, channel, location, roles, …).
 *  3. We re-fetch the full broadcast event window covering every row's
 *     date and run an in-memory matcher (channel + start time + fuzzy
 *     title) to pair each parsed row with an existing event.
 *  4. Names are matched against the configured user roster for each
 *     role; unrecognised names fall back to a "custom" tag so the
 *     operator still sees them.
 *  5. The operator reviews / overrides matches, picks which rows to
 *     apply, and confirms — we then save each row via the same
 *     `UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA` mutation the modal uses.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  ExclamationCircleTwoTone,
  InboxOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import { GET_BROADCAST_EVENTS } from '@/graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '@/graphql/mutations';
import {
  ParsedBroadcastArrayRow,
  RoleColumnLite,
  RowResolution,
  buildResolutions,
  dateRangeOfRows,
  isCustomValue,
} from './importHelpers';

const { Text, Title, Paragraph } = Typography;
const { Dragger } = Upload;

interface CrewAssignment {
  role: string;
  userId?: string | null;
  userName: string;
}

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  roleColumns: RoleColumnLite[];
  usersByRole: Record<string, Array<{ id: string; label: string }>>;
  /** Re-fetched after a successful apply so the parent grid shows the new state. */
  onApplied: () => void;
  canWrite: boolean;
}

type Phase = 'upload' | 'review' | 'applying' | 'done';

const STATUS_LABELS: Record<RowResolution['status'], { label: string; color: string }> = {
  MATCHED: { label: 'תואם', color: 'green' },
  AMBIGUOUS: { label: 'מספר התאמות', color: 'gold' },
  UNMATCHED: { label: 'לא נמצא', color: 'red' },
};

export default function ImportExcelModal({
  open,
  onClose,
  roleColumns,
  usersByRole,
  onApplied,
  canWrite,
}: ImportExcelModalProps) {
  const { message } = App.useApp();
  const apollo = useApolloClient();

  const [phase, setPhase] = useState<Phase>('upload');
  const [uploading, setUploading] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedBroadcastArrayRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<RowResolution[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyResult, setApplyResult] = useState<{ ok: number; failed: number } | null>(null);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (open) {
      setPhase('upload');
      setUploading(false);
      setParsedRows([]);
      setParseErrors([]);
      setResolutions([]);
      setEventsLoading(false);
      setFileName('');
      setApplyProgress(0);
      setApplyResult(null);
    }
  }, [open]);

  // -------------------------------------------------------------------------
  // Step 1 — upload + parse
  // -------------------------------------------------------------------------

  const uploadProps: UploadProps = {
    name: 'file',
    accept: '.xlsx,.xls',
    multiple: false,
    showUploadList: false,
    beforeUpload: async (file) => {
      setUploading(true);
      setFileName(file.name);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const baseUrl =
          process.env.NEXT_PUBLIC_EXCEL_PARSER_URL || 'http://localhost:4002';
        const res = await fetch(`${baseUrl}/parse-broadcast-array`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          throw new Error(`Parser returned ${res.status}`);
        }
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || 'Parser failed');
        }
        const rows: ParsedBroadcastArrayRow[] = json.rows || [];
        if (!rows.length) {
          message.warning('הקובץ נטען אך לא נמצאו שורות תקפות');
          setUploading(false);
          return false;
        }
        setParsedRows(rows);
        setParseErrors(json.errors || []);
        await resolveAgainstEvents(rows);
      } catch (err: any) {
        message.error(`עיבוד הקובץ נכשל: ${err?.message || 'שגיאה לא ידועה'}`);
        setUploading(false);
      }
      return false; // prevent AntD auto-upload
    },
  };

  const resolveAgainstEvents = async (rows: ParsedBroadcastArrayRow[]) => {
    const range = dateRangeOfRows(rows);
    if (!range) {
      setUploading(false);
      return;
    }
    setEventsLoading(true);
    try {
      const { data } = await apollo.query({
        query: GET_BROADCAST_EVENTS,
        variables: { startDate: range.start, endDate: range.end },
        fetchPolicy: 'network-only',
      });
      const events = data?.broadcastEvents || [];
      const next = buildResolutions(rows, events, roleColumns, usersByRole);
      setResolutions(next);
      setPhase('review');
    } catch (err: any) {
      message.error(
        `שליפת אירועים מהמערכת נכשלה: ${err?.message || 'שגיאה לא ידועה'}`,
      );
    } finally {
      setEventsLoading(false);
      setUploading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 2 — manual overrides
  // -------------------------------------------------------------------------

  const toggleInclude = (rowIndex: number, include: boolean) => {
    setResolutions((prev) =>
      prev.map((r) => (r.row.rowIndex === rowIndex ? { ...r, include } : r)),
    );
  };

  const overrideEvent = (rowIndex: number, eventId: string | null) => {
    setResolutions((prev) =>
      prev.map((r) => {
        if (r.row.rowIndex !== rowIndex) return r;
        const next = { ...r, selectedEventId: eventId };
        next.include = !!eventId;
        return next;
      }),
    );
  };

  // -------------------------------------------------------------------------
  // Step 3 — apply
  // -------------------------------------------------------------------------

  const cellsToCrewAssignments = (
    cells: Record<string, string[]>,
  ): CrewAssignment[] => {
    const out: CrewAssignment[] = [];
    for (const col of roleColumns) {
      const values = cells[col.key] || [];
      const users = usersByRole[col.key] || [];
      for (const v of values) {
        if (isCustomValue(v)) {
          out.push({
            role: col.hebrewRole,
            userId: null,
            userName: v.slice('__ext__:'.length),
          });
        } else {
          const u = users.find((x) => x.id === v);
          out.push({
            role: col.hebrewRole,
            userId: v,
            userName: u?.label || '',
          });
        }
      }
    }
    return out;
  };

  const handleApply = async () => {
    if (!canWrite) {
      message.error('אין לך הרשאת עריכה');
      return;
    }
    const targets = resolutions.filter((r) => r.include && r.selectedEventId);
    if (!targets.length) {
      message.warning('לא נבחרו שורות להחלה');
      return;
    }
    setPhase('applying');
    setApplyProgress(0);

    let ok = 0;
    let failed = 0;
    let i = 0;
    for (const r of targets) {
      i++;
      try {
        const crewAssignments = cellsToCrewAssignments(r.resolvedCells);
        await apollo.mutate({
          mutation: UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA,
          variables: {
            eventId: r.selectedEventId,
            department: 'broadcastArray',
            data: {
              broadcastArray: {
                crewAssignments,
                specialInstructions: r.row.notes || '',
                'מקוםשידור': r.row.location || '',
                setupTime: null,
                breakdownTime: null,
              },
              customData: {
                'מקוםשידור': r.row.location || '',
                importedFromExcel: true,
                importedAt: new Date().toISOString(),
                notApplicable: false,
              },
            },
          },
        });
        ok++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Apply failed for row', r.row.rowIndex, err);
        failed++;
      }
      setApplyProgress(Math.round((i / targets.length) * 100));
    }
    setApplyResult({ ok, failed });
    setPhase('done');
    if (ok > 0) onApplied();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const counts = useMemo(() => {
    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;
    let included = 0;
    for (const r of resolutions) {
      if (r.status === 'MATCHED') matched++;
      else if (r.status === 'AMBIGUOUS') ambiguous++;
      else unmatched++;
      if (r.include && r.selectedEventId) included++;
    }
    return { matched, ambiguous, unmatched, included };
  }, [resolutions]);

  return (
    <Modal
      open={open}
      onCancel={phase === 'applying' ? undefined : onClose}
      width={1100}
      title="ייבוא מערך מ-Excel"
      destroyOnHidden
      footer={renderFooter()}
    >
      <div dir="rtl" style={{ direction: 'rtl' }}>
        {phase === 'upload' && (
          <Spin spinning={uploading || eventsLoading} tip={uploading ? 'מעבד קובץ…' : 'מאתר אירועים תואמים…'}>
            <Dragger {...uploadProps} disabled={uploading}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">גרור לכאן את קובץ Excel של המערך</p>
              <p className="ant-upload-hint">
                המערכת תזהה אוטומטית את האירועים מתוך תכנון השידורים ותשייך לכל שורה
                את האירוע המתאים (לפי תאריך, שעה וערוץ). שמות שאינם במערכת יסומנו
                כ"איש צוות חיצוני".
              </p>
            </Dragger>
            {fileName && (
              <Paragraph style={{ marginTop: 8 }} type="secondary">
                קובץ נבחר: {fileName}
              </Paragraph>
            )}
          </Spin>
        )}

        {phase === 'review' && (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color="green">תואמים: {counts.matched}</Tag>
              <Tag color="gold">מספר התאמות: {counts.ambiguous}</Tag>
              <Tag color="red">לא נמצאו: {counts.unmatched}</Tag>
              <Tag>יוחלו: {counts.included}</Tag>
              {parseErrors.length > 0 && (
                <Tooltip title={parseErrors.join('\n')}>
                  <Tag color="volcano">שגיאות עיבוד: {parseErrors.length}</Tag>
                </Tooltip>
              )}
            </Space>

            {counts.unmatched > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 8 }}
                message="חלק מהשורות לא הותאמו לאירוע קיים בתכנון השידורים. ניתן לשייכן ידנית מתוך התפריט, או להשאיר אותן ללא יישום."
              />
            )}

            <div
              style={{
                maxHeight: 480,
                overflowY: 'auto',
                border: '1px solid #f0f0f0',
                borderRadius: 4,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={th}>החל</th>
                    <th style={th}>תאריך</th>
                    <th style={th}>שעה</th>
                    <th style={th}>ערוץ</th>
                    <th style={th}>שורה ב-Excel</th>
                    <th style={th}>אירוע ביעד</th>
                    <th style={th}>צוות שזוהה</th>
                    <th style={th}>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutions.map((r) => (
                    <ResolutionRow
                      key={r.row.rowIndex}
                      resolution={r}
                      roleColumns={roleColumns}
                      usersByRole={usersByRole}
                      onToggleInclude={toggleInclude}
                      onOverrideEvent={overrideEvent}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {phase === 'applying' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Progress percent={applyProgress} />
            <Paragraph style={{ marginTop: 12 }}>שומר שינויים על השרת…</Paragraph>
          </div>
        )}

        {phase === 'done' && applyResult && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Title level={4} style={{ marginBottom: 8 }}>
              סיום ייבוא
            </Title>
            <Space size="large">
              <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>
                נשמרו בהצלחה: {applyResult.ok}
              </Tag>
              {applyResult.failed > 0 && (
                <Tag color="red" style={{ fontSize: 14, padding: '4px 12px' }}>
                  נכשלו: {applyResult.failed}
                </Tag>
              )}
            </Space>
            <Paragraph style={{ marginTop: 12 }} type="secondary">
              ניתן לסגור את החלון. הטבלה הראשית תתעדכן אוטומטית.
            </Paragraph>
          </div>
        )}
      </div>
    </Modal>
  );

  function renderFooter() {
    if (phase === 'upload') {
      return (
        <Button onClick={onClose} disabled={uploading || eventsLoading}>
          סגור
        </Button>
      );
    }
    if (phase === 'review') {
      return (
        <Space>
          <Button onClick={onClose}>ביטול</Button>
          <Button
            type="primary"
            onClick={handleApply}
            disabled={!canWrite || counts.included === 0}
          >
            החל {counts.included > 0 && `(${counts.included})`}
          </Button>
        </Space>
      );
    }
    if (phase === 'applying') {
      return null;
    }
    return <Button type="primary" onClick={onClose}>סגור</Button>;
  }
}

// ---------------------------------------------------------------------------
// Single review row
// ---------------------------------------------------------------------------

const th: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  padding: '6px 4px',
  fontWeight: 600,
  textAlign: 'right',
  fontSize: 12,
};
const td: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  padding: '6px 4px',
  fontSize: 12,
  verticalAlign: 'top',
};

function ResolutionRow({
  resolution,
  roleColumns,
  usersByRole,
  onToggleInclude,
  onOverrideEvent,
}: {
  resolution: RowResolution;
  roleColumns: RoleColumnLite[];
  usersByRole: Record<string, Array<{ id: string; label: string }>>;
  onToggleInclude: (rowIndex: number, include: boolean) => void;
  onOverrideEvent: (rowIndex: number, eventId: string | null) => void;
}) {
  const { row, status, candidates, selectedEventId, resolvedCells, unresolvedNames, include } =
    resolution;

  const eventOptions = useMemo(() => {
    const out = candidates.map((c) => ({
      value: c.eventId,
      label: `${c.title} • ${dayjs(c.startISO).format('HH:mm')} • ${c.channel} (${Math.round(
        c.score * 100,
      )}%)`,
    }));
    return out;
  }, [candidates]);

  const statusMeta = STATUS_LABELS[status];

  return (
    <tr style={{ background: include ? 'inherit' : '#fafafa', opacity: include ? 1 : 0.6 }}>
      <td style={{ ...td, textAlign: 'center' }}>
        <Checkbox
          checked={include}
          disabled={!selectedEventId && !candidates.length}
          onChange={(e) => onToggleInclude(row.rowIndex, e.target.checked)}
        />
      </td>
      <td style={{ ...td, textAlign: 'center' }}>{dayjs(row.date).format('DD/MM')}</td>
      <td style={{ ...td, textAlign: 'center' }}>{row.startTime}</td>
      <td style={td}>{row.channel}</td>
      <td style={td}>
        <div style={{ fontWeight: 600 }}>{row.matchTitle || '—'}</div>
        <div style={{ fontSize: 11, color: '#888' }}>
          {row.league || ''}
          {row.location ? ` • ${row.location}` : ''}
        </div>
      </td>
      <td style={td}>
        {candidates.length ? (
          <Select
            size="small"
            style={{ width: '100%' }}
            value={selectedEventId || undefined}
            placeholder="בחר אירוע"
            options={eventOptions}
            onChange={(v) => onOverrideEvent(row.rowIndex, v ?? null)}
            allowClear
            showSearch
            optionFilterProp="label"
          />
        ) : (
          <Text type="secondary">אין מועמדים — דלג</Text>
        )}
      </td>
      <td style={td}>
        <Space size={[4, 4]} wrap>
          {roleColumns.map((col) => {
            const values = resolvedCells[col.key] || [];
            if (!values.length) return null;
            return (
              <Tooltip key={col.key} title={col.hebrewRole}>
                <span>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {col.hebrewRole}:
                  </Text>{' '}
                  {values.map((v) => {
                    if (v.startsWith('__ext__:')) {
                      const name = v.slice('__ext__:'.length);
                      return (
                        <Tag
                          key={v}
                          color="gold"
                          style={{ marginInlineEnd: 2 }}
                        >
                          {name} (חיצוני)
                        </Tag>
                      );
                    }
                    const u = (usersByRole[col.key] || []).find((x) => x.id === v);
                    return (
                      <Tag
                        key={v}
                        color="blue"
                        style={{ marginInlineEnd: 2 }}
                      >
                        {u?.label || v}
                      </Tag>
                    );
                  })}
                </span>
              </Tooltip>
            );
          })}
          {!Object.values(resolvedCells).some((arr) => arr.length) && (
            <Text type="secondary">אין צוות בשורה זו</Text>
          )}
        </Space>
        {unresolvedNames.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <Tooltip
              title={unresolvedNames.map((u) => `${u.name} (${u.roleKey})`).join(', ')}
            >
              <Tag color="orange">
                {unresolvedNames.length} שמות לא זוהו במערכת
              </Tag>
            </Tooltip>
          </div>
        )}
      </td>
      <td style={{ ...td, textAlign: 'center' }}>
        {status === 'MATCHED' && (
          <CheckCircleTwoTone twoToneColor="#52c41a" style={{ fontSize: 18 }} />
        )}
        {status === 'AMBIGUOUS' && (
          <ExclamationCircleTwoTone twoToneColor="#faad14" style={{ fontSize: 18 }} />
        )}
        {status === 'UNMATCHED' && (
          <CloseCircleTwoTone twoToneColor="#ff4d4f" style={{ fontSize: 18 }} />
        )}
        <div style={{ fontSize: 10 }}>
          <Tag color={statusMeta.color} style={{ marginInlineEnd: 0 }}>
            {statusMeta.label}
          </Tag>
        </div>
      </td>
    </tr>
  );
}
