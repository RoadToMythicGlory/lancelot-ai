// Equipment substitution utility for external-broadcasts preset apply.
//
// The system has no shared "model"/"SKU" entity (see
// `services/api-gateway/src/models/equipment.models.ts`): every physical
// Equipment doc carries its own barcode. When a preset pins `equipmentId=A`
// and A is already dispatched to another event, applying that preset to a
// new event would otherwise write the dispatched id verbatim — and the
// warehouse scan keys fulfillment off `equipmentId`, so it would never
// reconcile.
//
// To compensate we substitute at preset-apply time: for any requested
// line whose pinned doc has insufficient `quantityAvailable`, swap to a
// sibling document with the same `name` (case- and whitespace-insensitive
// per the operator's instruction — "users in this place are idiots") that
// is still available. A running `reserved` map ensures two lines in the
// same apply don't both grab the same sibling.

export interface SubstitutionInput {
  equipmentId: string;
  equipmentName: string;
  category: string;
  categoryLabel: string;
  quantity: number;
  purpose?: string;
  audioConfig?: string;
}

export interface SubstitutionCatalogItem {
  id: string;
  name: string;
  quantityAvailable?: number | null;
  isDisabled?: boolean | null;
}

export interface Substitution {
  requestedId: string;
  requestedName: string;
  fulfilledId: string;
  fulfilledName: string;
  quantity: number;
}

export interface Unfulfilled {
  requestedId: string;
  requestedName: string;
  shortBy: number;
}

export interface SubstitutionResult {
  resolved: SubstitutionInput[];
  substitutions: Substitution[];
  unfulfilled: Unfulfilled[];
}

const normalizeName = (s: string): string => s.trim().toLowerCase();

const availOf = (eq: SubstitutionCatalogItem): number =>
  Math.max(0, eq.quantityAvailable ?? 0);

// Capacity already consumed by earlier lines in this apply, so we don't
// double-book the same sibling across two preset lines.
const effectiveAvail = (
  eq: SubstitutionCatalogItem,
  reserved: Map<string, number>,
): number => Math.max(0, availOf(eq) - (reserved.get(eq.id) ?? 0));

const reserve = (
  reserved: Map<string, number>,
  id: string,
  qty: number,
): void => {
  reserved.set(id, (reserved.get(id) ?? 0) + qty);
};

export function resolveEquipmentLines(
  lines: SubstitutionInput[],
  catalog: SubstitutionCatalogItem[],
): SubstitutionResult {
  const byId = new Map<string, SubstitutionCatalogItem>();
  // Group active siblings by normalized name for O(1) lookup.
  const byName = new Map<string, SubstitutionCatalogItem[]>();
  for (const eq of catalog) {
    byId.set(eq.id, eq);
    if (eq.isDisabled) continue;
    const key = normalizeName(eq.name);
    const bucket = byName.get(key);
    if (bucket) bucket.push(eq);
    else byName.set(key, [eq]);
  }

  const reserved = new Map<string, number>();
  const resolved: SubstitutionInput[] = [];
  const substitutions: Substitution[] = [];
  const unfulfilled: Unfulfilled[] = [];

  for (const line of lines) {
    const requestedQty = Math.max(1, Math.floor(line.quantity || 1));
    const pinned = byId.get(line.equipmentId);
    const pinnedUsable =
      pinned &&
      !pinned.isDisabled &&
      effectiveAvail(pinned, reserved) >= requestedQty;

    if (pinnedUsable) {
      reserve(reserved, pinned.id, requestedQty);
      resolved.push({ ...line, quantity: requestedQty });
      continue;
    }

    // Sibling candidates: same normalized name, different id, available
    // capacity (after prior reservations), not disabled. We use the
    // preset's stored `equipmentName` first (it's what the operator saw
    // when authoring) and fall back to the pinned doc's current name in
    // case the preset row is missing the field.
    const nameKey = normalizeName(line.equipmentName || pinned?.name || '');
    const siblingPool = (byName.get(nameKey) || []).filter(
      (eq) => eq.id !== line.equipmentId,
    );

    // Prefer the sibling with the most remaining capacity — leaves the
    // tighter ones for later lines that might need exactly that doc.
    const sortedByAvail = [...siblingPool].sort(
      (a, b) => effectiveAvail(b, reserved) - effectiveAvail(a, reserved),
    );

    const fullCover = sortedByAvail.find(
      (eq) => effectiveAvail(eq, reserved) >= requestedQty,
    );

    if (fullCover) {
      reserve(reserved, fullCover.id, requestedQty);
      resolved.push({
        ...line,
        equipmentId: fullCover.id,
        equipmentName: fullCover.name,
        quantity: requestedQty,
      });
      substitutions.push({
        requestedId: line.equipmentId,
        requestedName: line.equipmentName,
        fulfilledId: fullCover.id,
        fulfilledName: fullCover.name,
        quantity: requestedQty,
      });
      continue;
    }

    // No single sibling can cover the full quantity. Greedily split
    // across siblings until the demand is met or the pool is exhausted.
    let remaining = requestedQty;
    let splitAny = false;
    for (const sib of sortedByAvail) {
      if (remaining <= 0) break;
      const avail = effectiveAvail(sib, reserved);
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      reserve(reserved, sib.id, take);
      resolved.push({
        ...line,
        equipmentId: sib.id,
        equipmentName: sib.name,
        quantity: take,
      });
      substitutions.push({
        requestedId: line.equipmentId,
        requestedName: line.equipmentName,
        fulfilledId: sib.id,
        fulfilledName: sib.name,
        quantity: take,
      });
      remaining -= take;
      splitAny = true;
    }

    if (remaining > 0) {
      // Either no siblings exist at all, or the combined sibling pool
      // can't cover the demand. Keep the original line so the operator
      // still sees what was requested; the toast layer will warn them.
      if (!splitAny) {
        resolved.push({ ...line, quantity: requestedQty });
      }
      unfulfilled.push({
        requestedId: line.equipmentId,
        requestedName: line.equipmentName,
        shortBy: remaining,
      });
    }
  }

  return { resolved, substitutions, unfulfilled };
}
