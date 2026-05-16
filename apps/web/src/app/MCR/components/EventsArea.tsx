'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import { DownloadOutlined, WifiOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import dayjs from 'dayjs';
import {
  GET_MCR_EVENTS,
  MCR_EVENT_CREATED_SUB,
  MCR_EVENT_UPDATED_SUB,
  MCR_EVENT_DELETED_SUB,
} from '@/graphql/mcrQueries';
import {
  CREATE_MCR_EVENT,
  DELETE_MCR_EVENT,
  UPDATE_MCR_EVENT,
} from '@/graphql/mcrMutations';
import { useMcrRange } from '../hooks/useMcrRange';
import RangeNavigator from './RangeNavigator';
import EventListPanel from './EventListPanel';
import PreparationWorkspace from './PreparationWorkspace';
import CreateEventModal from './CreateEventModal';
import { exportCsv } from '../utils/exportCsv';
import { PREPARATION_STATUS_LABELS } from '../constants';
import type { MCREvent, MCRPreparationStatus } from '../types';

interface Props {
  canManage: boolean;
  selectedEventId: string | null;
  onSelectEvent: (event: MCREvent | null) => void;
}

const EventsArea: React.FC<Props> = ({ canManage, selectedEventId, onSelectEvent }) => {
  const { message } = App.useApp();
  const range = useMcrRange();
  const [showCreate, setShowCreate] = useState(false);

  const { data, loading, refetch } = useQuery(GET_MCR_EVENTS, {
    variables: {
      start: range.range.start.toISOString(),
      end: range.range.end.toISOString(),
    },
    fetchPolicy: 'cache-and-network',
  });

  // Live updates: any MCR event change (create/update/delete) triggers a
  // refetch scoped to the current visible range. We refetch rather than
  // patching the cache so server-side range filtering and field resolvers
  // stay authoritative.
  useSubscription(MCR_EVENT_CREATED_SUB, { onData: () => refetch() });
  useSubscription(MCR_EVENT_UPDATED_SUB, { onData: () => refetch() });
  useSubscription(MCR_EVENT_DELETED_SUB, { onData: () => refetch() });

  const [createEvent, { loading: creating }] = useMutation(CREATE_MCR_EVENT, {
    refetchQueries: ['GetMCREvents'],
  });
  const [updateEvent, { loading: saving }] = useMutation(UPDATE_MCR_EVENT, {
    refetchQueries: ['GetMCREvents'],
  });
  const [deleteEvent] = useMutation(DELETE_MCR_EVENT, {
    refetchQueries: ['GetMCREvents'],
  });

  const events: MCREvent[] = useMemo(() => {
    return (data?.mcrEvents || []).map((e: any) => ({
      ...e,
      preparationStatus: e.preparationStatus || 'NOT_STARTED',
      feeds: e.feeds || [],
      contacts: e.contacts || [],
      outputPlatforms: e.outputPlatforms || [],
      exchangeGroupIds: e.exchangeGroupIds || [],
    }));
  }, [data]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  const handleExport = () => {
    const headers = [
      'שם האירוע',
      'תאריך',
      'שעת התחלה',
      'שעת סיום',
      'ערוץ',
      'אולפן',
      'סטטוס הכנה',
      'מקור',
    ];
    const rows = events.map((e) => [
      e.title,
      dayjs(e.start).format('DD/MM/YYYY'),
      dayjs(e.start).format('HH:mm'),
      dayjs(e.end).format('HH:mm'),
      e.broadcastChannel || '',
      e.controlStudio || '',
      PREPARATION_STATUS_LABELS[e.preparationStatus as MCRPreparationStatus] || '',
      e.broadcastEventId ? 'תכנון שידור' : 'אירוע ידני',
    ]);
    const label = `mcr-events-${range.mode}-${range.date.format('YYYY-MM-DD')}`;
    exportCsv(label, headers, rows);
  };

  const handleCreate = async (values: any) => {
    try {
      const { data: created } = await createEvent({
        variables: {
          input: {
            title: values.title,
            start: values.start,
            end: values.end,
            broadcastChannel: values.broadcastChannel,
            controlStudio: values.controlStudio,
            broadcastType: values.broadcastType,
            isMCROnly: true,
            preparationStatus: 'NOT_STARTED',
          },
        },
      });
      message.success('האירוע נוצר בהצלחה');
      setShowCreate(false);
      if (created?.createMCREvent) {
        onSelectEvent(created.createMCREvent);
      }
    } catch (err: any) {
      message.error('יצירה נכשלה: ' + (err?.message || 'שגיאה'));
    }
  };

  const handleSave = async (next: MCREvent) => {
    if (!next.id) return;
    await updateEvent({
      variables: {
        id: next.id,
        input: {
          title: next.title,
          start: typeof next.start === 'string' ? next.start : new Date(next.start).toISOString(),
          end: typeof next.end === 'string' ? next.end : new Date(next.end).toISOString(),
          broadcastType: next.broadcastType,
          isMCROnly: next.isMCROnly,
          preparationStatus: next.preparationStatus,
          controlStudio: next.controlStudio,
          broadcastChannel: next.broadcastChannel,
          mcrStartTime: next.mcrStartTime || null,
          mcrEndTime: next.mcrEndTime || null,
          preparationNotes: next.preparationNotes,
          sourceLabel: next.sourceLabel,
          feeds: next.feeds.map(({ id, ...rest }) => ({
            id: id?.startsWith('tmp-') ? undefined : id,
            ...rest,
          })),
          contacts: next.contacts.map(({ id, ...rest }) => ({
            id: id?.startsWith('tmp-') ? undefined : id,
            ...rest,
          })),
          outputPlatforms: next.outputPlatforms.map(({ id, ...rest }) => ({
            id: id?.startsWith('tmp-') ? undefined : id,
            ...rest,
          })),
        },
      },
    });
  };

  const handleDelete = async (e: MCREvent) => {
    try {
      await deleteEvent({ variables: { id: e.id } });
      message.success('האירוע נמחק');
      onSelectEvent(null);
    } catch (err: any) {
      message.error('מחיקה נכשלה: ' + (err?.message || 'שגיאה'));
    }
  };

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <RangeNavigator
        date={range.date}
        mode={range.mode}
        label={range.label}
        isToday={range.isToday}
        onDateChange={range.setDate}
        onModeChange={range.setMode}
        onNext={range.next}
        onPrev={range.prev}
        onToday={range.today}
        trailing={
          <>
            <Tooltip title="עדכון חי – נתונים מסונכרנים אוטומטית">
              <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold px-2">
                <WifiOutlined />
                חי
              </span>
            </Tooltip>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              ייצוא
            </Button>
            {canManage && (
              <Button type="primary" onClick={() => setShowCreate(true)}>
                + אירוע חדש
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-3">
        <EventListPanel
          events={events}
          loading={loading}
          mode={range.mode}
          date={range.date}
          selectedId={selectedEventId}
          canManage={canManage}
          onSelect={(ev) => onSelectEvent(ev)}
          onExport={handleExport}
          onCreate={() => setShowCreate(true)}
        />
        <PreparationWorkspace
          event={selectedEvent}
          saving={saving}
          canManage={canManage}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </div>

      <CreateEventModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        defaultDate={range.date}
        saving={creating}
      />
    </div>
  );
};

export default EventsArea;
