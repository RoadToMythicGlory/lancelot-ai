'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  CHART_METRIC_LABELS,
  COLUMN_GROUPS,
  DEFAULT_TABLE_COLUMNS,
  ENABLED_ITEM_TYPES,
  ITEM_TYPE_HEBREW_LABELS,
  PANEL_TYPE_LABELS,
  PANEL_WIDTH_LABELS,
} from '../constants';
import { ColumnOrderEditor } from './ColumnOrderEditor';
import type {
  FlightBoard,
  FlightBoardChartMetric,
  FlightBoardPanel,
  FlightBoardPanelType,
  FlightBoardPanelWidth,
  FlightBoardSortDirection,
  FlightBoardVisibility,
} from '../types';

const { Text } = Typography;

interface Props {
  open: boolean;
  initial: FlightBoard | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description?: string;
    refreshIntervalSec: number;
    visibility: FlightBoardVisibility;
    isDefault: boolean;
    panels: Array<Omit<FlightBoardPanel, 'id'>>;
  }) => Promise<void>;
}

interface DraftPanel extends Omit<FlightBoardPanel, 'id'> {
  __id: string;
}

const PANEL_TYPE_OPTIONS: FlightBoardPanelType[] = [
  'TABLE',
  'BAR_CHART',
  'LINE_CHART',
  'PIE_CHART',
  'AREA_CHART',
  'KPI',
  'TIMELINE',
];

const PANEL_WIDTH_OPTIONS: FlightBoardPanelWidth[] = [
  'QUARTER',
  'THIRD',
  'HALF',
  'TWO_THIRDS',
  'FULL',
];

const SORT_DIRECTIONS: FlightBoardSortDirection[] = ['ASC', 'DESC'];

const CHART_METRICS: FlightBoardChartMetric[] = [
  'COUNT',
  'PEAK_VIEWERS',
  'AVG_VIEWERS',
  'TOTAL_REVENUE',
  'DURATION',
];

const CHART_GROUPS = [
  { value: 'type', label: 'סוג פריט' },
  { value: 'status', label: 'סטטוס' },
  { value: 'channel', label: 'ערוץ' },
  { value: 'raw.sport', label: 'ענף ספורט' },
  { value: 'raw.league', label: 'ליגה' },
  { value: 'raw.eventType', label: 'סוג אירוע' },
  { value: 'raw.priority', label: 'דחיפות' },
  { value: 'raw.mcr.preparationStatus', label: 'סטטוס הכנת MCR' },
];

function makeId() {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyPanel(order: number): DraftPanel {
  return {
    __id: makeId(),
    panelKey: '',
    title: 'פאנל חדש',
    type: 'TABLE',
    width: 'FULL',
    itemTypes: [],
    visibleColumns: [...DEFAULT_TABLE_COLUMNS],
    chartGroupBy: 'type',
    chartMetric: 'COUNT',
    sortField: 'date',
    sortDirection: 'ASC',
    rowLimit: null,
    hideSatellites: false,
    order,
  };
}

function panelsFromBoard(board: FlightBoard | null): DraftPanel[] {
  if (!board) return [emptyPanel(0)];
  return board.panels.map((p) => ({
    __id: p.id || makeId(),
    panelKey: p.panelKey,
    title: p.title,
    type: p.type,
    width: p.width,
    itemTypes: [...p.itemTypes],
    visibleColumns: [...p.visibleColumns],
    chartGroupBy: p.chartGroupBy ?? 'type',
    chartMetric: p.chartMetric ?? 'COUNT',
    sortField: p.sortField ?? 'date',
    sortDirection: p.sortDirection,
    rowLimit: p.rowLimit ?? null,
    hideSatellites: !!p.hideSatellites,
    order: p.order,
  }));
}

const ColumnGroupPicker: React.FC<{
  selected: string[];
  onChange: (next: string[]) => void;
}> = ({ selected, onChange }) => {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (key: string) => {
    if (selectedSet.has(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const selectAll = (keys: string[]) => {
    const next = new Set(selected);
    keys.forEach((k) => next.add(k));
    onChange(Array.from(next));
  };

  const clearAll = (keys: string[]) => {
    const remove = new Set(keys);
    onChange(selected.filter((k) => !remove.has(k)));
  };

  return (
    <Collapse
      size="small"
      bordered
      defaultActiveKey={['core']}
      items={COLUMN_GROUPS.map((group) => {
        const groupKeys = group.columns.map((c) => c.key);
        const groupSelected = groupKeys.filter((k) => selectedSet.has(k));
        return {
          key: group.key,
          label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{group.label}</span>
              <Tag color="blue" style={{ marginInlineStart: 6 }}>
                {groupSelected.length}/{groupKeys.length}
              </Tag>
            </span>
          ),
          extra: (
            <Space size={4}>
              <Button
                size="small"
                type="link"
                onClick={(e) => {
                  e.stopPropagation();
                  selectAll(groupKeys);
                }}
              >
                בחר הכל
              </Button>
              <Button
                size="small"
                type="link"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll(groupKeys);
                }}
              >
                נקה
              </Button>
            </Space>
          ),
          children: (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {group.description && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {group.description}
                </Text>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 4,
                }}
              >
                {group.columns.map((col) => (
                  <Checkbox
                    key={col.key}
                    checked={selectedSet.has(col.key)}
                    onChange={() => toggle(col.key)}
                  >
                    {col.label}
                  </Checkbox>
                ))}
              </div>
            </Space>
          ),
        };
      })}
    />
  );
};

