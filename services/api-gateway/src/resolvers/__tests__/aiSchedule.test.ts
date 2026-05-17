/**
 * Resolver-level test for aiScheduleSuggestImpl.
 *
 * The heuristic is deterministic: given the same data + prompt it must return
 * the same suggestions. We mock MongoDB with an in-memory fixture so the test
 * doesn't need a live database.
 */

import { ObjectId } from 'mongodb';

// Mock the Mongo connection BEFORE importing the impl. Each `find()` returns
// an object with `.sort()` and `.toArray()` so the impl's queries Just Work.
jest.mock('../../config/mongodb', () => {
  return {
    connectMongoDB: jest.fn(),
  };
});

import { connectMongoDB } from '../../config/mongodb';
import { aiScheduleSuggestImpl } from '../aiSchedule';
import { Permission } from '../../rbac';

function makeCursor(items: any[]) {
  return {
    sort: () => ({
      toArray: async () => items,
    }),
    toArray: async () => items,
  };
}

function authenticatedCtx(perms: Permission[]) {
  const set = new Set(perms);
  return {
    user: {
      userId: 'mgr-1',
      email: 'mgr@example.com',
      systemRole: 'DEPARTMENT_ADMIN',
      has: (p: Permission) => set.has(p),
      hasForDept: (p: Permission, _deptId: string) => set.has(p),
    },
  };
}

const DEPT = 'NEWS';
const WEEK_START = '2026-05-17'; // Sunday in IL
const WEEK_END = '2026-05-23';

const aplId = new ObjectId();
const shiftTypeId = new ObjectId();
const userId1 = new ObjectId();
const userId2 = new ObjectId();

function setupCollections(opts: {
  shiftTypes?: any[];
  apls?: any[];
  schedulingRules?: any[];
  shiftCategories?: any[];
  preferences?: any[];
  shifts?: any[];
  users?: any[];
}) {
  const collections: Record<string, any[]> = {
    shift_type_defs: opts.shiftTypes ?? [],
    apls: opts.apls ?? [],
    scheduling_rules: opts.schedulingRules ?? [],
    shift_categories: opts.shiftCategories ?? [],
    preferences: opts.preferences ?? [],
    shifts: opts.shifts ?? [],
    users: opts.users ?? [],
  };
  (connectMongoDB as jest.Mock).mockResolvedValue({
    collection: (name: string) => ({
      find: () => makeCursor(collections[name] || []),
    }),
  });
}

