'use client';

import React, { useMemo, useState } from 'react';
import { useMutation } from '@apollo/client';
import {
  App,
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Space,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  ADD_FLIGHT_BOARD_MANUAL_ROW,
  CLEAR_FLIGHT_BOARD_ITEM_OVERRIDE,
  DELETE_FLIGHT_BOARD_MANUAL_ROW,
  GET_FLIGHT_BOARD_DATA,
  HIDE_FLIGHT_BOARD_ITEM,
  SET_FLIGHT_BOARD_ITEM_OVERRIDE,
  UNHIDE_FLIGHT_BOARD_ITEM,
  UPDATE_FLIGHT_BOARD_MANUAL_ROW,
} from '@/graphql/flightBoardQueries';
import {
  ALL_COLUMNS_BY_KEY,
  DEFAULT_TABLE_COLUMNS,
  ITEM_TYPE_COLORS,
  ITEM_TYPE_HEBREW_LABELS,
  ITEM_TYPE_SHORT_LABELS,
} from '../constants';
import { stripHtml } from '../utils/formatters';
import type {
  FlightBoardItem,
  FlightBoardManualRow,
  FlightBoardOverlay,
  FlightBoardPanel,
} from '../types';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  boardId: string;
  panel: FlightBoardPanel | null;
  items: FlightBoardItem[];
  overlay: FlightBoardOverlay | null | undefined;
  range: { preset: string; start?: string; end?: string };
}

// Columns the editor exposes. Falls back to the default set when a panel
// has no visibleColumns explicitly configured.
function panelEditableColumns(panel: FlightBoardPanel): string[] {
  const source =
    panel.visibleColumns && panel.visibleColumns.length > 0
      ? panel.visibleColumns
      : DEFAULT_TABLE_COLUMNS;
  // We don't allow editing the synthetic `type` pill column.
  return source.filter((k) => k !== 'type');
}

function columnLabel(key: string): string {
  const def = ALL_COLUMNS_BY_KEY[key];
  if (def) return def.label;
  if (key.startsWith('raw.')) return key.slice(4);
  return key;
}

function columnKind(key: string): 'date' | 'time' | 'boolean' | 'longText' | 'string' {
  if (key === 'date' || ALL_COLUMNS_BY_KEY[key]?.dateOnly) return 'date';
  if (
    key === 'startTime' ||
    key === 'endTime' ||
    ALL_COLUMNS_BY_KEY[key]?.timeOnly
  )
    return 'time';
  if (ALL_COLUMNS_BY_KEY[key]?.boolean) return 'boolean';
  if (
    key === 'title' ||
    key === 'description' ||
    key === 'notes' ||
    ALL_COLUMNS_BY_KEY[key]?.longText
  )
    return 'longText';
  return 'string';
}

// Read the current value of a column from an item, falling back through the
// `raw` payload for nested keys (e.g. `raw.mcr.start`).
function readItemColumn(item: FlightBoardItem, key: string): any {
  if (key === 'date') return item.date || null;
  if (key === 'startTime') return item.startTime || null;
  if (key === 'endTime') return item.endTime || null;
  if (key === 'title') return item.title || '';
  if (key === 'description') return item.description || '';
  if (key === 'notes') return item.notes || '';
  if (key === 'channel') return item.channel || '';
  if (key === 'status') return item.status || '';

  const path = key.startsWith('raw.') ? key.slice(4).split('.') : [key];
  let cur: any = item.raw || {};
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

// Returns a string suitable for `<Input value=...>` for cell editing.
function valueToString(val: any, kind: ReturnType<typeof columnKind>): string {
  if (val == null) return '';
  if (kind === 'longText' || kind === 'string') {
    if (typeof val === 'string') return stripHtml(val);
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '';
      }
    }
    return String(val);
  }
  return String(val);
}