const PanelEditor: React.FC<{
  panel: DraftPanel;
  index: number;
  onChange: (next: DraftPanel) => void;
  onRemove: () => void;
}> = ({ panel, index, onChange, onRemove }) => {
  const update = (patch: Partial<DraftPanel>) => onChange({ ...panel, ...patch });
  const isTable = panel.type === 'TABLE';
  const isChart = ['BAR_CHART', 'LINE_CHART', 'PIE_CHART', 'AREA_CHART'].includes(panel.type);

  // Flat list of all column keys for the sort-field selector. A key may be
  // exposed in more than one group (e.g. `channel` lives in both the core
  // and broadcast groups so the user finds it either way) — keep only the
  // first appearance so the dropdown doesn't show duplicates.
  const allColumnOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const group of COLUMN_GROUPS) {
      for (const col of group.columns) {
        if (col.key === 'type') continue;
        if (seen.has(col.key)) continue;
        seen.add(col.key);
        opts.push({ value: col.key, label: `${col.label} · ${group.label}` });
      }
    }
    return opts;
  }, []);

  return (
    <div className="flight-board-builder-panel-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <Text strong>
          פאנל #{index + 1} · {PANEL_TYPE_LABELS[panel.type]}
        </Text>
        <Space size={4}>
          <Tooltip
            title={
              panel.hideSatellites
                ? 'הצג שוב שורות עם מקום שידור "יעלה לווין בלבד"'
                : 'הסתר מהפאנל שורות עם מקום שידור "יעלה לווין בלבד"'
            }
          >
            <Button
              size="small"
              type={panel.hideSatellites ? 'primary' : 'default'}
              icon={panel.hideSatellites ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => update({ hideSatellites: !panel.hideSatellites })}
            >
              {panel.hideSatellites ? 'לוויינים מוסתרים' : 'הסתר לוויינים'}
            </Button>
          </Tooltip>
          <Button danger size="small" type="text" icon={<DeleteOutlined />} onClick={onRemove}>
            הסר
          </Button>
        </Space>
      </div>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div className="flight-board-field">
          <label>כותרת הפאנל</label>
          <Input
            value={panel.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="לדוגמה: שידורים חיים היום"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="flight-board-field">
            <label>סוג תצוגה</label>
            <Select
              value={panel.type}
              onChange={(v) => update({ type: v })}
              options={PANEL_TYPE_OPTIONS.map((t) => ({ value: t, label: PANEL_TYPE_LABELS[t] }))}
              style={{ width: '100%' }}
            />
          </div>
          <div className="flight-board-field">
            <label>רוחב פאנל</label>
            <Select
              value={panel.width}
              onChange={(v) => update({ width: v })}
              options={PANEL_WIDTH_OPTIONS.map((w) => ({ value: w, label: PANEL_WIDTH_LABELS[w] }))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <div className="flight-board-field">
          <label>סוגי פריטים</label>
          <Select
            mode="multiple"
            value={panel.itemTypes}
            onChange={(v) => update({ itemTypes: v })}
            options={ENABLED_ITEM_TYPES.map((t) => ({
              value: t,
              label: ITEM_TYPE_HEBREW_LABELS[t],
            }))}
            placeholder="השאר ריק כדי לכלול את כל הסוגים"
            style={{ width: '100%' }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            אילו פריטים יופיעו בפאנל זה
          </Text>
        </div>
        {isTable && (
          <>
            <div className="flight-board-field">
              <label>עמודות גלויות בטבלה</label>
              <Text type="secondary" style={{ fontSize: 11 }}>
                בחר מכל קבוצה את העמודות שתרצה לראות. אפשר לערבב חופשי בין שדות שידור,
                MCR, מערך שידור, צוות וציוד
              </Text>
              <ColumnGroupPicker
                selected={panel.visibleColumns}
                onChange={(cols) => update({ visibleColumns: cols })}
              />
            </div>
            <div className="flight-board-field">
              <label>סדר העמודות</label>
              <ColumnOrderEditor
                selected={panel.visibleColumns}
                onChange={(cols) => update({ visibleColumns: cols })}
              />
            </div>
          </>
        )}
        {isChart && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="flight-board-field">
              <label>קיבוץ לפי</label>
              <Select
                value={panel.chartGroupBy || 'type'}
                onChange={(v) => update({ chartGroupBy: v })}
                options={CHART_GROUPS}
                style={{ width: '100%' }}
              />
            </div>
            <div className="flight-board-field">
              <label>מדד</label>
              <Select
                value={panel.chartMetric || 'COUNT'}
                onChange={(v) => update({ chartMetric: v })}
                options={CHART_METRICS.map((m) => ({ value: m, label: CHART_METRIC_LABELS[m] }))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div className="flight-board-field">
            <label>מיון לפי</label>
            <Select
              value={panel.sortField || 'date'}
              onChange={(v) => update({ sortField: v })}
              options={allColumnOptions}
              placeholder="בחר עמודה למיון"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            />
          </div>
          <div className="flight-board-field">
            <label>כיוון מיון</label>
            <Select
              value={panel.sortDirection}
              onChange={(v) => update({ sortDirection: v })}
              options={SORT_DIRECTIONS.map((d) => ({
                value: d,
                label: d === 'ASC' ? 'עולה' : 'יורד',
              }))}
              style={{ width: '100%' }}
            />
          </div>
          <div className="flight-board-field">
            <label>מקס׳ שורות</label>
            <InputNumber
              min={1}
              value={panel.rowLimit ?? undefined}
              onChange={(v) => update({ rowLimit: typeof v === 'number' ? v : null })}
              placeholder="ללא הגבלה"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Space>
    </div>
  );
};

export const BoardBuilder: React.FC<Props> = ({ open, initial, saving, onClose, onSubmit }) => {
  const { message } = App.useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(60);
  const [visibility, setVisibility] = useState<FlightBoardVisibility>('ALL');
  const [isDefault, setIsDefault] = useState(false);
  const [panels, setPanels] = useState<DraftPanel[]>([emptyPanel(0)]);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '');
      setDescription(initial?.description || '');
      setRefreshIntervalSec(initial?.refreshIntervalSec || 60);
      setVisibility(initial?.visibility || 'ALL');
      setIsDefault(initial?.isDefault || false);
      setPanels(panelsFromBoard(initial));
    }
  }, [open, initial]);

  const handleAddPanel = () => {
    setPanels((prev) => [...prev, emptyPanel(prev.length)]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      message.error('יש להזין כותרת לוח');
      return;
    }
    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      refreshIntervalSec,
      visibility,
      isDefault,
      panels: panels.map((p, idx) => ({
        panelKey: p.panelKey || '',
        title: p.title,
        type: p.type,
        width: p.width,
        itemTypes: p.itemTypes,
        visibleColumns: p.visibleColumns,
        chartGroupBy: p.chartGroupBy ?? null,
        chartMetric: p.chartMetric ?? null,
        sortField: p.sortField ?? null,
        sortDirection: p.sortDirection,
        rowLimit: p.rowLimit ?? null,
        hideSatellites: !!p.hideSatellites,
        order: idx,
      })),
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת לוח' : 'יצירת לוח חדש'}
      width={Math.min(820, typeof window !== 'undefined' ? window.innerWidth - 24 : 820)}
      placement="left"
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={saving}>
            ביטול
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={saving}>
            שמור
          </Button>
        </div>
      }
    >
      <div className="flight-board-builder-form">
        <div className="flight-board-builder-section">
          <h4>פרטי לוח</h4>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div className="flight-board-field">
              <label>כותרת לוח</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="לדוגמה: שידורים חיים – חדר בקרה ראשי"
              />
            </div>
            <div className="flight-board-field">
              <label>תיאור (לא חובה)</label>
              <Input.TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="הסבר קצר על מה הלוח מציג ולמי הוא מיועד"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="flight-board-field">
                <label>מרווח רענון אוטומטי</label>
                <InputNumber
                  value={refreshIntervalSec}
                  min={10}
                  max={3600}
                  onChange={(v) => typeof v === 'number' && setRefreshIntervalSec(v)}
                  style={{ width: '100%' }}
                  addonAfter="שניות"
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  כל כמה שניות הלוח יתרענן אוטומטית
                </Text>
              </div>
              <div className="flight-board-field">
                <label>נראות הלוח</label>
                <Select
                  value={visibility}
                  onChange={(v) => setVisibility(v)}
                  options={[
                    { value: 'ALL', label: 'גלוי לכולם' },
                    { value: 'ADMINS_ONLY', label: 'מנהלים בלבד' },
                  ]}
                  style={{ width: '100%' }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  מי יוכל לראות את הלוח הזה
                </Text>
              </div>
            </div>
            <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}>
              הגדר כלוח ברירת מחדל (ייפתח אוטומטית בכניסה לעמוד)
            </Checkbox>
          </Space>
        </div>

        <div className="flight-board-builder-section">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h4 style={{ margin: 0 }}>פאנלים</h4>
            <Button icon={<PlusOutlined />} onClick={handleAddPanel}>
              הוסף פאנל
            </Button>
          </div>
          {panels.map((panel, index) => (
            <PanelEditor
              key={panel.__id}
              panel={panel}
              index={index}
              onChange={(next) =>
                setPanels((prev) => prev.map((p) => (p.__id === panel.__id ? next : p)))
              }
              onRemove={() =>
                setPanels((prev) => prev.filter((p) => p.__id !== panel.__id))
              }
            />
          ))}
        </div>
      </div>
    </Drawer>
  );
};