describe('aiScheduleSuggestImpl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated callers', async () => {
    setupCollections({});
    await expect(
      aiScheduleSuggestImpl(
        { departmentId: DEPT, weekStart: WEEK_START, weekEnd: WEEK_END },
        { user: null },
      ),
    ).rejects.toThrow();
  });

  it('rejects callers without SHIFTS_MANAGE for the dept', async () => {
    setupCollections({});
    await expect(
      aiScheduleSuggestImpl(
        { departmentId: DEPT, weekStart: WEEK_START, weekEnd: WEEK_END },
        authenticatedCtx([Permission.SHIFTS_VIEW_OWN]),
      ),
    ).rejects.toThrow();
  });

  it('returns [] when there is no setup at all', async () => {
    setupCollections({});
    const out = await aiScheduleSuggestImpl(
      { departmentId: DEPT, weekStart: WEEK_START, weekEnd: WEEK_END },
      authenticatedCtx([Permission.SHIFTS_MANAGE]),
    );
    expect(out).toEqual([]);
  });

  it('suggests an assignment when an APL has exactly one eligible employee', async () => {
    setupCollections({
      shiftTypes: [
        {
          _id: shiftTypeId,
          departmentId: DEPT,
          name: 'בוקר',
          startTime: '07:00',
          endTime: '15:00',
          order: 1,
          active: true,
        },
      ],
      apls: [
        {
          _id: aplId,
          departmentId: DEPT,
          name: 'בקרים',
          color: '#000',
          order: 1,
          active: true,
          eligibleUserIds: [userId1.toString()],
        },
      ],
      users: [
        {
          _id: userId1,
          firstName: 'דנה',
          lastName: 'לוי',
          isActive: true,
          departments: [{ departmentId: DEPT }],
        },
      ],
    });

    const out = await aiScheduleSuggestImpl(
      { departmentId: DEPT, weekStart: WEEK_START, weekEnd: WEEK_END },
      authenticatedCtx([Permission.SHIFTS_MANAGE]),
    );

    expect(out.length).toBeGreaterThan(0);
    out.forEach((s) => {
      expect(s.aplId).toBe(aplId.toString());
      expect(s.shiftTypeId).toBe(shiftTypeId.toString());
      expect(s.userId).toBe(userId1.toString());
      expect(s.shiftTypeName).toBe('בוקר');
      expect(s.aplName).toBe('בקרים');
      expect(s.startTime).toBe('07:00');
      expect(s.endTime).toBe('15:00');
    });
  });

  it('honors a "prefer" preference: prefers user who marked the slot positively', async () => {
    setupCollections({
      shiftTypes: [
        {
          _id: shiftTypeId,
          departmentId: DEPT,
          name: 'בוקר',
          startTime: '07:00',
          endTime: '15:00',
          order: 1,
          active: true,
        },
      ],
      apls: [
        {
          _id: aplId,
          departmentId: DEPT,
          name: 'בקרים',
          order: 1,
          active: true,
          eligibleUserIds: [userId1.toString(), userId2.toString()],
        },
      ],
      users: [
        {
          _id: userId1,
          firstName: 'דנה',
          isActive: true,
          departments: [{ departmentId: DEPT }],
        },
        {
          _id: userId2,
          firstName: 'אבי',
          isActive: true,
          departments: [{ departmentId: DEPT }],
        },
      ],
      preferences: [
        {
          _id: new ObjectId(),
          userId: userId2.toString(),
          departmentId: DEPT,
          weekStartDate: WEEK_START,
          entries: [
            {
              dayOfWeek: 0,
              shiftTypeId: shiftTypeId.toString(),
              aplId: aplId.toString(),
              status: 'prefer',
              rank: 1,
            },
          ],
        },
      ],
    });

    const out = await aiScheduleSuggestImpl(
      { departmentId: DEPT, weekStart: WEEK_START, weekEnd: WEEK_END },
      authenticatedCtx([Permission.SHIFTS_MANAGE]),
    );

    const sundaySuggestion = out.find((s) => s.date === '2026-05-17');
    expect(sundaySuggestion).toBeDefined();
    expect(sundaySuggestion!.userId).toBe(userId2.toString());
    expect(sundaySuggestion!.reason).toMatch(/חיובית/);
  });

  it('skips users who marked the slot "unavailable"', async () => {
    setupCollections({
      shiftTypes: [
        {
          _id: shiftTypeId,
          departmentId: DEPT,
          name: 'בוקר',
          startTime: '07:00',
          endTime: '15:00',
          order: 1,
          active: true,
        },
      ],
      apls: [
        {
          _id: aplId,
          departmentId: DEPT,
          name: 'בקרים',
          order: 1,
          active: true,
          eligibleUserIds: [userId1.toString()],
        },
      ],
      users: [
        {
          _id: userId1,
          firstName: 'דנה',
          isActive: true,
          departments: [{ departmentId: DEPT }],
        },
      ],
      preferences: [
        {
          _id: new ObjectId(),
          userId: userId1.toString(),
          departmentId: DEPT,
          weekStartDate: WEEK_START,
          entries: Array.from({ length: 7 }).map((_, dow) => ({
            dayOfWeek: dow,
            shiftTypeId: shiftTypeId.toString(),
            aplId: aplId.toString(),
            status: 'unavailable',
          })),
        },
      ],
    });

    const out = await aiScheduleSuggestImpl(
      { departmentId: DEPT, weekStart: WEEK_START, weekEnd: WEEK_END },
      authenticatedCtx([Permission.SHIFTS_MANAGE]),
    );

    expect(out).toEqual([]);
  });
});
