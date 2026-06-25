'use client';

/**
 * External Broadcasts reports panel.
 *
 * Lightweight reports built on top of the existing event + metadata
 * model: fibers, broadcast tables, petty cash, control/MCR checks,
 * confirmations, invoices, inventory/rentals, faults, NEVION, LiveU.
 * Each report exports to CSV. Tables are responsive (no horizontal
 * scroll).
 */
import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client';
import dayjs, { Dayjs } from 'dayjs';
import {
  GET_BROADCAST_EVENTS,
  GET_EQUIPMENT_FAULT_REPORTS,
} from '@/graphql/queries';
import {
  ASSIGNMENT_STATUS_LABEL,
  FAULT_SEVERITY_LABEL,
  FAULT_STATUS_LABEL,
  getAssignmentStatus,
  readExternalBroadcastData,
} from '@/utils/externalBroadcastDomain';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type ReportTab =
  | 'overview'
  | 'fibers'
  | 'pettyCash'
  | 'confirmations'
  | 'invoices'
  | 'mcrChecks'
  | 'nevion'
  | 'liveu'
  | 'faults'
  | 'inventory';

function downloadCSV(filename: string, rows: any[], columns: { key: string; title: string }[]) {
  if (rows.length === 0) return;
  const header = columns.map((c) => `"${c.title.replace(/"/g, '""')}"`).join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c.key];
          if (v == null) return '';
          if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ExternalBroadcastReports: React.FC = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'month').startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [tab, setTab] = useState<ReportTab>('overview');

  const { data: eventsData, loading: eventsLoading } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: range[0].toISOString(),
      endDate: range[1].toISOString(),
    },
    fetchPolicy: 'cache-and-network',
  });
  const { data: faultsData, loading: faultsLoading } = useQuery(
    GET_EQUIPMENT_FAULT_REPORTS,
    {
      variables: { limit: 500 },
      fetchPolicy: 'cache-and-network',
    },
  );

  const events: any[] = eventsData?.broadcastEvents || [];
  const faults: any[] = faultsData?.equipmentFaultReports || [];

  // Pre-compute the External Broadcasts-only rows used by every tab.
  const rows = useMemo(() => {
    return events.map((ev) => {
      const cd = readExternalBroadcastData(ev);
      return {
        id: ev.id,
        date: ev.startTime ? dayjs(ev.startTime).format('DD/MM/YYYY') : '',
        time: ev.startTime ? dayjs(ev.startTime).format('HH:mm') : '',
        weekday: ev.startTime ? dayjs(ev.startTime).format('dddd') : '',
        title:
          ev.homeTeam && ev.awayTeam
            ? `${ev.homeTeam} נגד ${ev.awayTeam}`
            : ev.title || '',
        channel: ev.channel || '',
        league: ev.league || '',
        location: ev.location || ev.venue || '',
        assignmentStatus: ASSIGNMENT_STATUS_LABEL[getAssignmentStatus(ev)],
        isDoubleBroadcast: cd.isDoubleBroadcast ? 'כן' : 'לא',
        secondaryControl: cd.secondaryControlRoomName || '',
        controlCheckRequired:
          (cd.controlCheck?.required || cd.offtube?.required) ? 'כן' : 'לא',
        controlCheckStatus:
          cd.controlCheck?.checkStatus || cd.offtube?.checkStatus || '',
        controlCheckRoom:
          cd.controlCheck?.roomName || cd.offtube?.roomName || '',
        nevionEnabled: cd.nevionRequest?.enabled ? 'כן' : 'לא',
        nevionRequired: cd.nevionRequest?.requiredCameraCount || '',
        nevionSelected: cd.nevionRequest?.selectedEquipmentName || '',
        nevionUnresolved: cd.nevionRequest?.unresolved ? 'כן' : 'לא',
        liveuKitCount: cd.liveuActivation?.selectedKitIds?.length || 0,
        liveuLastEmail: cd.liveuActivation?.lastEmailSentAt
          ? dayjs(cd.liveuActivation.lastEmailSentAt).format('DD/MM/YYYY HH:mm')
          : '',
        pettyCashRequired: cd.finance?.pettyCashRequired ?? 0,
        pettyCashReturned: cd.finance?.pettyCashReturned ?? 0,
        confirmationStatus: cd.finance?.confirmationStatus || '',
        invoiceStatus: cd.finance?.invoiceStatus || '',
        documentTechnical: cd.documents?.technical?.[0]?.url ? 'יש' : '',
        documentProduction: cd.documents?.production?.[0]?.url ? 'יש' : '',
        documentLineUp: cd.documents?.lineUp?.[0]?.url ? 'יש' : '',
        documentManpower: cd.documents?.manpower?.[0]?.url ? 'יש' : '',
        excluded: cd.excludedFromOperations ? 'כן' : 'לא',
      };
    });
  }, [events]);

  // ─── Overview ─────────────────────────────────────────────
  const overview = useMemo(() => {
    const total = rows.length;
    const liveCount = rows.filter((r) => r.assignmentStatus === ASSIGNMENT_STATUS_LABEL.live).length;
    const paused = rows.filter((r) => r.assignmentStatus === ASSIGNMENT_STATUS_LABEL.paused).length;
    const postponed = rows.filter((r) => r.assignmentStatus === ASSIGNMENT_STATUS_LABEL.postponed).length;
    const cancelled = rows.filter((r) => r.assignmentStatus === ASSIGNMENT_STATUS_LABEL.cancelled).length;
    const pettyCashRequired = rows.reduce((s, r) => s + Number(r.pettyCashRequired || 0), 0);
    const pettyCashReturned = rows.reduce((s, r) => s + Number(r.pettyCashReturned || 0), 0);
    const openFaults = faults.filter((f: any) => f.status !== 'resolved').length;
    return {
      total,
      liveCount,
      paused,
      postponed,
      cancelled,
      pettyCashRequired,
      pettyCashReturned,
      openFaults,
    };
  }, [rows, faults]);

  return (
    <Card style={{ direction: 'rtl' }}>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={4} style={{ margin: 0 }}>
            דוחות שידורי חוץ
          </Title>
        </Col>
        <Col>
          <RangePicker
            value={range as any}
            onChange={(v) => v && setRange(v as any)}
            format="DD/MM/YYYY"
          />
        </Col>
      </Row>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as ReportTab)}
        items={[
          {
            key: 'overview',
            label: 'סקירה',
            children: (
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6}>
                  <Card><Statistic title="סה״כ שידורים" value={overview.total} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="חי" value={overview.liveCount} valueStyle={{ color: '#22c55e' }} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="מושהים" value={overview.paused} valueStyle={{ color: '#a16207' }} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="נדחו" value={overview.postponed} valueStyle={{ color: '#0891b2' }} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="בוטלו" value={overview.cancelled} valueStyle={{ color: '#b91c1c' }} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="קופה קטנה - דרוש" value={overview.pettyCashRequired} suffix="₪" /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="קופה קטנה - הוחזר" value={overview.pettyCashReturned} suffix="₪" /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card><Statistic title="תקלות פתוחות" value={overview.openFaults} valueStyle={{ color: '#b91c1c' }} /></Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'fibers',
            label: 'סיבים שבועי/חודשי',
            children: (
              <ReportTable
                rows={rows}
                title="טבלת שידורים - סיבים"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'weekday', title: 'יום' },
                  { key: 'time', title: 'שעה' },
                  { key: 'title', title: 'שידור' },
                  { key: 'league', title: 'ליגה' },
                  { key: 'channel', title: 'ערוץ' },
                  { key: 'location', title: 'מיקום' },
                  { key: 'secondaryControl', title: 'קונטרול משני' },
                  { key: 'assignmentStatus', title: 'סטטוס' },
                ]}
                exportName="fibers"
              />
            ),
          },
          {
            key: 'pettyCash',
            label: 'קופה קטנה',
            children: (
              <ReportTable
                rows={rows.filter((r) => Number(r.pettyCashRequired) > 0 || Number(r.pettyCashReturned) > 0)}
                title="דוח קופה קטנה"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'channel', title: 'ערוץ' },
                  { key: 'pettyCashRequired', title: 'דרוש' },
                  { key: 'pettyCashReturned', title: 'הוחזר' },
                ]}
                exportName="petty-cash"
              />
            ),
          },
          {
            key: 'confirmations',
            label: 'אישורים',
            children: (
              <ReportTable
                rows={rows.filter((r) => r.confirmationStatus)}
                title="סטטוס אישורים"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'channel', title: 'ערוץ' },
                  { key: 'confirmationStatus', title: 'סטטוס אישור' },
                ]}
                exportName="confirmations"
              />
            ),
          },
          {
            key: 'invoices',
            label: 'חשבוניות',
            children: (
              <ReportTable
                rows={rows.filter((r) => r.invoiceStatus && r.invoiceStatus !== 'not_required')}
                title="סטטוס חשבוניות"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'invoiceStatus', title: 'סטטוס חשבונית' },
                ]}
                exportName="invoices"
              />
            ),
          },
          {
            key: 'controlChecks',
            label: 'בדיקות בקרה / MCR',
            children: (
              <ReportTable
                rows={rows.filter((r) => r.controlCheckRequired === 'כן')}
                title="בדיקות בקרה / MCR"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'controlCheckRoom', title: 'חדר בקרה' },
                  { key: 'controlCheckStatus', title: 'סטטוס בדיקה' },
                ]}
                exportName="control-checks"
              />
            ),
          },
          {
            key: 'nevion',
            label: 'הקצאות NEVION',
            children: (
              <ReportTable
                rows={rows.filter((r) => r.nevionEnabled === 'כן')}
                title="דוח NEVION"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'nevionRequired', title: 'מצלמות נדרשות' },
                  { key: 'nevionSelected', title: 'NEVION נבחר' },
                  { key: 'nevionUnresolved', title: 'לא נפתר?' },
                ]}
                exportName="nevion-allocations"
              />
            ),
          },
          {
            key: 'liveu',
            label: 'הפעלות LiveU',
            children: (
              <ReportTable
                rows={rows.filter((r) => Number(r.liveuKitCount) > 0)}
                title="הפעלות LiveU"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'liveuKitCount', title: 'מס׳ ערכות' },
                  { key: 'liveuLastEmail', title: 'מייל נשלח לאחרונה' },
                ]}
                exportName="liveu-activations"
              />
            ),
          },
          {
            key: 'faults',
            label: 'תקלות',
            children: (
              <Card>
                <Space style={{ marginBottom: 8 }}>
                  <Title level={5} style={{ margin: 0 }}>
                    דוח תקלות ציוד
                  </Title>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() =>
                      downloadCSV(
                        `external-broadcast-faults-${dayjs().format('YYYY-MM-DD')}.csv`,
                        faults.map((f: any) => ({
                          ...f,
                          reportedAt: f.reportedAt ? dayjs(f.reportedAt).format('DD/MM/YYYY HH:mm') : '',
                          severityLabel: FAULT_SEVERITY_LABEL[f.severity as keyof typeof FAULT_SEVERITY_LABEL] || f.severity,
                          statusLabel: FAULT_STATUS_LABEL[f.status as keyof typeof FAULT_STATUS_LABEL] || f.status,
                        })),
                        [
                          { key: 'equipmentName', title: 'ציוד' },
                          { key: 'equipmentBarcode', title: 'ברקוד' },
                          { key: 'eventName', title: 'שידור' },
                          { key: 'description', title: 'תיאור' },
                          { key: 'severityLabel', title: 'חומרה' },
                          { key: 'statusLabel', title: 'סטטוס' },
                          { key: 'reportedByName', title: 'דיווח ע"י' },
                          { key: 'reportedAt', title: 'דווח ב' },
                        ],
                      )
                    }
                  >
                    ייצוא CSV
                  </Button>
                </Space>
                {faults.length === 0 ? (
                  <Empty description="אין תקלות בטווח הנבחר" />
                ) : (
                  <Table
                    loading={faultsLoading}
                    rowKey="id"
                    size="small"
                    dataSource={faults}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: 'ציוד', dataIndex: 'equipmentName' },
                      { title: 'ברקוד', dataIndex: 'equipmentBarcode' },
                      { title: 'שידור', dataIndex: 'eventName' },
                      { title: 'תיאור', dataIndex: 'description' },
                      {
                        title: 'חומרה',
                        dataIndex: 'severity',
                        render: (s: any) => (
                          <Tag color={s === 'critical' ? 'red' : s === 'major' ? 'orange' : 'blue'}>
                            {FAULT_SEVERITY_LABEL[s as keyof typeof FAULT_SEVERITY_LABEL] || s}
                          </Tag>
                        ),
                      },
                      {
                        title: 'סטטוס',
                        dataIndex: 'status',
                        render: (s: any) => (
                          <Tag color={s === 'resolved' ? 'green' : 'red'}>
                            {FAULT_STATUS_LABEL[s as keyof typeof FAULT_STATUS_LABEL] || s}
                          </Tag>
                        ),
                      },
                      {
                        title: 'דווח ב',
                        dataIndex: 'reportedAt',
                        render: (v: any) =>
                          v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '-',
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'inventory',
            label: 'מלאי / השכרות',
            children: (
              <ReportTable
                rows={rows}
                title="טבלת ציוד בשידור"
                columns={[
                  { key: 'date', title: 'תאריך' },
                  { key: 'title', title: 'שידור' },
                  { key: 'channel', title: 'ערוץ' },
                  { key: 'nevionSelected', title: 'NEVION' },
                  { key: 'liveuKitCount', title: 'ערכות LiveU' },
                ]}
                exportName="inventory"
              />
            ),
          },
        ]}
      />

      {eventsLoading && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          טוען נתונים...
        </Text>
      )}
    </Card>
  );
};

const ReportTable: React.FC<{
  rows: any[];
  title: string;
  columns: { key: string; title: string }[];
  exportName: string;
}> = ({ rows, title, columns, exportName }) => (
  <Card>
    <Space style={{ marginBottom: 8 }}>
      <Title level={5} style={{ margin: 0 }}>
        {title}
      </Title>
      <Button
        icon={<DownloadOutlined />}
        onClick={() =>
          downloadCSV(`external-broadcast-${exportName}-${dayjs().format('YYYY-MM-DD')}.csv`, rows, columns)
        }
        disabled={rows.length === 0}
      >
        ייצוא CSV
      </Button>
    </Space>
    {rows.length === 0 ? (
      <Empty description="אין נתונים בטווח הנבחר" />
    ) : (
      <Table
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={columns.map((c) => ({
          title: c.title,
          dataIndex: c.key,
          key: c.key,
        }))}
      />
    )}
  </Card>
);
