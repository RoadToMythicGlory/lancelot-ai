import { Schema, model, Document, Types } from 'mongoose';

/**
 * Flight Board configuration model.
 *
 * A Flight Board is a saved live-operations dashboard. Each board owns a
 * grid of panels (table / chart / kpi / timeline) plus board-level
 * preferences (refresh interval, visibility, default flag).
 *
 * The model only persists configuration. Operational item data is fetched
 * separately by the `flightBoardData` resolver, which aggregates rows from
 * existing entities (broadcast events, MCR events, etc.).
 */

export type FlightBoardItemType =
  | 'BROADCAST'
  | 'STREAM'
  | 'MCR'
  | 'PODCAST'
  | 'POST'
  | 'PROJECT'
  | 'EXTERNAL'
  | 'MANUAL'
  | 'ACTIVITY';

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

export interface IFlightBoardPanel {
  _id?: Types.ObjectId | string;
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

/**
 * Board-local edit overlay.
 *
 * The Flight Board is a read-only view onto operational data (broadcast
 * events, MCR events, posts, ...). To let admins curate a board without
 * mutating those source entities we layer an overlay on top:
 *
 *  - `hiddenItemKeys` — list of source keys (`${type}:${id}`) hidden on this
 *    board. Hidden rows still exist in the source, they just don't render.
 *  - `itemOverrides` — per-row column overrides: `{ "BROADCAST:abc": { title:
 *    "manual title", channel: "ערוץ 11" } }`. Applied on top of source data
 *    when the resolver returns rows.
 *  - `manualRows` — board-only rows. Optional `panelKey` scopes the row to a
 *    single TABLE panel (so admins can add notes per panel); a null/empty
 *    `panelKey` makes it visible across all TABLE panels.
 */
export interface IFlightBoardManualRow {
  rowId: string;
  panelKey?: string | null;
  values: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFlightBoardItemOverride {
  itemKey: string;
  values: Record<string, any>;
  updatedAt?: Date;
}

export interface IFlightBoardOverlay {
  hiddenItemKeys: string[];
  manualRows: IFlightBoardManualRow[];
  itemOverrides: IFlightBoardItemOverride[];
}

export interface IFlightBoard extends Document {
  title: string;
  description?: string;
  refreshIntervalSec: number;
  visibility: FlightBoardVisibility;
  isDefault: boolean;
  panels: IFlightBoardPanel[];
  overlay: IFlightBoardOverlay;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const flightBoardPanelSchema = new Schema<IFlightBoardPanel>(
  {
    panelKey: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ['TABLE', 'BAR_CHART', 'LINE_CHART', 'PIE_CHART', 'AREA_CHART', 'KPI', 'TIMELINE'],
      default: 'TABLE',
    },
    width: {
      type: String,
      required: true,
      enum: ['QUARTER', 'THIRD', 'HALF', 'TWO_THIRDS', 'FULL'],
      default: 'FULL',
    },
    itemTypes: [
      {
        type: String,
        enum: [
          'BROADCAST',
          'STREAM',
          'MCR',
          'PODCAST',
          'POST',
          'PROJECT',
          'EXTERNAL',
          'MANUAL',
          'ACTIVITY',
        ],
      },
    ],
    visibleColumns: { type: [String], default: [] },
    chartGroupBy: { type: String, default: null },
    chartMetric: {
      type: String,
      enum: ['COUNT', 'PEAK_VIEWERS', 'AVG_VIEWERS', 'TOTAL_REVENUE', 'DURATION', null],
      default: 'COUNT',
    },
    sortField: { type: String, default: null },
    sortDirection: {
      type: String,
      enum: ['ASC', 'DESC'],
      default: 'ASC',
    },
    rowLimit: { type: Number, default: null },
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

const flightBoardManualRowSchema = new Schema<IFlightBoardManualRow>(
  {
    rowId: { type: String, required: true },
    panelKey: { type: String, default: null },
    values: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const flightBoardItemOverrideSchema = new Schema<IFlightBoardItemOverride>(
  {
    itemKey: { type: String, required: true },
    values: { type: Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const flightBoardOverlaySchema = new Schema<IFlightBoardOverlay>(
  {
    hiddenItemKeys: { type: [String], default: [] },
    manualRows: { type: [flightBoardManualRowSchema], default: [] },
    itemOverrides: { type: [flightBoardItemOverrideSchema], default: [] },
  },
  { _id: false },
);

const flightBoardSchema = new Schema<IFlightBoard>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    refreshIntervalSec: { type: Number, default: 60, min: 10, max: 3600 },
    visibility: {
      type: String,
      enum: ['ALL', 'ADMINS_ONLY'],
      default: 'ALL',
    },
    isDefault: { type: Boolean, default: false },
    panels: { type: [flightBoardPanelSchema], default: [] },
    overlay: {
      type: flightBoardOverlaySchema,
      default: () => ({ hiddenItemKeys: [], manualRows: [], itemOverrides: [] }),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

flightBoardSchema.index({ isDefault: 1 });
flightBoardSchema.index({ visibility: 1 });
flightBoardSchema.index({ createdBy: 1, createdAt: -1 });
flightBoardSchema.index({ title: 1 });

const FlightBoard = model<IFlightBoard>('FlightBoard', flightBoardSchema);

export default FlightBoard;
