'use client';

/**
 * Import Events From Planning modal.
 *
 * Opens from the External Broadcasts page header ("ייבא אירועים מתכנונית").
 * Loads broadcast events in the chosen date range, mirrors the planning
 * page columns (שבוע / יום / תאריך / שעה / KO/TO / ענף / ליגה / שלב /
 * מארחת / אורחת / ערוץ / ערוץ מקביל / 4K / חי / סיום / הערות), exposes
 * column-driven filters + a free-text search, supports row checkboxes
 * with select-all, and runs the
 * `importBroadcastEventsToExternalBroadcasts` mutation on confirm.
 *
 * Importing is non-destructive — it only flips
 * `customData.importedFromPlanning = true` on each selected event so it
 * starts appearing in the External Broadcasts list. No planning fields
 * are touched.
 *
 * The modal respects RTL and does NOT use horizontal scroll: the
 * planning columns are dense, so they're wrapped in Ant Design's
 * built-in horizontal scroll only inside the table (not the modal
 * body), and a `tableLayout="fixed"` keeps things tidy on narrow
 * screens.
 */
import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery } from '@apollo/client';
import { ImportOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { GET_BROADCAST_EVENTS } from '@/graphql/queries';
import { IMPORT_BROADCAST_EVENTS_TO_EXTERNAL_BROADCASTS } from '@/graphql/mutations';
import { isImportedIntoExternalBroadcasts } from '@/utils/externalBroadcastDomain';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface PlanningEventRow {
  id: string;
  title?: string;
  startTime: string;
  endTime?: string;
  koTime?: string;
  contentType?: string;
  sport?: string;
  league?: string;
  stage?: string;
  homeTeam?: string;
  awayTeam?: string;
  channel?: string;
  parallelChannel?: string;
  channel1_4k?: boolean;
  live?: boolean;
  notes?: string;
  metadata?: any;
}

interface ImportEventsFromPlanningModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const ISRAELI_WEEKDAYS = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
];

function getIsraeliWeekNumber(d: Dayjs): number {
  // Saturday is week-end day in Israel. Cheap & good-enough mirror of
  // the planning page's `getIsraeliWeekNumber`.
  return d.week();
}