const RowEditor: React.FC<{
  item: FlightBoardItem;
  panel: FlightBoardPanel;
  boardId: string;
  refetchVars: any;
  pendingDirty: Record<string, Record<string, any>>;
  onCellChange: (itemKey: string, columnKey: string, value: any) => void;
  onCellClear: (itemKey: string, columnKey: string) => void;
  onItemSaved: (itemKey: string) => void;
}> = ({ item, panel, boardId, refetchVars, pendingDirty, onCellChange, onCellClear, onItemSaved }) => {
  const { message } = App.useApp();
  const columns = useMemo(() => panelEditableColumns(panel), [panel]);
  const dirty = pendingDirty[item.itemKey] || {};
  const hasDirty = Object.keys(dirty).length > 0;

  const refetchAfter = {
    refetchQueries: [{ query: GET_FLIGHT_BOARD_DATA, variables: refetchVars }],
    awaitRefetchQueries: true,
  };

  const [setOverride, { loading: savingOverride }] = useMutation(
    SET_FLIGHT_BOARD_ITEM_OVERRIDE,
    refetchAfter,
  );
  const [clearOverride, { loading: clearingOverride }] = useMutation(
    CLEAR_FLIGHT_BOARD_ITEM_OVERRIDE,
    refetchAfter,
  );
  const [updateManual, { loading: savingManual }] = useMutation(
    UPDATE_FLIGHT_BOARD_MANUAL_ROW,
    refetchAfter,
  );
  const [deleteManual, { loading: deletingManual }] = useMutation(
    DELETE_FLIGHT_BOARD_MANUAL_ROW,
    refetchAfter,
  );
  const [hideItem, { loading: hidingItem }] = useMutation(HIDE_FLIGHT_BOARD_ITEM, refetchAfter);

  const saving = savingOverride || savingManual;

  const handleSave = async () => {
    if (!hasDirty) return;
    try {
      if (item.isManual) {
        const rowId = item.id.startsWith('manual:') ? item.id.slice('manual:'.length) : item.id;
        await updateManual({ variables: { boardId, rowId, values: dirty } });
        message.success('השורה עודכנה');
      } else {
        await setOverride({ variables: { boardId, itemKey: item.itemKey, values: dirty } });
        message.success('הערכים נשמרו ללוח זה');
      }
      // Clear the local dirty buffer for this row now that the server has
      // confirmed the write — otherwise the "·" dirty markers remain and
      // the editor reads from the stale local copy instead of the
      // refetched server value, which is what users have been seeing as
      // "the edit didn't save".
      onItemSaved(item.itemKey);
    } catch (err: any) {
      message.error(err?.message || 'שמירה נכשלה');
    }
  };

  const handleResetOverride = async () => {
    try {
      await clearOverride({ variables: { boardId, itemKey: item.itemKey } });
      message.success('האוברייד אופס');
    } catch (err: any) {
      message.error(err?.message || 'איפוס נכשל');
    }
  };

  const handleHide = async () => {
    try {
      await hideItem({ variables: { boardId, itemKey: item.itemKey } });
      message.success('השורה הוסתרה מהלוח');
    } catch (err: any) {
      message.error(err?.message || 'הסתרה נכשלה');
    }
  };

  const handleDeleteManual = async () => {
    try {
      const rowId = item.id.startsWith('manual:') ? item.id.slice('manual:'.length) : item.id;
      await deleteManual({ variables: { boardId, rowId } });
      message.success('השורה נמחקה');
    } catch (err: any) {
      message.error(err?.message || 'מחיקה נכשלה');
    }
  };

  return (
    <div className="flight-board-edit-row">
      <div className="flight-board-edit-row-header">
        <Tag color={item.isManual ? 'gold' : ITEM_TYPE_COLORS[item.type]}>
          {item.isManual ? 'ידני' : ITEM_TYPE_SHORT_LABELS[item.type] || item.type}
        </Tag>
        <span className="flight-board-edit-row-title">
          {readItemColumn(item, 'title') || '—'}
        </span>
        {item.hasOverride && !item.isManual && (
          <Tooltip title="לשורה זו יש אוברייד פעיל. לחץ כדי לאפס">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              loading={clearingOverride}
              onClick={handleResetOverride}
            >
              אפס אוברייד
            </Button>
          </Tooltip>
        )}
        <div style={{ flex: 1 }} />
        {hasDirty && (
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            שמור שינויים
          </Button>
        )}
        {item.isManual ? (
          <Popconfirm
            title="למחוק את השורה?"
            okText="מחק"
            cancelText="ביטול"
            okButtonProps={{ danger: true }}
            onConfirm={handleDeleteManual}
          >
            <Button danger size="small" icon={<DeleteOutlined />} loading={deletingManual}>
              מחק
            </Button>
          </Popconfirm>
        ) : (
          <Tooltip title="הסתר את השורה מהלוח (לא משפיע על המקור)">
            <Button
              size="small"
              icon={<EyeInvisibleOutlined />}
              loading={hidingItem}
              onClick={handleHide}
            >
              הסתר
            </Button>
          </Tooltip>
        )}
      </div>

      <div className="flight-board-edit-row-grid">
        {columns.map((key) => {
          const kind = columnKind(key);
          const dirtyVal = key in dirty ? dirty[key] : undefined;
          const baseVal = readItemColumn(item, key);
          const value = key in dirty ? dirtyVal : baseVal;
          const isDirty = key in dirty;

          return (
            <div className="flight-board-edit-cell" key={key}>
              <label className="flight-board-edit-cell-label">
                {columnLabel(key)}
                {isDirty && <span className="flight-board-edit-cell-dirty">·</span>}
              </label>
              {kind === 'date' && (
                <DatePicker
                  value={value ? dayjs(value) : null}
                  onChange={(d: Dayjs | null) =>
                    onCellChange(item.itemKey, key, d ? d.toISOString() : null)
                  }
                  style={{ width: '100%' }}
                  format="DD/MM/YYYY"
                  allowClear
                />
              )}
              {kind === 'time' && (
                <TimePicker
                  value={value ? dayjs(value) : null}
                  onChange={(d: Dayjs | null) =>
                    onCellChange(item.itemKey, key, d ? d.toISOString() : null)
                  }
                  style={{ width: '100%' }}
                  format="HH:mm"
                  allowClear
                />
              )}
              {kind === 'boolean' && (
                <Checkbox
                  checked={!!value}
                  onChange={(e) => onCellChange(item.itemKey, key, e.target.checked)}
                >
                  כן / לא
                </Checkbox>
              )}
              {kind === 'longText' && (
                <Input.TextArea
                  rows={2}
                  value={valueToString(value, kind)}
                  onChange={(e) => onCellChange(item.itemKey, key, e.target.value)}
                />
              )}
              {kind === 'string' && (
                <Input
                  value={valueToString(value, kind)}
                  onChange={(e) => onCellChange(item.itemKey, key, e.target.value)}
                  allowClear
                />
              )}
              {!item.isManual && isDirty && (
                <Button
                  size="small"
                  type="link"
                  onClick={() => onCellClear(item.itemKey, key)}
                  style={{ padding: 0, height: 'auto', marginTop: 2 }}
                >
                  השלך שינוי
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const EditPanelDrawer: React.FC<Props> = ({
  open,
  onClose,
  boardId,
  panel,
  items,
  overlay,
  range,
}) => {
  const { message } = App.useApp();

  // Pending unsaved cell changes keyed by itemKey + columnKey. Save buttons on
  // each row commit them via the appropriate mutation.
  const [pendingDirty, setPendingDirty] = useState<Record<string, Record<string, any>>>({});

  const refetchVars = useMemo(
    () => ({
      boardId,
      range: { preset: range.preset, start: range.start, end: range.end },
    }),
    [boardId, range.preset, range.start, range.end],
  );

  const [addManual, { loading: addingManual }] = useMutation(ADD_FLIGHT_BOARD_MANUAL_ROW, {
    refetchQueries: [{ query: GET_FLIGHT_BOARD_DATA, variables: refetchVars }],
    awaitRefetchQueries: true,
  });
  const [unhideItem, { loading: unhidingItem }] = useMutation(UNHIDE_FLIGHT_BOARD_ITEM, {
    refetchQueries: [{ query: GET_FLIGHT_BOARD_DATA, variables: refetchVars }],
    awaitRefetchQueries: true,
  });

  const handleCellChange = (itemKey: string, columnKey: string, value: any) => {
    setPendingDirty((prev) => ({
      ...prev,
      [itemKey]: { ...(prev[itemKey] || {}), [columnKey]: value },
    }));
  };

  const handleCellClear = (itemKey: string, columnKey: string) => {
    setPendingDirty((prev) => {
      const cur = { ...(prev[itemKey] || {}) };
      delete cur[columnKey];
      const next = { ...prev };
      if (Object.keys(cur).length === 0) delete next[itemKey];
      else next[itemKey] = cur;
      return next;
    });
  };

  const handleItemSaved = (itemKey: string) => {
    setPendingDirty((prev) => {
      if (!prev[itemKey]) return prev;
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
  };

  const handleAddRow = async () => {
    if (!panel) return;
    try {
      await addManual({
        variables: {
          boardId,
          input: { panelKey: panel.panelKey, values: {} },
        },
      });
      message.success('שורה חדשה נוספה. ערוך אותה למטה');
    } catch (err: any) {
      message.error(err?.message || 'הוספת שורה נכשלה');
    }
  };

  const handleUnhide = async (itemKey: string) => {
    try {
      await unhideItem({ variables: { boardId, itemKey } });
      message.success('השורה שוחזרה');
    } catch (err: any) {
      message.error(err?.message || 'שחזור נכשל');
    }
  };

  const visibleItems = useMemo(() => {
    if (!panel) return [] as FlightBoardItem[];
    return items.filter((it) => {
      // Mirror PanelContainer's "הסתר לוויינים" panel toggle — the editor
      // must reflect exactly the row set the live panel renders, otherwise
      // admins see satellite-only rows here that aren't visible on the
      // board itself.
      if (panel.hideSatellites) {
        const location = it.raw?.broadcastArray?.broadcastLocation;
        if (typeof location === 'string' && location.trim() === 'יעלה לווין בלבד') {
          return false;
        }
      }
      // Manual rows are scoped per-panel (when panelKey is set).
      if (it.isManual) {
        return !it.panelKey || it.panelKey === panel.panelKey;
      }
      // Source rows respect the panel's itemTypes filter.
      if (panel.itemTypes && panel.itemTypes.length > 0) {
        return panel.itemTypes.includes(it.type);
      }
      return true;
    });
  }, [items, panel]);

  // Hidden rows are not in `items` (resolver already filtered them) so we
  // only have their stored keys. Show them as a list with "unhide" actions.
  const hiddenKeys = overlay?.hiddenItemKeys || [];

  if (!panel) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <Space size={8}>
          <span>עריכת שורות:</span>
          <strong>{panel.title}</strong>
        </Space>
      }
      width={Math.min(960, typeof window !== 'undefined' ? window.innerWidth - 80 : 960)}
      destroyOnClose
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={addingManual}
          onClick={handleAddRow}
        >
          הוסף שורה ידנית
        </Button>
      }
    >
      <div className="flight-board-edit-help">
        <Text type="secondary" style={{ fontSize: 12 }}>
          השינויים נשמרים על הלוח הזה בלבד ולא משפיעים על אירועי המקור.
          ערוך תאים, הסתר שורות מהלוח או הוסף שורות ידניות חדשות. לכל שינוי בתא
          לחץ "שמור שינויים" כדי לשלוח את הערכים לשרת.
        </Text>
      </div>

      {visibleItems.length === 0 && hiddenKeys.length === 0 && (
        <Empty description="אין שורות בטווח התאריכים שנבחר" />
      )}

      {visibleItems.length > 0 && (
        <div className="flight-board-edit-row-list">
          {visibleItems.map((item) => (
            <RowEditor
              key={item.itemKey}
              item={item}
              panel={panel}
              boardId={boardId}
              refetchVars={refetchVars}
              pendingDirty={pendingDirty}
              onCellChange={handleCellChange}
              onCellClear={handleCellClear}
              onItemSaved={handleItemSaved}
            />
          ))}
        </div>
      )}

      {hiddenKeys.length > 0 && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'hidden',
              label: (
                <Space>
                  <EyeInvisibleOutlined />
                  <span>שורות מוסתרות בלוח זה</span>
                  <Tag>{hiddenKeys.length}</Tag>
                </Space>
              ),
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {hiddenKeys.map((key) => {
                    const [t, id] = key.split(':');
                    const typeLabel =
                      ITEM_TYPE_HEBREW_LABELS[t as keyof typeof ITEM_TYPE_HEBREW_LABELS] || t;
                    return (
                      <div key={key} className="flight-board-edit-hidden-row">
                        <Tag color="default">{typeLabel}</Tag>
                        <code style={{ fontSize: 11, color: '#64748b' }}>{id}</code>
                        <div style={{ flex: 1 }} />
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          loading={unhidingItem}
                          onClick={() => handleUnhide(key)}
                        >
                          שחזר
                        </Button>
                      </div>
                    );
                  })}
                </Space>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
};
