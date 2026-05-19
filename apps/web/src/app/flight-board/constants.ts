import type {
  FlightBoardItemType,
  FlightBoardPanelType,
  FlightBoardPanelWidth,
  FlightBoardChartMetric,
  FlightBoardDateRangePreset,
} from './types';

// Item types currently surfaced in the panel builder. STREAM, PODCAST and
// PROJECT remain in the schema enum for forward compatibility but are not
// shown until those modules are operational. EXTERNAL is no longer a row
// type — external-broadcast metadata hydrates onto the broadcast row and is
// exposed through the `external.*` column group instead.
export const ENABLED_ITEM_TYPES: FlightBoardItemType[] = [
  'BROADCAST',
  'MCR',
  'POST',
  'ACTIVITY',
];

export const DEFERRED_ITEM_TYPES: FlightBoardItemType[] = [
  'STREAM',
  'PODCAST',
  'PROJECT',
  'EXTERNAL',
];

export const ITEM_TYPE_HEBREW_LABELS: Record<FlightBoardItemType, string> = {
  BROADCAST: 'אירועים (שידור)',
  STREAM: 'אירועי סטרימינג',
  MCR: 'MCR בלבד',
  PODCAST: 'פרקי פודקאסט',
  POST: 'פוסטים',
  PROJECT: 'פרויקטי אירוע',
  EXTERNAL: 'שידורי חוץ',
  MANUAL: 'שורה ידנית',
  ACTIVITY: 'שורות לוח MCR',
};

// Compact 4-letter labels for the optional "type" column. Most boards no
// longer need this column at all — broadcast events that also carry MCR or
// external metadata appear as one unified row.
export const ITEM_TYPE_SHORT_LABELS: Record<FlightBoardItemType, string> = {
  BROADCAST: 'אירוע',
  STREAM: 'STRM',
  MCR: 'MCR',
  PODCAST: 'POD',
  POST: 'פוסט',
  PROJECT: 'PROJ',
  EXTERNAL: 'EXT',
  MANUAL: 'ידני',
  ACTIVITY: 'פעילות',
};

export const ITEM_TYPE_COLORS: Record<FlightBoardItemType, string> = {
  BROADCAST: '#22c55e',
  STREAM: '#a855f7',
  MCR: '#0ea5e9',
  PODCAST: '#f97316',
  POST: '#facc15',
  PROJECT: '#ec4899',
  EXTERNAL: '#ef4444',
  MANUAL: '#fbbf24',
  ACTIVITY: '#14b8a6',
};

export const PANEL_TYPE_LABELS: Record<FlightBoardPanelType, string> = {
  TABLE: 'טבלת נתונים',
  BAR_CHART: 'גרף עמודות',
  LINE_CHART: 'גרף קווים',
  PIE_CHART: 'גרף עוגה',
  AREA_CHART: 'גרף שטח',
  KPI: 'כרטיסי KPI',
  TIMELINE: 'ציר זמן',
};

export const PANEL_WIDTH_LABELS: Record<FlightBoardPanelWidth, string> = {
  QUARTER: 'רבע רוחב',
  THIRD: 'שליש רוחב',
  HALF: 'חצי רוחב',
  TWO_THIRDS: 'שני שליש',
  FULL: 'רוחב מלא',
};

export const PANEL_WIDTH_FRACTION: Record<FlightBoardPanelWidth, number> = {
  QUARTER: 0.25,
  THIRD: 1 / 3,
  HALF: 0.5,
  TWO_THIRDS: 2 / 3,
  FULL: 1,
};

export const CHART_METRIC_LABELS: Record<FlightBoardChartMetric, string> = {
  COUNT: 'כמות',
  PEAK_VIEWERS: 'שיא צופים',
  AVG_VIEWERS: 'ממוצע צופים',
  TOTAL_REVENUE: 'סך הכנסות',
  DURATION: 'משך',
};

export const RANGE_PRESET_LABELS: Record<FlightBoardDateRangePreset, string> = {
  TODAY: 'היום',
  YESTERDAY: 'אתמול',
  THIS_WEEK: 'השבוע',
  THIS_MONTH: 'החודש',
  ALL: 'הכל',
  CUSTOM: 'מותאם אישית',
};

