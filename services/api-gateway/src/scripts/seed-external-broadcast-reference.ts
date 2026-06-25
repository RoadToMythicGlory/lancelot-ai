// Idempotent seed for the External Broadcasts reference data collection.
//
// Runs on every API startup (see `index.ts`). Inserts the default control
// rooms used everywhere in the Lancelot app (Broadcast Array form,
// External Broadcasts double-broadcast secondary control, MCR views,
// reports, etc.) so they're immediately available without manual data
// entry. Operators can still add/remove control rooms from the
// External Broadcasts settings UI; this seed only inserts rows that
// don't exist yet — admin edits, deactivations, and additions are
// preserved across reboots.

import {
  ExternalBroadcastReference,
  ReferenceKind,
} from '../models/externalBroadcastReference.models';
import { createLogger } from '../utils/logger';

const log = createLogger('seed-external-broadcast-reference');

// Single source of truth for the default control rooms. Matches the
// list that used to be hard-coded in `BroadcastArrayModal` and
// `broadcast-array/page.tsx`, plus the satellite-only option that has
// always been part of that picker. Keep ordering stable — it's used as
// the natural sort order in the UI.
const DEFAULT_CONTROL_ROOMS: string[] = [
  'קונטרול 1',
  'קונטרול 2',
  'קונטרול 3',
  'קונטרול 4',
  'קונטרול 5',
  'קונטרול 6',
  'קונטרול 7',
  'קונטרול 8',
  'יוניפייד 1',
  'יוניפייד 2',
  'יוניפייד 3',
  'יוניפייד 4',
  'יוניפייד 5',
  'יוניפייד 6',
  'רדיו',
  'יעלה לווין בלבד',
];

async function seedKind(kind: ReferenceKind, names: string[]): Promise<void> {
  let created = 0;
  for (const name of names) {
    const existing = await ExternalBroadcastReference.findOne({
      kind,
      name,
    }).exec();
    if (existing) continue;
    await ExternalBroadcastReference.create({
      kind,
      name,
      isActive: true,
    });
    created += 1;
  }
  if (created > 0) {
    log.info(`Seeded ${created} new ${kind} reference rows.`);
  }
}

export async function seedExternalBroadcastReference(): Promise<void> {
  try {
    await seedKind('controlRoom', DEFAULT_CONTROL_ROOMS);
  } catch (err) {
    log.error('Failed to seed external broadcast reference data:', err as any);
  }
}
