import React from 'react';
import { gql, ApolloClient } from '@apollo/client';

// Minimal shape of the `modal` instance returned by antd's `App.useApp()`.
// Avoids depending on antd internal type paths and keeps the helper
// usable with both the static `Modal` API and the hook-provided one.
type ModalApi = {
  confirm: (config: any) => { destroy: () => void };
};

// Shared preflight: returns the slots/users that have explicitly marked
// themselves as "unavailable" for the assignment window. The frontend
// uses the result to prompt the scheduler before saving the assignment
// in shift management, Broadcast Array, and External Broadcast forms.
export const CHECK_ASSIGNMENT_AVAILABILITY_CONFLICTS = gql`
  query CheckAssignmentAvailabilityConflicts(
    $input: AssignmentAvailabilityCheckInput!
  ) {
    checkAssignmentAvailabilityConflicts(input: $input) {
      userId
      userName
      dayOfWeek
      shiftType
      availability
      weekStartDate
    }
  }
`;

export interface AssignmentAvailabilityConflict {
  userId: string;
  userName: string | null;
  dayOfWeek: number;
  shiftType: string;
  availability: 'available' | 'unavailable' | 'prefer' | 'prefer_not';
  weekStartDate: string;
}

export interface CheckAvailabilityArgs {
  userIds: string[];
  startTime?: string | null;
  endTime?: string | null;
  shiftType?: string | null;
  departmentId?: string | null;
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const SHIFT_LABELS: Record<string, string> = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  evening: 'ערב',
  night: 'לילה',
};

function shiftLabel(shiftType: string): string {
  return SHIFT_LABELS[shiftType] || shiftType;
}

function dayLabel(dayOfWeek: number): string {
  if (dayOfWeek < 0 || dayOfWeek > 6) return '';
  return HEBREW_DAYS[dayOfWeek];
}

/**
 * Fetch availability conflicts for the supplied users / window.
 * Returns an empty list when the input has no internal user ids or when
 * the server reports no conflicts. Errors are swallowed (with a console
 * warning) so a transient backend failure never blocks the underlying
 * assignment flow.
 */
export async function fetchAvailabilityConflicts(
  client: ApolloClient<object>,
  args: CheckAvailabilityArgs,
): Promise<AssignmentAvailabilityConflict[]> {
  const userIds = Array.from(
    new Set((args.userIds || []).filter((id) => typeof id === 'string' && id.length > 0)),
  );
  if (userIds.length === 0) return [];
  if (!args.startTime) return [];

  try {
    const { data } = await client.query({
      query: CHECK_ASSIGNMENT_AVAILABILITY_CONFLICTS,
      fetchPolicy: 'network-only',
      variables: {
        input: {
          userIds,
          startTime: args.startTime,
          endTime: args.endTime ?? null,
          shiftType: args.shiftType ?? null,
          departmentId: args.departmentId ?? null,
        },
      },
    });
    const list: AssignmentAvailabilityConflict[] =
      data?.checkAssignmentAvailabilityConflicts || [];
    return list;
  } catch (err) {
    console.warn('Availability preflight failed', err);
    return [];
  }
}

/**
 * Display the standard Hebrew confirmation modal listing the affected
 * employees. Resolves `true` when the operator chooses to proceed and
 * `false` when they cancel. If there are no conflicts the modal is
 * skipped entirely and the function resolves to `true`.
 */
export function confirmAvailabilityConflicts(
  modal: ModalApi,
  conflicts: AssignmentAvailabilityConflict[],
): Promise<boolean> {
  if (!conflicts || conflicts.length === 0) return Promise.resolve(true);

  // Group conflicts by employee so duplicate slots for the same user
  // collapse into one row.
  const byUser = new Map<string, { name: string; slots: AssignmentAvailabilityConflict[] }>();
  for (const c of conflicts) {
    const name = c.userName || c.userId;
    const entry = byUser.get(c.userId) || { name, slots: [] };
    entry.slots.push(c);
    byUser.set(c.userId, entry);
  }

  const lines: string[] = [];
  byUser.forEach(({ name, slots }) => {
    const slotText = slots
      .map((s) => `${dayLabel(s.dayOfWeek)} · ${shiftLabel(s.shiftType)}`)
      .join(' · ');
    lines.push(`${name} — ${slotText}`);
  });

  return new Promise<boolean>((resolve) => {
    modal.confirm({
      title: 'העובד סימן אי-זמינות בזמן הזה',
      content: (
        <div>
          <p>נמצא שעובד אחד או יותר סימנו שאינם זמינים בתאריך ובשעות של השיבוץ. האם להמשיך בשיבוץ בכל זאת?</p>
          <ul style={{ paddingInlineStart: 18, marginTop: 8, marginBottom: 0 }}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ),
      okText: 'המשך בכל זאת',
      cancelText: 'ביטול',
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/**
 * Convenience wrapper used by the assignment save paths: runs the
 * preflight and, when there are conflicts, opens the Hebrew confirm
 * modal. Resolves with `true` when there are no conflicts or the
 * operator confirmed the override.
 */
export async function ensureAvailabilityOk(
  client: ApolloClient<object>,
  modal: ModalApi,
  args: CheckAvailabilityArgs,
): Promise<boolean> {
  const conflicts = await fetchAvailabilityConflicts(client, args);
  if (conflicts.length === 0) return true;
  return confirmAvailabilityConflicts(modal, conflicts);
}
