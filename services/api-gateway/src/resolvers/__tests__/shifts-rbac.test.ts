/**
 * Resolver-level RBAC test for the `shifts(...)` and `getShiftsByWeek(...)`
 * range read gate. We exercise `checkShiftRangeRead` directly with a fake
 * Apollo context so we don't need a real Mongo connection.
 *
 * Acceptance:
 *   - unauthenticated callers always throw
 *   - own-data reads (userId === me) are allowed when the user has SHIFTS_VIEW_OWN
 *   - dept-scoped reads require SHIFTS_VIEW_ALL for that dept
 *   - global range reads require SHIFTS_VIEW_ALL globally
 */

// shifts.ts pulls in MongoDB config at import time which would otherwise
// crash with a MONGO_USERNAME error in non-development environments. The
// helper under test never actually connects, so a stub is sufficient.
jest.mock('../../config/mongodb', () => ({
  connectMongoDB: jest.fn(),
}));

import { Permission } from '../../rbac';
import { checkShiftRangeRead } from '../shifts';

type Perms = {
  global?: Permission[];
  byDept?: Record<string, Permission[]>;
};

function fakeUser(opts: { userId: string; perms?: Perms; email?: string } | null): any {
  if (!opts) return null;
  const globalSet = new Set(opts.perms?.global || []);
  const deptMap = opts.perms?.byDept || {};
  return {
    userId: opts.userId,
    email: opts.email || `${opts.userId}@example.com`,
    has(p: Permission) {
      return globalSet.has(p);
    },
    hasForDept(p: Permission, deptId: string) {
      if (globalSet.has(p)) return true;
      return (deptMap[deptId] || []).includes(p);
    },
  };
}

function makeCtx(user: any) {
  return { user };
}

describe('checkShiftRangeRead', () => {
  it('rejects unauthenticated callers', () => {
    expect(() => checkShiftRangeRead(makeCtx(null), {})).toThrow();
    expect(() =>
      checkShiftRangeRead(makeCtx(null), { userId: 'me' }),
    ).toThrow();
    expect(() =>
      checkShiftRangeRead(makeCtx(null), { department: 'NEWS' }),
    ).toThrow();
  });

  it('allows own-data reads when user has SHIFTS_VIEW_OWN', () => {
    const user = fakeUser({
      userId: 'u1',
      perms: { global: [Permission.SHIFTS_VIEW_OWN] },
    });
    expect(() =>
      checkShiftRangeRead(makeCtx(user), { userId: 'u1' }),
    ).not.toThrow();
  });

  it('rejects own-data reads when user lacks SHIFTS_VIEW_OWN', () => {
    const user = fakeUser({ userId: 'u1', perms: {} });
    expect(() =>
      checkShiftRangeRead(makeCtx(user), { userId: 'u1' }),
    ).toThrow(/SHIFTS_VIEW_OWN/);
  });

  it('allows reading another userId only when SHIFTS_VIEW_ALL is held globally', () => {
    const employee = fakeUser({
      userId: 'u1',
      perms: { global: [Permission.SHIFTS_VIEW_OWN] },
    });
    expect(() =>
      checkShiftRangeRead(makeCtx(employee), { userId: 'u2' }),
    ).toThrow(/SHIFTS_VIEW_ALL/);

    const sysAdmin = fakeUser({
      userId: 'admin',
      perms: { global: [Permission.SHIFTS_VIEW_ALL] },
    });
    expect(() =>
      checkShiftRangeRead(makeCtx(sysAdmin), { userId: 'u2' }),
    ).not.toThrow();
  });

  it('allows dept-scoped reads to dept admins, but not foreign departments', () => {
    const hod = fakeUser({
      userId: 'h1',
      perms: {
        global: [Permission.SHIFTS_VIEW_OWN],
        byDept: { NEWS: [Permission.SHIFTS_VIEW_ALL] },
      },
    });
    expect(() =>
      checkShiftRangeRead(makeCtx(hod), { department: 'NEWS' }),
    ).not.toThrow();
    expect(() =>
      checkShiftRangeRead(makeCtx(hod), { department: 'SPORTS' }),
    ).toThrow(/SHIFTS_VIEW_ALL/);
  });

  it('requires global SHIFTS_VIEW_ALL when neither userId nor department supplied', () => {
    const employee = fakeUser({
      userId: 'u1',
      perms: { global: [Permission.SHIFTS_VIEW_OWN] },
    });
    expect(() => checkShiftRangeRead(makeCtx(employee), {})).toThrow(
      /SHIFTS_VIEW_ALL/,
    );

    const admin = fakeUser({
      userId: 'admin',
      perms: { global: [Permission.SHIFTS_VIEW_ALL] },
    });
    expect(() => checkShiftRangeRead(makeCtx(admin), {})).not.toThrow();
  });
});
