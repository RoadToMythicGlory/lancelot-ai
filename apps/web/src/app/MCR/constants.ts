import type {
  BroadcastType,
  MCRExchangeStatus,
  MCRPlatformStatus,
  MCRPreparationStatus,
  ActivityStatus,
} from './types';

export const BROADCAST_TYPES: BroadcastType[] = [
  'SRT_CALLER',
  'SRT_LISTENER',
  'DVBS2',
  'DVBS2X',
  'NS4',
  'NS3',
  'RTMP',
  'ZIXI',
  'PRT',
  'LIVEU',
  'KLITA_MOU',
  'OTHER',
];

export const BROADCAST_TYPE_LABELS_HE: Record<BroadcastType, string> = {
  SRT_CALLER: 'SRT CALLER',
  SRT_LISTENER: 'SRT LISTENER',
  DVBS2: 'DVBS2',
  DVBS2X: 'DVBS2X',
  NS3: 'NS3',
  NS4: 'NS4',
  RTMP: 'RTMP',
  ZIXI: 'ZIXI',
  PRT: 'PRT',
  LIVEU: 'LIVEU',
  KLITA_MOU: 'קליטה מ-OU',
  OTHER: 'אחר',
};

export const BROADCAST_TYPE_COLORS: Record<BroadcastType, string> = {
  SRT_CALLER: '#7ca13d',
  SRT_LISTENER: '#a8cc6a',
  DVBS2: '#ed80e8',
  DVBS2X: '#54b0c7',
  NS3: '#1b943b',
  NS4: '#1b943b',
  RTMP: '#d46eab',
  ZIXI: '#ff6b6b',
  LIVEU: '#e8ca92',
  PRT: '#c2e8ed',
  KLITA_MOU: '#b135de',
  OTHER: '#e31464',
};

export const PREPARATION_STATUS_LABELS: Record<MCRPreparationStatus, string> = {
  NOT_STARTED: 'לא התחיל',
  IN_PROGRESS: 'בתהליך',
  READY: 'מוכן',
};

export const PREPARATION_STATUS_COLORS: Record<MCRPreparationStatus, string> = {
  NOT_STARTED: '#94a3b8',
  IN_PROGRESS: '#f59e0b',
  READY: '#16a34a',
};

export const PLATFORM_STATUS_LABELS: Record<MCRPlatformStatus, string> = {
  PENDING: 'ממתין',
  CONFIRMED: 'מאושר',
  LIVE: 'באוויר',
  OFF: 'כבוי',
};

export const PLATFORM_STATUS_COLORS: Record<MCRPlatformStatus, string> = {
  PENDING: '#64748b',
  CONFIRMED: '#0284c7',
  LIVE: '#16a34a',
  OFF: '#475569',
};

export const EXCHANGE_STATUS_LABELS: Record<MCRExchangeStatus, string> = {
  DRAFT: 'טיוטה',
  PUBLISHED: 'פורסם',
  ACTIVE: 'פעיל',
  REVIEW_PENDING: 'ממתין לבדיקה',
  CLOSED: 'סגור',
};

export const EXCHANGE_STATUS_COLORS: Record<MCRExchangeStatus, string> = {
  DRAFT: '#94a3b8',
  PUBLISHED: '#0ea5e9',
  ACTIVE: '#16a34a',
  REVIEW_PENDING: '#f59e0b',
  CLOSED: '#64748b',
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  UNKNOWN: 'לא הוגדר',
  READY: 'מוכן לשידור',
  NOT_READY: 'לא מוכן לשידור',
  ERROR: 'תקלה',
};

export const ACTIVITY_STATUS_COLORS: Record<ActivityStatus, string> = {
  READY: '#22c55e',
  NOT_READY: '#f59e0b',
  ERROR: '#ef4444',
  UNKNOWN: '#94a3b8',
};

export const HEBREW_WEEKDAYS = [
  'יום ראשון',
  'יום שני',
  'יום שלישי',
  'יום רביעי',
  'יום חמישי',
  'יום שישי',
  'שבת',
];

export const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];
