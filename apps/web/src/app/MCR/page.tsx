'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Tabs } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
  SwapOutlined,
  ToolOutlined,
  LockOutlined,
} from '@ant-design/icons';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import EventsArea from './components/EventsArea';
import ScheduleArea from './components/ScheduleArea';
import DailyChecksArea from './components/DailyChecksArea';
import ExternalExchangeArea from './components/ExternalExchangeArea';
import SharedEngineeringEquipmentArea from './components/SharedEngineeringEquipmentArea';
import dayjs from 'dayjs';
import type { MCREvent } from './types';
import './styles/mcr-workspace.css';

type TabKey = 'events' | 'schedule' | 'checks' | 'exchange' | 'shared-engineering';

function PageInner() {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission(Permission.MCR_VIEW);
  const canManage = hasPermission(Permission.MCR_MANAGE);
  const [tab, setTab] = useState<TabKey>('events');
  const [selectedEvent, setSelectedEvent] = useState<MCREvent | null>(null);
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(t);
  }, []);

  const headerSubtitle = useMemo(
    () => `${now.format('dddd, DD/MM/YYYY')} · ${now.format('HH:mm')}`,
    [now],
  );

  return (
    <div className="mcr-workspace" dir="rtl">
      <div className="max-w-[1900px] mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 m-0">חדר בקרה ראשי – MCR</h1>
            <div className="text-sm text-slate-500 mt-1">{headerSubtitle}</div>
          </div>
          {user && (
            <div className="text-sm text-slate-500 text-left">
              <div>
                שלום, <strong className="text-slate-700">{user.displayName}</strong>
              </div>
              <div>
                הרשאות:{' '}
                {canManage ? (
                  <span className="text-emerald-600 font-semibold">עריכה ותפעול</span>
                ) : canView ? (
                  <span className="text-amber-600 font-semibold">צפייה בלבד</span>
                ) : (
                  <span className="text-red-600 font-semibold">ללא הרשאה</span>
                )}
              </div>
            </div>
          )}
        </div>

        {!canManage && canView && (
          <div className="mcr-readonly-banner">
            <LockOutlined />
            <div>
              <strong>גישת צפייה בלבד</strong> – ניתן לעיין במידע אך לא לבצע שינויים. לבקשת הרשאות
              נוספות פנו למנהל המערכת.
            </div>
          </div>
        )}

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          size="large"
          items={[
            {
              key: 'events',
              label: (
                <span>
                  <CalendarOutlined /> אירועי MCR
                </span>
              ),
              children: (
                <EventsArea
                  canManage={canManage}
                  selectedEventId={selectedEvent?.id || null}
                  onSelectEvent={setSelectedEvent}
                />
              ),
            },
            {
              key: 'schedule',
              label: (
                <span>
                  <ScheduleOutlined /> לו&quot;ז
                </span>
              ),
              children: <ScheduleArea canManage={canManage} />,
            },
            {
              key: 'checks',
              label: (
                <span>
                  <CheckCircleOutlined /> בדיקות יומיות
                </span>
              ),
              children: <DailyChecksArea canManage={canManage} />,
            },
            {
              key: 'exchange',
              label: (
                <span>
                  <SwapOutlined /> החלפה חיצונית
                </span>
              ),
              children: (
                <ExternalExchangeArea
                  selectedEvent={selectedEvent}
                  canManage={canManage}
                />
              ),
            },
            {
              key: 'shared-engineering',
              label: (
                <span>
                  <ToolOutlined /> ציוד הנדסה שיתופי
                </span>
              ),
              children: <SharedEngineeringEquipmentArea canManage={canManage} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

export default function MCRPage() {
  return (
    <ProtectedRoute requires={Permission.MCR_VIEW}>
      <App>
        <PageInner />
      </App>
    </ProtectedRoute>
  );
}
