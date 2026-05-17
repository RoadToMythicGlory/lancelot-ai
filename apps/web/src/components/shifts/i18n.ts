/**
 * Hebrew label contract for the shifts sub-app.
 *
 * Single source of truth for any role / page / status name that appears in
 * the UI. Use these constants instead of hard-coding Hebrew strings so
 * "HoD" / "Department Admin" / etc. are spelled identically everywhere.
 */

export const LABELS = {
  // Roles
  SYSTEM_ADMIN: 'מנהל מערכת',
  HOD: 'מנהל מחלקה',
  EMPLOYEE: 'עובד',

  // Top-level
  SHIFTS: 'משמרות',
  SHIFTS_HUB_TITLE: 'ניהול משמרות',
  WELCOME: 'ברוך הבא',
  BACK_HOME: 'חזרה לדף הבית',

  // Employee pages
  DASHBOARD: 'דף הבית',
  MY_SHIFTS: 'המשמרות שלי',
  MY_REQUESTS: 'הבקשות שלי',
  MY_PREFERENCES: 'ההעדפות שלי',
  WORK_LOG: 'יומן עבודה',
  AGREEMENTS: 'הסכמים',
  DAILY_SCHEDULE: 'סידור יומי',
  WEEKLY_SCHEDULE: 'סידור שבועי',
  SCHEDULE_BY_EMPLOYEE: 'סידור לפי עובד',
  SUPPORT: 'תמיכה',

  // Manager (HoD) pages
  HOD_DASHBOARD: 'לוח בקרה מנהל מחלקה',
  ASSIGN_SHIFTS: 'שיבוץ משמרות',
  DEPARTMENT_SCHEDULE: 'סידור מחלקה',
  DEPARTMENT_USERS: 'ניהול עובדי מחלקה',
  CONFIGURE_SHIFTS: 'הגדרת משמרות',
  CONFIGURE_CONSTRAINTS: 'הגדרת אילוצים',
  SCHEDULING_RULES: 'חוקי שיבוץ',
  APPROVALS: 'אישור בקשות',
  EMPLOYEE_PREFERENCES: 'העדפות עובדים',

  // Admin pages
  ADMIN_DASHBOARD: 'לוח בקרה מנהל מערכת',
  MANAGE_DEPARTMENTS: 'ניהול מחלקות',
  MANAGE_USERS: 'ניהול משתמשים',
  SYSTEM_SETTINGS: 'הגדרות מערכת',

  // Common UI
  REFRESH: 'רענן',
  REFRESH_NOW: 'רענן עכשיו',
  SAVE: 'שמור',
  CANCEL: 'ביטול',
  CLOSE: 'סגירה',
  DELETE: 'מחיקה',
  EDIT: 'עריכה',
  CREATE: 'יצירה',
  CONFIRM: 'אישור',
  REJECT: 'דחייה',
  SUBMIT: 'שליחה',
  SEND: 'שלח',
  SELECT: 'בחר',
  SELECT_DEPARTMENT: 'בחר מחלקה',
  ALL: 'הכל',

  // Statuses
  STATUS_PENDING: 'ממתין',
  STATUS_APPROVED: 'מאושר',
  STATUS_REJECTED: 'נדחה',
  STATUS_CANCELLED: 'בוטל',

  // Empty / loading / error
  EMPTY_NO_SHIFTS: 'אין משמרות מתוכננות',
  EMPTY_NO_REQUESTS: 'אין בקשות',
  EMPTY_NO_NOTIFICATIONS: 'אין התראות',
  LOADING: 'טוען...',
  ERROR_LOADING: 'שגיאה בטעינה',
  NO_PERMISSION: 'אין הרשאה',
  NO_PERMISSION_DESC: 'אין לך הרשאה לצפות בעמוד זה',
} as const;

export type LabelKey = keyof typeof LABELS;

/**
 * Hebrew weekday names, Sunday-first to match the reference + Hebrew calendar.
 */
export const HEBREW_WEEKDAYS = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

/**
 * Short two-letter Hebrew weekday abbreviations.
 */
export const HEBREW_WEEKDAYS_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

/**
 * Map of standard request status string → Hebrew label.
 */
export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'pending':
      return LABELS.STATUS_PENDING;
    case 'approved':
      return LABELS.STATUS_APPROVED;
    case 'rejected':
      return LABELS.STATUS_REJECTED;
    case 'cancelled':
      return LABELS.STATUS_CANCELLED;
    default:
      return status || '';
  }
}

/**
 * Vacation type Hebrew labels (mirrors the VacationType enum in shifts.graphql).
 */
export function vacationTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'annual':
      return 'חופשה שנתית';
    case 'sick':
      return 'מחלה';
    case 'personal':
      return 'אישי';
    case 'maternity':
      return 'לידה';
    case 'other':
      return 'אחר';
    default:
      return type || '';
  }
}
