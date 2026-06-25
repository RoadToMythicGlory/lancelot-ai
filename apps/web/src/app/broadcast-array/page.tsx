'use client';

/**
 * "מערך השידורים" (Broadcast Array Grid) page.
 *
 * Excel-like grid styled the same way the BatchEventCreator modal in
 * broadcast-planning is built: a real <table> with `table-layout:
 * fixed`. The container has `overflow-x: hidden` so columns share the
 * available width — NO horizontal scroll bar.
 *
 * Two-way sync: writes go through the same
 * `UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA` mutation as the modal, and
 * pre-fills cells from the same `metadata.departments.broadcastArray`
 * shape — so a change saved here is immediately visible in the modal
 * (and vice versa) once the apollo cache refreshes.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { ensureAvailabilityOk } from '@/components/shifts/availabilityWarning';
import {
  App,
  Button,
  Card,
  DatePicker,
  Divider,
  Input,
  InputRef,
  Radio,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  FilterOutlined,
  ImportOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import ImportExcelModal from './ImportExcelModal';
import dayjs, { Dayjs } from 'dayjs';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import {
  GET_ASSIGNMENT_FORM_CONFIG,
  GET_BROADCAST_EVENTS,
  GET_EXTERNAL_BROADCAST_REFERENCE,
  GET_USERS,
} from '@/graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '@/graphql/mutations';

const { Title, Text } = Typography;

interface CrewAssignment {
  role: string;
  userId?: string | null;
  userName: string;
}

// Custom-name prefix sentinel. Anything in the cell's value array
// starting with this is treated as a custom (off-system) crew member;
// the suffix is the display name to send to the backend.
const CUSTOM_PREFIX = '__ext__:';
const customValue = (name: string) => `${CUSTOM_PREFIX}${name}`;
const isCustomValue = (v: string) => v.startsWith(CUSTOM_PREFIX);
const customNameOf = (v: string) => v.slice(CUSTOM_PREFIX.length);

// Control-room options are now fetched from the shared
// `externalBroadcastReference` collection (kind: 'controlRoom'). The
// same query is used by BroadcastArrayModal, External Broadcasts,
// MCR, and reports — admins manage the list once in Settings →
// "נתוני עזר → חדרי בקרה".

// A resolved role/column rendered in the grid. Built either from the
// server-side AssignmentFormConfig.columns[] (preferred) or from the
// hard-coded FALLBACK_ROLE_COLUMNS below for the brief window before
// the seed runs / config is empty.
interface RoleColumn {
  key: string;
  label: string;
  /** Hebrew role string written into crewAssignments[] — must match
   * what BroadcastArrayModal reads back. */
  hebrewRole: string;
  allowedDepartmentCodes: string[];
  allowedUserIds: string[];
}

// Hard-coded fallback used only when no AssignmentFormConfig.columns
// have been seeded yet. Matches the historical Broadcast Array layout
// so the page never appears empty.
const FALLBACK_ROLE_COLUMNS: RoleColumn[] = [
  {
    key: 'editor',
    label: 'עורך',
    hebrewRole: 'עורך',
    allowedDepartmentCodes: [
      'CONTENT_EDIT',
      'Visuals-VideoEditors',
      'NewMedia-Editors',
      'News-Editors',
    ],
    allowedUserIds: [],
  },
  {
    key: 'producer',
    label: 'מפיק',
    hebrewRole: 'מפיק',
    allowedDepartmentCodes: ['PROD', 'NewMedia-Producers', 'News-Producers'],
    allowedUserIds: [],
  },
  {
    key: 'vtr',
    label: 'איש VTR',
    hebrewRole: 'איש VTR',
    allowedDepartmentCodes: ['VTR', 'Production-VTR'],
    allowedUserIds: [],
  },
  {
    key: 'broadcastTech',
    label: 'טכנאי / במאי',
    hebrewRole: 'טכנאי שידור',
    allowedDepartmentCodes: ['DIR', 'Production-Directors'],
    allowedUserIds: [],
  },
  {
    key: 'anchor',
    label: 'שדר',
    hebrewRole: 'שדר',
    allowedDepartmentCodes: ['COMMENT', 'Production-Commentators'],
    allowedUserIds: [],
  },
  {
    key: 'analyst',
    label: 'אנליסט',
    hebrewRole: 'אנליסט',
    allowedDepartmentCodes: ['COMMENT', 'Production-Commentators'],
    allowedUserIds: [],
  },
  {
    key: 'sidelineAnchor',
    label: 'שדר קווים',
    hebrewRole: 'שדר קוים',
    allowedDepartmentCodes: ['SOUND', 'Production-Soundmen'],
    allowedUserIds: [],
  },
];