export const HEBREW_WEEKDAYS = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
];

// ---------------------------------------------------------------------------
// Column catalog
//
// Every column has a stable `key` (the runtime column reader uses it
// verbatim against the FlightBoardItem) and a Hebrew `label`. Columns are
// grouped so the builder can render them under collapsible sections.
// ---------------------------------------------------------------------------

export interface ColumnDef {
  key: string;
  label: string;
  /** Treat as a long text field that should wrap and offer a tooltip. */
  longText?: boolean;
  /** Treat as a yes/no value. */
  boolean?: boolean;
  /** Treat as a date-only value (no time). */
  dateOnly?: boolean;
  /** Treat as a time-of-day (HH:mm) value. */
  timeOnly?: boolean;
}

export interface ColumnGroup {
  key: string;
  label: string;
  description?: string;
  columns: ColumnDef[];
}

export const COLUMN_GROUPS: ColumnGroup[] = [
  {
    key: 'core',
    label: 'שדות בסיסיים',
    description: 'מידע משותף לכל סוגי הפריטים',
    columns: [
      { key: 'type', label: 'סוג פריט (תווית)' },
      { key: 'date', label: 'תאריך', dateOnly: true },
      { key: 'title', label: 'כותרת', longText: true },
      { key: 'description', label: 'תיאור', longText: true },
      { key: 'status', label: 'סטטוס' },
      { key: 'startTime', label: 'שעת התחלה', timeOnly: true },
      { key: 'endTime', label: 'שעת סיום', timeOnly: true },
      { key: 'channel', label: 'ערוץ' },
      { key: 'notes', label: 'הערות', longText: true },
    ],
  },
  {
    key: 'broadcast',
    label: 'אירוע שידור',
    description: 'שדות מאירוע השידור הראשי',
    columns: [
      { key: 'raw.eventNumber', label: 'מספר אירוע' },
      { key: 'raw.eventType', label: 'סוג אירוע' },
      { key: 'channel', label: 'ערוץ שידור' },
      { key: 'raw.parallelChannel', label: 'ערוץ מקביל' },
      { key: 'raw.sport', label: 'ענף ספורט' },
      { key: 'raw.league', label: 'ליגה' },
      { key: 'raw.stage', label: 'שלב' },
      { key: 'raw.homeTeam', label: 'קבוצת בית' },
      { key: 'raw.awayTeam', label: 'קבוצת חוץ' },
      { key: 'raw.priority', label: 'דחיפות' },
      { key: 'raw.live', label: 'שידור חי', boolean: true },
      { key: 'raw.backup', label: 'גיבוי', boolean: true },
      { key: 'startTime', label: 'שעת התחלה (שידור)', timeOnly: true },
      { key: 'endTime', label: 'שעת סיום (שידור)', timeOnly: true },
      { key: 'raw.koTime', label: 'שעת פתיחה (KO)', timeOnly: true },
      { key: 'raw.arrivalTime', label: 'שעת הגעת צוות', timeOnly: true },
      { key: 'raw.receptionStartTime', label: 'תחילת קליטה', timeOnly: true },
      { key: 'raw.gmtStartTime', label: 'התחלה GMT', timeOnly: true },
      { key: 'raw.gmtEndTime', label: 'סיום GMT', timeOnly: true },
      { key: 'raw.location', label: 'מיקום' },
      { key: 'raw.venue', label: 'מתקן' },
      { key: 'raw.synopsis', label: 'תקציר', longText: true },
      { key: 'raw.channel1_4k', label: 'Channel1 4K', boolean: true },
      { key: 'raw.requiresSubtitles', label: 'דורש כתוביות', boolean: true },
      { key: 'raw.requiresSignLanguage', label: 'שפת סימנים', boolean: true },
      { key: 'raw.translationType', label: 'סוג תרגום' },
      { key: 'raw.projectCode', label: 'קוד פרויקט' },
    ],
  },
  {
    key: 'mcr',
    label: 'נתוני MCR',
    description: 'מאוכלס כאשר אירוע השידור מקושר ל-MCR',
    columns: [
      { key: 'raw.mcr.title', label: 'כותרת MCR', longText: true },
      { key: 'raw.mcr.start', label: 'תחילת MCR', timeOnly: true },
      { key: 'raw.mcr.end', label: 'סיום MCR', timeOnly: true },
      { key: 'raw.mcr.mcrStartTime', label: 'תחילת הכנת MCR', timeOnly: true },
      { key: 'raw.mcr.mcrEndTime', label: 'סיום הכנת MCR', timeOnly: true },
      { key: 'raw.mcr.controlStudio', label: 'בקרה (סטודיו)' },
      { key: 'raw.mcr.broadcastChannel', label: 'ערוץ שידור (MCR)' },
      { key: 'raw.mcr.broadcastType', label: 'סוג ערוץ שידור' },
      { key: 'raw.mcr.preparationStatus', label: 'סטטוס הכנה' },
      { key: 'raw.mcr.preparationNotes', label: 'הערות הכנה', longText: true },
      { key: 'raw.mcr.sourceLabel', label: 'תווית מקור' },
      { key: 'raw.mcr.feedsCount', label: 'מספר Feeds' },
      { key: 'raw.mcr.outputPlatformsCount', label: 'מספר פלטפורמות יציאה' },
      { key: 'raw.mcr.isMCROnly', label: 'MCR בלבד', boolean: true },
    ],
  },
  {
    key: 'activity',
    label: 'שורות לוח MCR',
    description: 'מידע משורות הלוח (פעילות) המקושרות לאירוע',
    columns: [
      { key: 'raw.activity.count', label: 'מספר שורות פעילות' },
      { key: 'raw.activity.activityName', label: 'פעילות', longText: true },
      { key: 'raw.activity.time', label: 'שעת התחלה (לוח)', timeOnly: true },
      { key: 'raw.activity.endTime', label: 'שעת סיום (לוח)', timeOnly: true },
      { key: 'raw.activity.source', label: 'אולפן/מקור' },
      { key: 'raw.activity.channel', label: 'ערוץ (לוח)' },
      { key: 'raw.activity.equipment', label: 'מכשירים (לוח)', longText: true },
      { key: 'raw.activity.backup', label: 'גיבוי (לוח)' },
      { key: 'raw.activity.routing', label: 'ניתובים / יעד (לוח)', longText: true },
      { key: 'raw.activity.broadcastType', label: 'סוג שידור (לוח)' },
      { key: 'raw.activity.status', label: 'סטטוס (לוח)' },
      { key: 'raw.activity.notes', label: 'הערות (לוח)', longText: true },
      { key: 'raw.activity.isManual', label: 'שורה ידנית', boolean: true },
      { key: 'raw.activity.isHidden', label: 'מוסתרת מהתצוגה', boolean: true },
    ],
  },
  {
    key: 'crew',
    label: 'צוות הפקה (קמע/סאונד/במאי)',
    description: 'הצוות שנבחר ישירות באירוע השידור',
    columns: [
      { key: 'raw.crew.summary', label: 'סיכום צוות', longText: true },
      { key: 'raw.crew.cameramen', label: 'צלמים', longText: true },
      { key: 'raw.crew.soundmen', label: 'סאונדמנים', longText: true },
      { key: 'raw.crew.producers', label: 'מפיקים', longText: true },
      { key: 'raw.crew.directors', label: 'במאי', longText: true },
      { key: 'raw.crew.fieldTech', label: 'טכנאי שטח', longText: true },
    ],
  },
  {
    key: 'broadcastArray',
    label: 'מערך שידור (עורך/VTR/שדר)',
    description: 'תפקידים מטופס "מערך שידור" של האירוע',
    columns: [
      { key: 'raw.broadcastArray.broadcastLocation', label: 'מקום שידור' },
      {
        key: 'raw.broadcastArray.specialInstructions',
        label: 'הוראות מיוחדות',
        longText: true,
      },
      { key: 'raw.broadcastArray.editor', label: 'עורך', longText: true },
      { key: 'raw.broadcastArray.producer', label: 'מפיק (מערך שידור)', longText: true },
      { key: 'raw.broadcastArray.vtr', label: 'איש VTR', longText: true },
      { key: 'raw.broadcastArray.broadcastTech', label: 'טכנאי שידור', longText: true },
      { key: 'raw.broadcastArray.anchor', label: 'שדר', longText: true },
      { key: 'raw.broadcastArray.analyst', label: 'אנליסט', longText: true },
      { key: 'raw.broadcastArray.sidelineAnchor', label: 'שדר קווים', longText: true },
      { key: 'raw.broadcastArray.summary', label: 'סיכום מערך שידור', longText: true },
    ],
  },
  {
    key: 'external',
    label: 'שידורי חוץ',
    description: 'מטא־דאטה ממחלקת שידורי חוץ של האירוע',
    columns: [
      { key: 'raw.external.mobileUnit', label: 'ניידת' },
      { key: 'raw.external.notApplicable', label: 'לא רלוונטי', boolean: true },
      {
        key: 'raw.external.crewSummary',
        label: 'צוות שידור חוץ',
        longText: true,
      },
      { key: 'raw.external.equipmentListCount', label: 'מספר ציוד (רשימה)' },
      { key: 'raw.external.equipmentRequestsCount', label: 'מספר בקשות ציוד' },
    ],
  },
  {
    key: 'equipment',
    label: 'ציוד מחסן',
    description: 'הקצאות ציוד פעילות מהמחסן עבור האירוע',
    columns: [
      { key: 'raw.equipment.count', label: 'מספר פריטי ציוד' },
      { key: 'raw.equipment.totalQty', label: 'סך כמות ציוד' },
      { key: 'raw.equipment.list', label: 'רשימת ציוד', longText: true },
    ],
  },
  {
    key: 'post',
    label: 'פוסטים',
    description: 'שדות נוספים לפריטי "פוסט"',
    columns: [
      { key: 'raw.expiryDate', label: 'תוקף עד', dateOnly: true },
      { key: 'raw.untilNewPost', label: 'עד פוסט חדש', boolean: true },
    ],
  },
];