export const ImportEventsFromPlanningModal: React.FC<ImportEventsFromPlanningModalProps> = ({
  open,
  onClose,
  onImported,
}) => {
  const { message: messageApi } = App.useApp();

  // Default range: the upcoming 2 weeks. Mirrors the operator's most
  // common "what's coming up" intent.
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('day'),
    dayjs().add(2, 'week').endOf('day'),
  ]);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [sportFilter, setSportFilter] = useState<string[]>([]);
  const [leagueFilter, setLeagueFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [liveOnly, setLiveOnly] = useState<boolean | null>(null);
  const [hideAlreadyImported, setHideAlreadyImported] = useState(true);

  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);

  const { data, loading, refetch } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: range[0].startOf('day').toISOString(),
      endDate: range[1].endOf('day').toISOString(),
    },
    fetchPolicy: 'cache-and-network',
    skip: !open,
  });

  const [importEvents, { loading: importing }] = useMutation(
    IMPORT_BROADCAST_EVENTS_TO_EXTERNAL_BROADCASTS,
  );

  const allEvents: PlanningEventRow[] = useMemo(() => {
    return (data?.broadcastEvents || []) as PlanningEventRow[];
  }, [data]);

  // Distinct values for the per-column dropdowns. Same approach as the
  // planning page so the option lists stay consistent.
  const filterOptions = useMemo(() => {
    const channels = new Set<string>();
    const sports = new Set<string>();
    const leagues = new Set<string>();
    const stages = new Set<string>();
    const teams = new Set<string>();
    for (const e of allEvents) {
      if (e.channel) channels.add(e.channel);
      if (e.sport) sports.add(e.sport);
      if (e.contentType) sports.add(e.contentType);
      if (e.league) leagues.add(e.league);
      if (e.stage) stages.add(e.stage);
      if (e.homeTeam) teams.add(e.homeTeam);
      if (e.awayTeam) teams.add(e.awayTeam);
    }
    return {
      channels: Array.from(channels).sort(),
      sports: Array.from(sports).sort(),
      leagues: Array.from(leagues).sort(),
      stages: Array.from(stages).sort(),
      teams: Array.from(teams).sort(),
    };
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter((e) => {
      if (hideAlreadyImported && isImportedIntoExternalBroadcasts(e)) return false;
      if (channelFilter.length > 0 && !channelFilter.includes(e.channel || ''))
        return false;
      if (sportFilter.length > 0) {
        const s = e.sport || e.contentType || '';
        if (!sportFilter.includes(s)) return false;
      }
      if (leagueFilter.length > 0 && !leagueFilter.includes(e.league || ''))
        return false;
      if (stageFilter.length > 0 && !stageFilter.includes(e.stage || ''))
        return false;
      if (teamFilter.length > 0) {
        const inTeams =
          teamFilter.includes(e.homeTeam || '') ||
          teamFilter.includes(e.awayTeam || '');
        if (!inTeams) return false;
      }
      if (liveOnly === true && !e.live) return false;
      if (liveOnly === false && e.live) return false;
      if (q) {
        const blob = [
          e.title,
          e.homeTeam,
          e.awayTeam,
          e.channel,
          e.parallelChannel,
          e.league,
          e.stage,
          e.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [
    allEvents,
    search,
    channelFilter,
    sportFilter,
    leagueFilter,
    stageFilter,
    teamFilter,
    liveOnly,
    hideAlreadyImported,
  ]);

  // Mirror of the planning page's full table columns. Kept order +
  // titles in sync so the operator sees the exact same layout they're
  // used to from `/broadcast-planning`.
  const columns: ColumnsType<PlanningEventRow> = [
    {
      title: 'שבוע',
      key: 'week',
      width: 60,
      render: (_: any, r) => getIsraeliWeekNumber(dayjs(r.startTime)),
    },
    {
      title: 'יום',
      key: 'day',
      width: 80,
      render: (_: any, r) => ISRAELI_WEEKDAYS[dayjs(r.startTime).day()],
    },
    {
      title: 'תאריך',
      key: 'date',
      width: 90,
      render: (_: any, r) => dayjs(r.startTime).format('DD/MM/YYYY'),
    },
    {
      title: 'שעה',
      key: 'time',
      width: 70,
      render: (_: any, r) => dayjs(r.startTime).format('HH:mm'),
    },
    {
      title: 'KO / TO',
      key: 'koTime',
      width: 80,
      render: (_: any, r) =>
        r.koTime ? dayjs(r.koTime).format('HH:mm') : '-',
    },
    {
      title: 'ענף',
      key: 'sport',
      width: 100,
      render: (_: any, r) => r.sport || r.contentType || '-',
    },
    {
      title: 'ליגה',
      key: 'league',
      width: 140,
      render: (_: any, r) => r.league || '-',
    },
    {
      title: 'שלב',
      key: 'stage',
      width: 100,
      render: (_: any, r) => r.stage || '-',
    },
    {
      title: 'מארחת',
      key: 'homeTeam',
      width: 140,
      render: (_: any, r) => r.homeTeam || r.title || '-',
    },
    {
      title: 'אורחת',
      key: 'awayTeam',
      width: 140,
      render: (_: any, r) => r.awayTeam || '-',
    },
    {
      title: 'ערוץ',
      key: 'channel',
      width: 110,
      render: (_: any, r) => r.channel || '-',
    },
    {
      title: 'ערוץ מקביל',
      key: 'parallelChannel',
      width: 110,
      render: (_: any, r) => r.parallelChannel || '-',
    },
    {
      title: '4K',
      key: 'channel1_4k',
      width: 60,
      render: (_: any, r) =>
        r.channel1_4k ? <Tag color="green">כן</Tag> : <Tag>לא</Tag>,
    },
    {
      title: 'ישיר',
      key: 'live',
      width: 70,
      render: (_: any, r) =>
        r.live ? <Tag color="red">חי</Tag> : <Tag>מוקלט</Tag>,
    },
    {
      title: 'סיום',
      key: 'endTime',
      width: 70,
      render: (_: any, r) =>
        r.endTime ? dayjs(r.endTime).format('HH:mm') : '-',
    },
    {
      title: 'הערות',
      key: 'notes',
      ellipsis: true,
      render: (_: any, r) => r.notes || '-',
    },
    {
      title: 'מצב',
      key: 'imported',
      width: 90,
      render: (_: any, r) =>
        isImportedIntoExternalBroadcasts(r) ? (
          <Tag color="blue">כבר יובא</Tag>
        ) : (
          <Tag>לא יובא</Tag>
        ),
    },
  ];

  const handleImport = async () => {
    if (selectedIds.length === 0) {
      messageApi.warning('יש לבחור לפחות אירוע אחד');
      return;
    }
    try {
      const res = await importEvents({
        variables: { eventIds: selectedIds.map((id) => String(id)) },
      });
      const newlyImported = res?.data?.importBroadcastEventsToExternalBroadcasts ?? 0;
      const alreadyImported = selectedIds.length - newlyImported;
      const parts: string[] = [];
      if (newlyImported > 0) parts.push(`${newlyImported} אירועים יובאו`);
      if (alreadyImported > 0) parts.push(`${alreadyImported} כבר היו מיובאים`);
      messageApi.success(parts.join(' • ') || 'הייבוא הושלם');
      setSelectedIds([]);
      onImported();
      onClose();
    } catch (err: any) {
      messageApi.error(`שגיאה בייבוא: ${err.message}`);
    }
  };

  const handleClose = () => {
    setSelectedIds([]);
    onClose();
  };

  const selectableIds = filteredEvents.map((e) => e.id);
  const allSelectedInFilter =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id));
  const someSelectedInFilter =
    selectableIds.some((id) => selectedIds.includes(id)) && !allSelectedInFilter;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const merged = new Set<React.Key>([...selectedIds, ...selectableIds]);
      setSelectedIds(Array.from(merged));
    } else {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(String(id))));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width="92vw"
      style={{ top: 24, direction: 'rtl' }}
      title={
        <Space>
          <ImportOutlined />
          <span>ייבוא אירועים מהתכנונית</span>
        </Space>
      }
      footer={
        <Space>
          <Text type="secondary">
            נבחרו: <strong>{selectedIds.length}</strong>
          </Text>
          <Button onClick={handleClose}>סגור</Button>
          <Button
            type="primary"
            icon={<ImportOutlined />}
            loading={importing}
            disabled={selectedIds.length === 0}
            onClick={handleImport}
          >
            ייבא {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Filters row 1 — date range + search + live + already-imported toggle */}
        <Space wrap size={[8, 8]}>
          <RangePicker
            value={range}
            onChange={(v) =>
              v && v[0] && v[1] && setRange([v[0], v[1]] as [Dayjs, Dayjs])
            }
            format="DD/MM/YYYY"
          />
          <Input
            placeholder="חיפוש חופשי (שם, ערוץ, ליגה, קבוצה...)"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            placeholder="ישיר / מוקלט"
            value={liveOnly === null ? undefined : liveOnly ? 'live' : 'recorded'}
            onChange={(v) => {
              if (!v) setLiveOnly(null);
              else if (v === 'live') setLiveOnly(true);
              else setLiveOnly(false);
            }}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'live', label: 'חי בלבד' },
              { value: 'recorded', label: 'מוקלט בלבד' },
            ]}
          />
          <Space>
            <Switch
              size="small"
              checked={hideAlreadyImported}
              onChange={setHideAlreadyImported}
            />
            <Text>הסתר אירועים שכבר יובאו</Text>
          </Space>
        </Space>

        {/* Filters row 2 — per-column multi-selects */}
        <Space wrap size={[8, 8]}>
          <Select
            mode="multiple"
            placeholder="ערוץ"
            value={channelFilter}
            onChange={setChannelFilter}
            options={filterOptions.channels.map((v) => ({ value: v, label: v }))}
            style={{ minWidth: 180, maxWidth: 280 }}
            maxTagCount="responsive"
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="ענף"
            value={sportFilter}
            onChange={setSportFilter}
            options={filterOptions.sports.map((v) => ({ value: v, label: v }))}
            style={{ minWidth: 160, maxWidth: 240 }}
            maxTagCount="responsive"
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="ליגה"
            value={leagueFilter}
            onChange={setLeagueFilter}
            options={filterOptions.leagues.map((v) => ({ value: v, label: v }))}
            style={{ minWidth: 180, maxWidth: 280 }}
            maxTagCount="responsive"
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="שלב"
            value={stageFilter}
            onChange={setStageFilter}
            options={filterOptions.stages.map((v) => ({ value: v, label: v }))}
            style={{ minWidth: 140, maxWidth: 220 }}
            maxTagCount="responsive"
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="קבוצה"
            value={teamFilter}
            onChange={setTeamFilter}
            options={filterOptions.teams.map((v) => ({ value: v, label: v }))}
            style={{ minWidth: 200, maxWidth: 320 }}
            maxTagCount="responsive"
            allowClear
            showSearch
            filterOption={(input, option) =>
              String(option?.label || '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </Space>

        {/* Select-all + result count + refresh */}
        <Space style={{ marginTop: 4 }} align="center">
          <Checkbox
            checked={allSelectedInFilter}
            indeterminate={someSelectedInFilter}
            onChange={(e) => handleSelectAll(e.target.checked)}
            disabled={loading || filteredEvents.length === 0}
          >
            בחר הכל ({filteredEvents.length})
          </Checkbox>
          <Button size="small" onClick={() => refetch()} loading={loading}>
            רענן
          </Button>
          <Text type="secondary" style={{ marginInlineStart: 8 }}>
            סה"כ אירועים בטווח: {allEvents.length}
          </Text>
        </Space>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Table<PlanningEventRow>
            rowKey="id"
            dataSource={filteredEvents}
            columns={columns}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 'max-content', y: '50vh' }}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys),
              preserveSelectedRowKeys: true,
            }}
            tableLayout="auto"
          />
        )}
      </div>
    </Modal>
  );
};

export default ImportEventsFromPlanningModal;
