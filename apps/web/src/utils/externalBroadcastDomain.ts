/**
 * Shared External Broadcasts domain layer.
 *
 * This module centralizes the metadata shape, helpers, and color logic that
 * the External Broadcasts page, the Operations page, reports, and the
 * Flight Board adapter all rely on. Before this file existed, status logic
 * was duplicated across the 1700+ line page, the modal, and the planning
 * surface — each with slightly different rules.
 *
 * Scope guardrails:
 *  - This layer never writes to broadcast planning fields directly.
 *  - It never replaces or mutates the manual equipment request shape.
 *  - It only reads/writes `metadata.departments.externalBroadcasts.customData`.
 */

// ─── Department / completion status ────────────────────────────────────────

export type ExternalBroadcastCompletionStatus = 'complete' | 'partial' | 'empty';

export const COMPLETION_STATUS_LABEL: Record<ExternalBroadcastCompletionStatus, string> = {
  complete: 'הושלם',
  partial: 'חלקי',
  empty: 'ריק',
};

export const COMPLETION_STATUS_COLORS: Record<
  ExternalBroadcastCompletionStatus,
  { bg: string; border: string; text: string }
> = {
  complete: { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
  partial: { bg: '#fefce8', border: '#eab308', text: '#a16207' },
  empty: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c' },
};

// ─── Assignment (operational) status — distinct from completion ────────────

export type ExternalBroadcastAssignmentStatus =
  | 'live'
  | 'paused'
  | 'postponed'
  | 'cancelled';

export const ASSIGNMENT_STATUS_LABEL: Record<ExternalBroadcastAssignmentStatus, string> = {
  live: 'חי',
  paused: 'מושהה',
  postponed: 'נדחה',
  cancelled: 'בוטל',
};

/**
 * Row background colors for the assignment status.
 *
 * Per product requirements:
 *  - `live`: do NOT override the row color; the row keeps the normal
 *    alternating day-of-week shade (returns `null`).
 *  - `paused`: yellow.
 *  - `postponed`: light green.
 *  - `cancelled`: red.
 */
export function getAssignmentStatusRowBackground(
  status: ExternalBroadcastAssignmentStatus | undefined,
): string | null {
  switch (status) {
    case 'paused':
      return '#fef9c3';
    case 'postponed':
      return '#dcfce7';
    case 'cancelled':
      return '#fee2e2';
    case 'live':
    default:
      return null;
  }
}

export const ASSIGNMENT_STATUS_TAG_COLOR: Record<
  ExternalBroadcastAssignmentStatus,
  string
> = {
  live: 'green',
  paused: 'gold',
  postponed: 'cyan',
  cancelled: 'red',
};

// ─── Document slot definitions ─────────────────────────────────────────────

export type ExternalBroadcastDocumentSlot =
  | 'technical'
  | 'production'
  | 'lineUp'
  | 'manpower';

export const DOCUMENT_SLOT_LABEL: Record<ExternalBroadcastDocumentSlot, string> = {
  technical: 'מסמך טכני',
  production: 'מסמך הפקה',
  lineUp: 'Line-up',
  manpower: 'כוח אדם',
};

export interface UploadedDocument {
  id: string;
  fileName: string;
  url?: string;
  uploadedAt: string;
  uploadedBy?: string;
  uploadedByName?: string;
  size?: number;
}

// ─── Control-check (formerly "OFFTUBE") / Finance ──────────────────────────

export type ControlCheckStatus = 'not_checked' | 'checked' | 'issue';

export const CONTROL_CHECK_STATUS_LABEL: Record<ControlCheckStatus, string> = {
  not_checked: 'לא נבדק',
  checked: 'נבדק',
  issue: 'תקלה',
};

/**
 * Back-compat alias for code paths still importing the old name. New
 * code should import `ControlCheckStatus` / `CONTROL_CHECK_STATUS_LABEL`.
 */
export type OfftubeCheckStatus = ControlCheckStatus;
export const OFFTUBE_STATUS_LABEL = CONTROL_CHECK_STATUS_LABEL;

export interface ControlCheckBlock {
  required?: boolean;
  roomId?: string;
  roomName?: string;
  checkStatus?: ControlCheckStatus;
  notes?: string;
}

export type ConfirmationStatus = 'pending' | 'confirmed' | 'rejected';
export type InvoiceStatus = 'not_required' | 'pending' | 'approved' | 'paid';

// ─── Fault report (also persisted in a Mongo collection on the server) ─────

export type FaultSeverity = 'minor' | 'major' | 'critical';
export type FaultStatus = 'open' | 'in_progress' | 'resolved';

export const FAULT_SEVERITY_LABEL: Record<FaultSeverity, string> = {
  minor: 'קלה',
  major: 'משמעותית',
  critical: 'קריטית',
};

export const FAULT_STATUS_LABEL: Record<FaultStatus, string> = {
  open: 'פתוחה',
  in_progress: 'בטיפול',
  resolved: 'טופלה',
};

// ─── Full per-event metadata shape (additive) ──────────────────────────────

/**
 * Every new field below is optional so events saved before the expansion
 * keep loading exactly as they did. Code that writes these fields must
 * preserve all other `customData` keys to avoid dropping crew/equipment.
 */
export interface ExternalBroadcastCustomData {
  // Existing keys — preserved verbatim.
  notApplicable?: boolean;
  productionCrew?: any[];
  equipmentList?: any[];
  equipmentRequests?: any[];
  dynamicJobs?: any[];
  mobileUnit?: string;

  // Phase 2 — operational assignment status.
  assignmentStatus?: ExternalBroadcastAssignmentStatus;

  // Phase 3 — double broadcast / secondary control room.
  isDoubleBroadcast?: boolean;
  secondaryControlRoomId?: string;
  secondaryControlRoomName?: string;

  // Phase 6 — drag reorder display override.
  manualDisplayOrder?: number;

  // Control-check (formerly "OFFTUBE") — pre-broadcast control-room
  // verification. `roomId` references an `ExternalBroadcastReference` of
  // kind `controlRoom`; `roomName` is denormalised for display so the
  // value doesn't disappear if the room is later renamed.
  controlCheck?: ControlCheckBlock;
  /** @deprecated Old key — read via `controlCheck` from now on. */
  offtube?: ControlCheckBlock;

  // Phase 6 — per-event documents.
  documents?: Partial<Record<ExternalBroadcastDocumentSlot, UploadedDocument[]>>;

  // Phase 11 — finance metadata.
  finance?: {
    pettyCashRequired?: number;
    pettyCashReturned?: number;
    invoiceStatus?: InvoiceStatus;
    confirmationStatus?: ConfirmationStatus;
    notes?: string;
  };

  // Phase 14 — NEVION automated request bookkeeping.
  nevionRequest?: {
    enabled: boolean;
    requiredCameraCount: number;
    selectedEquipmentId?: string;
    selectedEquipmentName?: string;
    selectedCapacity?: number;
    generatedEquipmentLineId?: string;
    unresolved?: boolean;
  };

  // Phase 15 — LiveU per-event activation.
  liveuActivation?: {
    selectedKitIds: string[];
    selectedInternalIds: string[];
    lastEmailSentAt?: string;
    lastEmailSentBy?: string;
    lastEmailSentByName?: string;
  };

  // Phase 13 — operational exclude-from-External-Broadcasts toggle.
  excludedFromOperations?: boolean;
  excludedAt?: string;
  excludedBy?: string;
  excludedByName?: string;
  excludeReason?: string;

  // Import-from-planning gate. External Broadcasts shows only events
  // that an operator has explicitly imported from the broadcast
  // planning table; this flag controls that visibility.
  importedFromPlanning?: boolean;
  importedAt?: string;
  importedBy?: string;
  importedByName?: string;
  unimportedAt?: string;
  unimportedBy?: string;

  // Whatever other free-form keys may already be on the document.
  [key: string]: any;
}

/**
 * Read the External Broadcasts custom data block off a broadcast event,
 * normalizing both the new `customData` nesting and the legacy top-level
 * keys that older saves produced.
 */
export function readExternalBroadcastData(
  event: any,
): ExternalBroadcastCustomData {
  const dept = event?.metadata?.departments?.externalBroadcasts || {};
  const cd: ExternalBroadcastCustomData = dept.customData || {};
  // Mirror legacy top-level fields up into customData so downstream code
  // never has to check two locations.
  if (cd.notApplicable === undefined && dept.notApplicable !== undefined) {
    cd.notApplicable = dept.notApplicable;
  }
  if (!cd.productionCrew && Array.isArray(dept.productionCrew)) {
    cd.productionCrew = dept.productionCrew;
  }
  if (!cd.equipmentList && Array.isArray(dept.equipmentList)) {
    cd.equipmentList = dept.equipmentList;
  }
  if (!cd.equipmentRequests && Array.isArray(dept.equipmentRequests)) {
    cd.equipmentRequests = dept.equipmentRequests;
  }
  return cd;
}

/**
 * Compute the External Broadcasts completion status for an event using a
 * single rule that all surfaces share.
 *
 * Rules (kept compatible with the previous in-page logic):
 *  - `notApplicable` → `complete`.
 *  - crew >= 2 AND at least one equipment line → `complete`.
 *  - crew > 0 OR at least one equipment line     → `partial`.
 *  - otherwise → `empty`.
 */
export function getExternalBroadcastCompletionStatus(
  event: any,
): ExternalBroadcastCompletionStatus {
  const cd = readExternalBroadcastData(event);
  if (cd.notApplicable) return 'complete';
  const crew = Array.isArray(cd.productionCrew) ? cd.productionCrew.length : 0;
  const items = Array.isArray(cd.equipmentList) ? cd.equipmentList.length : 0;
  const legacy = Array.isArray(cd.equipmentRequests)
    ? cd.equipmentRequests.length
    : 0;
  const hasEquip = items + legacy > 0;
  if (crew >= 2 && hasEquip) return 'complete';
  if (crew > 0 || hasEquip) return 'partial';
  return 'empty';
}

/**
 * Read the assignment status with a `live` default. Older events that
 * never set this field show as `live` so existing rows look unchanged.
 */
export function getAssignmentStatus(
  event: any,
): ExternalBroadcastAssignmentStatus {
  const cd = readExternalBroadcastData(event);
  return cd.assignmentStatus || 'live';
}

/**
 * Per product requirement, the operations list defaults to ordering by
 * broadcast `startTime`. If an operator has dragged events to a manual
 * order for the visible date, that override wins.
 */
export function compareForOperationsOrder(a: any, b: any): number {
  const aManual = readExternalBroadcastData(a).manualDisplayOrder;
  const bManual = readExternalBroadcastData(b).manualDisplayOrder;
  if (typeof aManual === 'number' && typeof bManual === 'number') {
    return aManual - bManual;
  }
  if (typeof aManual === 'number') return -1;
  if (typeof bManual === 'number') return 1;
  const aTime = new Date(a?.startTime || 0).getTime();
  const bTime = new Date(b?.startTime || 0).getTime();
  return aTime - bTime;
}

/**
 * Merge new customData fields into the existing department blob without
 * dropping any previously-saved keys. The mutation only ever overwrites
 * `metadata.departments.externalBroadcasts` wholesale, so callers must
 * always send the full merged object back.
 */
export function mergeCustomData(
  existing: ExternalBroadcastCustomData | undefined,
  patch: Partial<ExternalBroadcastCustomData>,
): ExternalBroadcastCustomData {
  return { ...(existing || {}), ...patch };
}

/**
 * Read the control-check block (formerly stored under `offtube`).
 * Returns the new `controlCheck` field if present, else falls back to
 * the legacy `offtube` field, so older saves keep rendering.
 */
export function readControlCheck(
  cd: ExternalBroadcastCustomData | undefined,
): ControlCheckBlock | undefined {
  if (!cd) return undefined;
  return cd.controlCheck || cd.offtube || undefined;
}

/**
 * Is this event currently imported into External Broadcasts?
 *
 * Backward compat: events saved before the import flow existed don't
 * have the `importedFromPlanning` flag, but they DO have some External
 * Broadcasts data (crew / equipment / status etc.). Treat those as
 * already-imported so nothing disappears the moment the import gate
 * ships. New events have to be explicitly imported via the modal.
 */
export function isImportedIntoExternalBroadcasts(event: any): boolean {
  const cd = readExternalBroadcastData(event);
  if (cd.importedFromPlanning === true) return true;
  if (cd.importedFromPlanning === false) return false; // explicit un-import
  // Heuristic backwards-compat check: any saved EB activity counts as
  // imported so legacy events keep showing up until they're explicitly
  // un-imported by an operator.
  const hasCrew = Array.isArray(cd.productionCrew) && cd.productionCrew.length > 0;
  const hasEquip =
    (Array.isArray(cd.equipmentList) && cd.equipmentList.length > 0) ||
    (Array.isArray(cd.equipmentRequests) && cd.equipmentRequests.length > 0);
  const hasOpsData =
    !!cd.assignmentStatus ||
    !!cd.controlCheck ||
    !!cd.offtube ||
    !!cd.nevionRequest ||
    !!cd.liveuActivation ||
    !!cd.notApplicable;
  return hasCrew || hasEquip || hasOpsData;
}