// Flat lookup of all known columns (for default labels and lookup).
export const ALL_COLUMNS_BY_KEY: Record<string, ColumnDef> = COLUMN_GROUPS.reduce(
  (acc, group) => {
    for (const col of group.columns) {
      acc[col.key] = col;
    }
    return acc;
  },
  {} as Record<string, ColumnDef>,
);

/**
 * Stable display index for every column key. Tables sort the user's
 * visibleColumns by this index so the rendering order is always logical
 * (core fields first, then broadcast, MCR, activity, crew, external,
 * equipment, post) regardless of the order the admin clicked them in.
 *
 * A key that appears in multiple groups uses its first appearance, which
 * keeps shared core fields like `channel` near the start.
 */
export const COLUMN_ORDER_INDEX: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let i = 0;
  for (const group of COLUMN_GROUPS) {
    for (const col of group.columns) {
      if (out[col.key] === undefined) {
        out[col.key] = i;
      }
      i += 1;
    }
  }
  return out;
})();

export function compareColumnKeys(a: string, b: string): number {
  const ai = COLUMN_ORDER_INDEX[a];
  const bi = COLUMN_ORDER_INDEX[b];
  if (ai === undefined && bi === undefined) return a.localeCompare(b);
  if (ai === undefined) return 1;
  if (bi === undefined) return -1;
  return ai - bi;
}

// Shared columns used as common defaults. These are the same as the `core`
// group minus the optional type-pill column.
export const DEFAULT_TABLE_COLUMNS = [
  'date',
  'title',
  'startTime',
  'endTime',
  'channel',
  'status',
];

export const STATUS_HEBREW_LABELS: Record<string, string> = {
  // Broadcast statuses
  planned: 'מתוכנן',
  confirmed: 'מאושר',
  in_progress: 'בביצוע',
  completed: 'הסתיים',
  cancelled: 'בוטל',
  // MCR preparation
  NOT_STARTED: 'טרם התחיל',
  IN_PROGRESS: 'בביצוע',
  READY: 'מוכן',
  // ActivityRow status
  READY_AR: 'מוכן',
  NOT_READY: 'לא מוכן',
  ERROR: 'תקלה',
  UNKNOWN: 'לא הוגדר',
  // Post lifecycle
  ACTIVE: 'פעיל',
  TIMED: 'עם תוקף',
  UNTIL_NEW: 'עד פוסט חדש',
};
