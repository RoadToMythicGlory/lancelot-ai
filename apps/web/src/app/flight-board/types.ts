export type FlightBoardItemType =
  | 'BROADCAST'
  | 'STREAM'
  | 'MCR'
  | 'PODCAST'
  | 'POST'
  | 'PROJECT'
  | 'EXTERNAL'
  | 'MANUAL';

export type FlightBoardPanelType =
  | 'TABLE'
  | 'BAR_CHART'
  | 'LINE_CHART'
  | 'PIE_CHART'
  | 'AREA_CHART'
  | 'KPI'
  | 'TIMELINE';

export type FlightBoardPanelWidth =
  | 'QUARTER'
  | 'THIRD'
  | 'HALF'
  | 'TWO_THIRDS'
  | 'FULL';

export type FlightBoardSortDirection = 'ASC' | 'DESC';

export type FlightBoardChartMetric =
  | 'COUNT'
  | 'PEAK_VIEWERS'
  | 'AVG_VIEWERS'
  | 'TOTAL_REVENUE'
  | 'DURATION';

export type FlightBoardVisibility = 'ALL' | 'ADMINS_ONLY';

export type FlightBoardDateRangePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'THIS_MONTH'
  | 'ALL'
  | 'CUSTOM';

export interface FlightBoardPanel {
  id: string;
  panelKey: string;
  title: string;
  type: FlightBoardPanelType;
  width: FlightBoardPanelWidth;
  itemTypes: FlightBoardItemType[];
  visibleColumns: string[];
  chartGroupBy?: string | null;
  chartMetric?: FlightBoardChartMetric | null;
  sortField?: string | null;
  sortDirection: FlightBoardSortDirection;
  rowLimit?: number | null;
  order: number;
}

export interface FlightBoard {
  id: string;
  title: string;
  description?: string | null;
  refreshIntervalSec: number;
  visibility: FlightBoardVisibility;
  isDefault: boolean;
  panels: FlightBoardPanel[];
  createdBy?: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlightBoardItem {
  id: string;
  type: FlightBoardItemType;
  title: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  channel?: string | null;
  status?: string | null;
  description?: string | null;
  notes?: string | null;
  raw?: Record<string, any> | null;
  itemKey: string;
  isManual: boolean;
  panelKey?: string | null;
  hasOverride: boolean;
}

export interface FlightBoardManualRow {
  rowId: string;
  panelKey?: string | null;
  values: Record<string, any>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FlightBoardItemOverride {
  itemKey: string;
  values: Record<string, any>;
  updatedAt?: string | null;
}

export interface FlightBoardOverlay {
  hiddenItemKeys: string[];
  manualRows: FlightBoardManualRow[];
  itemOverrides: FlightBoardItemOverride[];
}

export interface FlightBoardData {
  boardId: string;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  rangePreset: FlightBoardDateRangePreset;
  generatedAt: string;
  items: FlightBoardItem[];
  overlay: FlightBoardOverlay;
}

export interface FlightBoardRange {
  preset: FlightBoardDateRangePreset;
  start?: string;
  end?: string;
}