interface RowDraft {
  eventId: string;
  title: string;
  date: Dayjs | null;
  channel: string;
  location: string;
  // cell value: string[] of user IDs (real) mixed with `__ext__:<name>`
  // markers for off-system crew. Order matters for display.
  cells: Record<string, string[]>;
  specialInstructions: string;
  dirty: boolean;
}

function emptyCells(roleColumns: RoleColumn[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const role of roleColumns) out[role.key] = [];
  return out;
}

function parseCrewAssignments(
  assignments: CrewAssignment[] | undefined,
  roleColumns: RoleColumn[],
  knownUsersByCol: Record<string, Set<string>>,
): Record<string, string[]> {
  const out = emptyCells(roleColumns);
  if (!Array.isArray(assignments)) return out;
  for (const a of assignments) {
    const col = roleColumns.find((r) => r.hebrewRole === a?.role);
    if (!col) continue;
    if (a?.userId && knownUsersByCol[col.key]?.has(a.userId)) {
      out[col.key].push(a.userId);
    } else if (a?.userName) {
      // No user id, or the user is no longer assigned to a department
      // that feeds this column — surface them as a custom-name tag so
      // the operator doesn't see the assignment vanish.
      out[col.key].push(customValue(a.userName));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Role cell with built-in "external person" option in the dropdown
// ---------------------------------------------------------------------------

interface RoleCellSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  users: Array<{ id: string; label: string }>;
  disabled?: boolean;
}

const RoleCellSelect: React.FC<RoleCellSelectProps> = ({
  value,
  onChange,
  users,
  disabled,
}) => {
  const [externalName, setExternalName] = useState('');
  const inputRef = useRef<InputRef | null>(null);

  // Build option list: real users + every custom value already chosen
  // (so the Select can render its tags) + the "+ external person"
  // sentinel option that lives at the bottom.
  const baseOptions = users.map((u) => ({ value: u.id, label: u.label }));
  const customOptions = value
    .filter(isCustomValue)
    .map((v) => ({ value: v, label: customNameOf(v) }));
  const options = [...baseOptions, ...customOptions];

  const addExternal = () => {
    const name = externalName.trim();
    if (!name) return;
    const next = customValue(name);
    if (value.includes(next)) {
      setExternalName('');
      return;
    }
    onChange([...value, next]);
    setExternalName('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <Select
      mode="multiple"
      size="small"
      style={{ width: '100%' }}
      placeholder="בחר"
      value={value}
      onChange={(vals) => onChange(vals as string[])}
      options={options}
      showSearch
      optionFilterProp="label"
      maxTagCount="responsive"
      disabled={disabled}
      // Tag color: highlight custom names so they're visually distinct
      // from system users in the chip row.
      tagRender={(props) => {
        const isExt = typeof props.value === 'string' && isCustomValue(props.value);
        return (
          <Tag
            closable={!disabled}
            onClose={props.onClose}
            color={isExt ? 'gold' : undefined}
            style={{ marginInlineEnd: 3 }}
          >
            {isExt ? customNameOf(String(props.value)) : props.label}
          </Tag>
        );
      }}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '4px 0' }} />
          <div
            style={{ padding: '4px 8px', display: 'flex', gap: 4 }}
            // Stop the popup from closing on input clicks
            onMouseDown={(e) => e.preventDefault()}
          >
            <Input
              ref={inputRef}
              size="small"
              placeholder="שם של איש צוות חיצוני"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              onPressEnter={addExternal}
              disabled={disabled}
            />
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={addExternal}
              disabled={disabled || !externalName.trim()}
            >
              חיצוני
            </Button>
          </div>
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function BroadcastArrayPageInner() {
  const { message, modal } = App.useApp();
  const apolloClient = useApolloClient();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.BROADCAST_ARRAY_MANAGE);

  // View mode + anchor date — together they define the visible range.
  // - day:   anchor → [anchor, anchor]
  // - week:  anchor → [startOf('week'), endOf('week')]   (Sun → Sat per dayjs default)
  // - month: anchor → [startOf('month'), endOf('month')]
  type ViewMode = 'day' | 'week' | 'month';
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState<Dayjs>(() => dayjs());

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    if (viewMode === 'day') {
      return {
        rangeStart: anchorDate.startOf('day'),
        rangeEnd: anchorDate.endOf('day'),
        rangeLabel: anchorDate.format('dddd · DD/MM/YYYY'),
      };
    }
    if (viewMode === 'month') {
      return {
        rangeStart: anchorDate.startOf('month'),
        rangeEnd: anchorDate.endOf('month'),
        rangeLabel: anchorDate.format('MMMM YYYY'),
      };
    }
    const start = anchorDate.startOf('week');
    const end = anchorDate.endOf('week');
    return {
      rangeStart: start,
      rangeEnd: end,
      rangeLabel: `שבוע ${start.format('DD/MM')} - ${end.format('DD/MM/YYYY')}`,
    };
  }, [viewMode, anchorDate]);

  const shiftRange = (direction: 1 | -1) => {
    const unit = viewMode; // 'day' | 'week' | 'month' map directly to dayjs units
    setAnchorDate((prev) => prev.add(direction, unit));
  };

  const [rows, setRows] = useState<RowDraft[]>([]);

  // ---- Filters --------------------------------------------------------------
  const [searchText, setSearchText] = useState('');
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);
  // 'all' | 'unassigned' | 'fully' | 'partial' | 'dirty'
  const [assignmentFilter, setAssignmentFilter] =
    useState<'all' | 'unassigned' | 'fully' | 'partial' | 'dirty'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Drive the visible columns from the AssignmentFormConfig the admin
  // edits in Settings > Forms. Falls back to FALLBACK_ROLE_COLUMNS
  // while the seed hasn't run or no columns are configured yet.
  const { data: formCfgData } = useQuery(GET_ASSIGNMENT_FORM_CONFIG, {
    variables: { formKey: 'broadcastArray' },
    fetchPolicy: 'cache-and-network',
  });

  const roleColumns: RoleColumn[] = useMemo(() => {
    const cfg = formCfgData?.assignmentFormConfig;
    const cols: any[] = cfg?.columns || [];
    if (!cols.length) return FALLBACK_ROLE_COLUMNS;
    const sorted = [...cols].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sorted.map((c, i) => ({
      key: c.key || `col_${i}`,
      label: c.hebrewLabel || c.englishLabel || c.key || '—',
      hebrewRole: c.hebrewLabel || c.key || '',
      allowedDepartmentCodes: Array.isArray(c.allowedDepartmentCodes)
        ? c.allowedDepartmentCodes
        : [],
      allowedUserIds: Array.isArray(c.allowedUserIds) ? c.allowedUserIds : [],
    }));
  }, [formCfgData]);

  // One query for all active users — we filter per-column in memory
  // instead of issuing a query per role. Avoids the rules-of-hooks
  // issue from the previous implementation and keeps the network
  // round-trip count constant as columns are added.
  const { data: usersData } = useQuery(GET_USERS, {
    variables: { isActive: true },
    fetchPolicy: 'cache-and-network',
  });

  const allUsers: any[] = useMemo(() => usersData?.users || [], [usersData]);

  // Shared control-rooms list (admins manage in Settings → נתוני עזר).
  const { data: controlRoomsData } = useQuery(GET_EXTERNAL_BROADCAST_REFERENCE, {
    variables: { kind: 'controlRoom', includeInactive: false },
    fetchPolicy: 'cache-first',
  });
  const locationOptions: { value: string; label: string }[] = useMemo(
    () =>
      ((controlRoomsData?.externalBroadcastReference || []) as any[]).map(
        (r) => ({ value: r.name, label: r.name }),
      ),
    [controlRoomsData],
  );

  // Build a quick `{ userId -> Set(deptCode) }` index so per-column
  // filtering is cheap even with hundreds of users.
  const userDeptIndex = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const u of allUsers) {
      const depts: string[] = Array.isArray(u.departments)
        ? u.departments.map((d: any) => String(d?.departmentId || '')).filter(Boolean)
        : [];
      out.set(u.id, new Set(depts));
    }
    return out;
  }, [allUsers]);

  const userLabel = (u: any): string =>
    u.displayName ||
    `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
    u.email ||
    u.id;

  const usersByRole = useMemo(() => {
    const out: Record<string, Array<{ id: string; label: string }>> = {};
    for (const role of roleColumns) {
      const allowedDepts = new Set(role.allowedDepartmentCodes);
      const allowedUserIds = new Set(role.allowedUserIds);
      const seen = new Set<string>();
      const list: Array<{ id: string; label: string }> = [];
      for (const u of allUsers) {
        if (seen.has(u.id)) continue;
        const userDepts = userDeptIndex.get(u.id) || new Set<string>();
        let include = allowedUserIds.has(u.id);
        if (!include && allowedDepts.size > 0) {
          userDepts.forEach((d) => {
            if (allowedDepts.has(d)) include = true;
          });
        }
        if (include) {
          seen.add(u.id);
          list.push({ id: u.id, label: userLabel(u) });
        }
      }
      list.sort((a, b) => a.label.localeCompare(b.label, 'he'));
      out[role.key] = list;
    }
    return out;
  }, [roleColumns, allUsers, userDeptIndex]);

  const knownUsersByDept = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const key of Object.keys(usersByRole)) {
      out[key] = new Set(usersByRole[key].map((u) => u.id));
    }
    return out;
  }, [usersByRole]);

  const {
    data: eventsData,
    loading: eventsLoading,
    refetch: refetchEvents,
  } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: rangeStart.startOf('day').toISOString(),
      endDate: rangeEnd.endOf('day').toISOString(),
    },
    fetchPolicy: 'cache-and-network',
  });

  const events: any[] = useMemo(() => eventsData?.broadcastEvents || [], [eventsData]);

  // Refresh local drafts whenever the events list, the column layout,
  // or the known user sets change. Dropping local edits when the user
  // navigates dates matches the BatchEventCreator pattern.
  useEffect(() => {
    const next: RowDraft[] = events.map((event) => {
      const ba = event?.metadata?.departments?.broadcastArray;
      const assignments: CrewAssignment[] = ba?.crewAssignments || [];
      return {
        eventId: event.id,
        title: event.hebrewTitle || event.title || 'אירוע ללא כותרת',
        date: event.startTime ? dayjs(event.startTime) : null,
        channel: event.channel || '',
        location:
          ba?.['מקוםשידור'] ||
          event.metadata?.departments?.broadcastArray?.location ||
          '',
        cells: parseCrewAssignments(assignments, roleColumns, knownUsersByDept),
        specialInstructions: ba?.specialInstructions || '',
        dirty: false,
      };
    });
    setRows(next);
  }, [events, roleColumns, knownUsersByDept]);

  const updateRow = (eventId: string, patch: Partial<RowDraft>) => {
    setRows((prev) =>
      prev.map((r) => (r.eventId === eventId ? { ...r, ...patch, dirty: true } : r)),
    );
  };

  const updateCell = (eventId: string, roleKey: string, next: string[]) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.eventId !== eventId) return r;
        return { ...r, cells: { ...r.cells, [roleKey]: next }, dirty: true };
      }),
    );
  };

  const [updateDepartmentData, { loading: saving }] = useMutation(
    UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA,
    {
      // Refetching the event list refreshes the modal's apollo cache so
      // the two surfaces stay in sync. The flight board pollInterval
      // already handles its own refresh.
      refetchQueries: ['GetBroadcastEvents', 'GetBroadcastEvent'],
    },
  );

  const handleSaveRow = async (row: RowDraft) => {
    if (!canWrite) {
      message.error('אין לך הרשאת עריכה');
      return;
    }

    const crewAssignments: CrewAssignment[] = [];
    for (const role of roleColumns) {
      const cellValues = row.cells[role.key] || [];
      const users = usersByRole[role.key] || [];
      for (const v of cellValues) {
        if (isCustomValue(v)) {
          crewAssignments.push({
            role: role.hebrewRole,
            userId: null,
            userName: customNameOf(v),
          });
        } else {
          const found = users.find((u) => u.id === v);
          crewAssignments.push({
            role: role.hebrewRole,
            userId: v,
            userName: found?.label || '',
          });
        }
      }
    }

    // Preflight: warn the operator if any of the internal users they're
    // about to save have marked themselves unavailable for the event's
    // time window. External (custom-name) crew members are skipped
    // automatically because they have no `userId`.
    const internalUserIds = crewAssignments
      .map((a) => a.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (internalUserIds.length > 0) {
      const event = events.find((e) => e.id === row.eventId);
      const ok = await ensureAvailabilityOk(apolloClient, modal, {
        userIds: internalUserIds,
        startTime: event?.startTime || row.date?.toISOString() || null,
        endTime: event?.endTime || null,
      });
      if (!ok) return;
    }

    try {
      await updateDepartmentData({
        variables: {
          eventId: row.eventId,
          department: 'broadcastArray',
          data: {
            broadcastArray: {
              crewAssignments,
              specialInstructions: row.specialInstructions || '',
              'מקוםשידור': row.location || '',
              setupTime: null,
              breakdownTime: null,
            },
            customData: {
              'מקוםשידור': row.location || '',
              notApplicable: false,
            },
          },
        },
      });
      setRows((prev) =>
        prev.map((r) => (r.eventId === row.eventId ? { ...r, dirty: false } : r)),
      );
      message.success('השורה נשמרה');
    } catch (err: any) {
      message.error(`שמירה נכשלה: ${err?.message || 'שגיאה לא ידועה'}`);
    }
  };

  const dirtyCount = rows.filter((r) => r.dirty).length;

  // ---- Derived filter sources -----------------------------------------------
  // All channels present in the current dataset — keeps the filter
  // dropdown contextual (no point offering channels that aren't shown).
  const channelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.channel) set.add(r.channel);
    }
    return Array.from(set)
      .sort()
      .map((c) => ({ label: c, value: c }));
  }, [rows]);

  // Flatten all assignable users across roles for the "person" filter.
  const allEmployeeOptions = useMemo(() => {
    const seen = new Map<string, string>(); // id -> label
    for (const role of roleColumns) {
      for (const u of usersByRole[role.key] || []) {
        if (!seen.has(u.id)) seen.set(u.id, u.label);
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ value: id, label }));
  }, [roleColumns, usersByRole]);

  // Apply smart filters.
  const visibleRows = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      if (text) {
        const hay = `${r.title} ${r.channel} ${r.location}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      if (channelFilter.length && !channelFilter.includes(r.channel)) return false;
      if (locationFilter.length && !locationFilter.includes(r.location)) return false;
      if (employeeFilter.length) {
        const hasAny = roleColumns.some((role) =>
          (r.cells[role.key] || []).some((v) => !isCustomValue(v) && employeeFilter.includes(v)),
        );
        if (!hasAny) return false;
      }
      if (assignmentFilter !== 'all') {
        let assigned = 0;
        let total = 0;
        for (const role of roleColumns) {
          total++;
          if ((r.cells[role.key] || []).length > 0) assigned++;
        }
        if (assignmentFilter === 'unassigned' && assigned !== 0) return false;
        if (assignmentFilter === 'fully' && assigned !== total) return false;
        if (assignmentFilter === 'partial' && (assigned === 0 || assigned === total))
          return false;
        if (assignmentFilter === 'dirty' && !r.dirty) return false;
      }
      return true;
    });
  }, [
    rows,
    roleColumns,
    searchText,
    channelFilter,
    locationFilter,
    employeeFilter,
    assignmentFilter,
  ]);

  const activeFilterCount =
    (searchText.trim() ? 1 : 0) +
    (channelFilter.length ? 1 : 0) +
    (locationFilter.length ? 1 : 0) +
    (employeeFilter.length ? 1 : 0) +
    (assignmentFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setSearchText('');
    setChannelFilter([]);
    setLocationFilter([]);
    setEmployeeFilter([]);
    setAssignmentFilter('all');
  };

  const handleSaveAll = async () => {
    if (!canWrite) {
      message.error('אין לך הרשאת עריכה');
      return;
    }
    const dirty = rows.filter((r) => r.dirty);
    let ok = 0;
    let fail = 0;
    for (const row of dirty) {
      try {
        await handleSaveRow(row);
        ok++;
      } catch {
        fail++;
      }
    }
    message.info(`נשמרו ${ok} שורות${fail ? `, נכשלו ${fail}` : ''}`);
  };

  return (
    <div style={{ padding: 16 }} dir="rtl">
      <Title level={3} style={{ marginBottom: 8 }}>
        מערך השידורים
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        עריכת מערך השידור עבור כל אירועי השידור בטווח התאריכים. שינוי כאן מתעדכן
        אוטומטית בחלון "מערך שידור" של האירוע.
      </Text>

      <Card
        size="small"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <Space wrap size={[12, 8]} style={{ width: '100%' }}>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { label: 'יומי', value: 'day' },
              { label: 'שבועי', value: 'week' },
              { label: 'חודשי', value: 'month' },
            ]}
          />

          {/* The prev/today/next group renders right→left in RTL: prev is
              `<` (visually leftmost in RTL flip), next is `>` etc. The
              icons correspond to direction-shift, not literal arrows. */}
          <Space.Compact>
            <Tooltip title={viewMode === 'day' ? 'יום קודם' : viewMode === 'week' ? 'שבוע קודם' : 'חודש קודם'}>
              <Button icon={<RightOutlined />} onClick={() => shiftRange(-1)} />
            </Tooltip>
            <Button onClick={() => setAnchorDate(dayjs())}>היום</Button>
            <Tooltip title={viewMode === 'day' ? 'יום הבא' : viewMode === 'week' ? 'שבוע הבא' : 'חודש הבא'}>
              <Button icon={<LeftOutlined />} onClick={() => shiftRange(1)} />
            </Tooltip>
          </Space.Compact>

          <DatePicker
            value={anchorDate}
            onChange={(d) => d && setAnchorDate(d)}
            format="DD/MM/YYYY"
            allowClear={false}
            picker={viewMode === 'month' ? 'month' : viewMode === 'week' ? 'week' : 'date'}
          />

          <Text strong style={{ marginInlineStart: 4 }}>
            {rangeLabel}
          </Text>

          <Text type="secondary">
            ({visibleRows.length}
            {visibleRows.length !== rows.length ? ` / ${rows.length}` : ''} שורות)
          </Text>

          <div style={{ flex: 1 }} />

          <Button
            icon={<FilterOutlined />}
            type={showFilters || activeFilterCount > 0 ? 'primary' : 'default'}
            ghost={showFilters && activeFilterCount === 0}
            onClick={() => setShowFilters((v) => !v)}
          >
            סינון{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => refetchEvents()}>
            רענן
          </Button>
          {canWrite && (
            <Button
              icon={<ImportOutlined />}
              onClick={() => setImportModalOpen(true)}
            >
              ייבוא מ-Excel
            </Button>
          )}
          {canWrite && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveAll}
              loading={saving}
              disabled={dirtyCount === 0}
            >
              שמור הכל {dirtyCount > 0 && `(${dirtyCount})`}
            </Button>
          )}
        </Space>

        {showFilters && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <Space wrap size={[12, 8]} style={{ width: '100%' }}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="חיפוש בכותרת, ערוץ, מיקום…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 260 }}
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="ערוץ"
                value={channelFilter}
                onChange={(v) => setChannelFilter(v as string[])}
                options={channelOptions}
                style={{ minWidth: 180 }}
                maxTagCount="responsive"
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="מקום שידור"
                value={locationFilter}
                onChange={(v) => setLocationFilter(v as string[])}
                options={locationOptions}
                style={{ minWidth: 180 }}
                maxTagCount="responsive"
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="מאויש על-ידי…"
                value={employeeFilter}
                onChange={(v) => setEmployeeFilter(v as string[])}
                options={allEmployeeOptions}
                style={{ minWidth: 220 }}
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
              />
              <Radio.Group
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
                options={[
                  { label: 'הכל', value: 'all' },
                  { label: 'ללא איוש', value: 'unassigned' },
                  { label: 'חלקי', value: 'partial' },
                  { label: 'מלא', value: 'fully' },
                  { label: 'לא נשמרו', value: 'dirty' },
                ]}
              />
              {activeFilterCount > 0 && (
                <Button type="link" onClick={clearFilters}>
                  נקה סינון
                </Button>
              )}
            </Space>
          </>
        )}
      </Card>

      {eventsLoading && rows.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div
          className="broadcast-array-grid-wrap"
          style={{
            width: '100%',
            // The critical bit: NO horizontal scroll. Columns share the
            // viewport width via `table-layout: fixed`.
            overflowX: 'hidden',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 240px)',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            background: '#fff',
          }}
        >
          <table
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            {/*
              NOTE: keep all children of <colgroup> as element nodes only.
              JSX inline comments like `<col /> {/* x *‌/}` introduce a
              literal whitespace text node between the comment and the
              previous element, which React refuses to hydrate inside a
              <colgroup>. We list one <col> per JSX line with no inline
              comments to keep the DOM strictly element-only.
            */}
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              {roleColumns.map((r) => (
                <col
                  key={r.key}
                  style={{ width: `${56 / Math.max(roleColumns.length, 1)}%` }}
                />
              ))}
              <col style={{ width: '8%' }} />
              <col style={{ width: '4%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="ba-th">#</th>
                <th className="ba-th">תאריך</th>
                <th className="ba-th">שעה</th>
                <th className="ba-th">אירוע</th>
                <th className="ba-th">מקום שידור</th>
                {roleColumns.map((role) => (
                  <th key={role.key} className="ba-th">
                    {role.label}
                  </th>
                ))}
                <th className="ba-th">הוראות</th>
                <th className="ba-th"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + roleColumns.length + 2}
                    style={{ textAlign: 'center', padding: 24, color: '#999' }}
                  >
                    {rows.length === 0
                      ? 'אין אירועים בטווח התאריכים שנבחר'
                      : 'אין שורות התואמות את הסינון הנוכחי'}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => (
                  <tr
                    key={row.eventId}
                    style={{ background: row.dirty ? '#fffbe6' : 'inherit' }}
                  >
                    <td className="ba-td ba-td--ro" style={{ textAlign: 'center' }}>
                      {index + 1}
                    </td>
                    <td className="ba-td ba-td--ro" style={{ textAlign: 'center' }}>
                      {row.date ? row.date.format('DD/MM') : '—'}
                    </td>
                    <td className="ba-td ba-td--ro" style={{ textAlign: 'center' }}>
                      {row.date ? row.date.format('HH:mm') : '—'}
                    </td>
                    <td className="ba-td ba-td--ro">
                      <div
                        title={row.title}
                        style={{
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {row.title}
                      </div>
                      {row.channel && (
                        <div style={{ fontSize: 11, color: '#888' }}>{row.channel}</div>
                      )}
                    </td>
                    <td className="ba-td">
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        value={row.location || undefined}
                        placeholder="—"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        onChange={(v) => updateRow(row.eventId, { location: v || '' })}
                        options={locationOptions}
                        disabled={!canWrite}
                      />
                    </td>
                    {roleColumns.map((role) => (
                      <td key={role.key} className="ba-td">
                        <RoleCellSelect
                          value={row.cells[role.key] || []}
                          users={usersByRole[role.key] || []}
                          disabled={!canWrite}
                          onChange={(next) => updateCell(row.eventId, role.key, next)}
                        />
                      </td>
                    ))}
                    <td className="ba-td">
                      <Input.TextArea
                        size="small"
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        value={row.specialInstructions}
                        onChange={(e) =>
                          updateRow(row.eventId, {
                            specialInstructions: e.target.value,
                          })
                        }
                        disabled={!canWrite}
                        style={{ fontSize: 12 }}
                      />
                    </td>
                    <td className="ba-td" style={{ textAlign: 'center' }}>
                      <Tooltip title="שמור שורה">
                        <Button
                          type="primary"
                          size="small"
                          icon={<SaveOutlined />}
                          onClick={() => handleSaveRow(row)}
                          disabled={!canWrite || !row.dirty}
                          loading={saving}
                        />
                      </Tooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <style jsx global>{`
        .broadcast-array-grid-wrap .ba-th {
          background: #fafafa;
          border: 1px solid #d9d9d9;
          padding: 6px 4px;
          font-weight: 600;
          font-size: 12px;
          text-align: center;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .broadcast-array-grid-wrap .ba-td {
          border: 1px solid #f0f0f0;
          padding: 4px;
          vertical-align: middle;
          font-size: 12px;
        }
        .broadcast-array-grid-wrap .ba-td--ro {
          background: #fafafa;
        }
        /* Tighten AntD multi-select tags inside narrow role cells */
        .broadcast-array-grid-wrap .ant-select-selection-overflow {
          flex-wrap: nowrap;
        }
        .broadcast-array-grid-wrap .ant-select-selection-overflow-item .ant-tag {
          max-width: 95%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      <ImportExcelModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        roleColumns={roleColumns.map((c) => ({ key: c.key, hebrewRole: c.hebrewRole }))}
        usersByRole={usersByRole}
        onApplied={() => refetchEvents()}
        canWrite={!!canWrite}
      />
    </div>
  );
}

export default function BroadcastArrayPage() {
  return (
    <ProtectedRoute requires={Permission.BROADCAST_ARRAY_VIEW}>
      <BroadcastArrayPageInner />
    </ProtectedRoute>
  );
}
