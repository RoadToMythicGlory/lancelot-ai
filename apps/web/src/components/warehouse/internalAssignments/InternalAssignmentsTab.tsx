'use client';

import React, { useMemo, useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Empty,
  Spin,
  Alert,
  Input,
  Select,
  Row,
  Col,
  Segmented,
  App,
  Modal,
  Tooltip,
  Avatar,
  List,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  SwapOutlined,
  UndoOutlined,
  UserOutlined,
  TeamOutlined,
  InboxOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import dayjs from 'dayjs';
import { GET_INTERNAL_EQUIPMENT_ASSIGNMENTS } from '../../../graphql/queries';
import { RETURN_INTERNAL_EQUIPMENT_ASSIGNMENT } from '../../../graphql/mutations';
import InternalAssignmentDispatchModal from './InternalAssignmentDispatchModal';
import InternalAssignmentTransferModal from './InternalAssignmentTransferModal';
import WarehouseExportButtons from '../WarehouseExportButtons';
import type { ExportColumn, ExportReport } from '@/utils/warehouseReportExport';
import { formatDateTime as fmtDT } from '@/utils/warehouseReportExport';

interface InternalAssignment {
  id: string;
  equipmentId: string;
  equipment?: {
    id: string;
    name: string;
    category: string;
    brand?: string;
    barcode: string;
    quantityAvailable: number;
    quantityTotal: number;
  } | null;
  assignedToType: 'internal' | 'external';
  assignedToUserId?: string | null;
  assignedToUser?: {
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email?: string;
  } | null;
  assignedToName: string;
  assignedToPhone?: string;
  quantityAssigned: number;
  status: 'active' | 'returned' | 'transferred' | 'cancelled';
  assignedAt: string;
  assignedByName?: string;
  notes?: string;
  returnedAt?: string;
  returnedByName?: string;
  returnNotes?: string;
  transferredAt?: string;
  transferredByName?: string;
  transferNotes?: string;
}

type StatusFilter = 'active' | 'all' | 'returned' | 'transferred';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'פעילה', color: 'green' },
  returned: { label: 'הוחזר', color: 'default' },
  transferred: { label: 'הועבר', color: 'purple' },
  cancelled: { label: 'בוטל', color: 'red' },
};

interface InternalAssignmentsTabProps {
  canManage?: boolean;
}

const InternalAssignmentsTab: React.FC<InternalAssignmentsTabProps> = ({ canManage = false }) => {
  const { message, modal } = App.useApp();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [searchText, setSearchText] = useState('');
  const [workerTypeFilter, setWorkerTypeFilter] = useState<'all' | 'internal' | 'external'>('all');

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<InternalAssignment | null>(null);

  const { data, loading, error, refetch } = useQuery(GET_INTERNAL_EQUIPMENT_ASSIGNMENTS, {
    variables: { status: statusFilter },
    fetchPolicy: 'cache-and-network',
  });

  const [returnMutation, { loading: returning }] = useMutation(RETURN_INTERNAL_EQUIPMENT_ASSIGNMENT, {
    refetchQueries: [
      { query: GET_INTERNAL_EQUIPMENT_ASSIGNMENTS, variables: { status: 'active' } },
      { query: GET_INTERNAL_EQUIPMENT_ASSIGNMENTS, variables: { status: 'all' } },
      'GetWarehouseEquipment',
      'GetWarehouseEquipmentStats',
      'GetEquipmentHistory',
    ],
    awaitRefetchQueries: true,
  });

  const assignments: InternalAssignment[] = data?.internalEquipmentAssignments || [];

  const filteredAssignments = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return assignments.filter((a) => {
      if (workerTypeFilter !== 'all' && a.assignedToType !== workerTypeFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        a.assignedToName,
        a.assignedToPhone,
        a.equipment?.name,
        a.equipment?.barcode,
        a.equipment?.category,
        a.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignments, searchText, workerTypeFilter]);

  const handleReturn = (assignment: InternalAssignment) => {
    let returnNotesValue = '';
    modal.confirm({
      title: 'החזרת ציוד למחסן',
      width: 520,
      okText: 'אישור — החזר ציוד',
      okButtonProps: { type: 'primary' },
      cancelText: 'ביטול',
      content: (
        <div style={{ direction: 'rtl' }}>
          <p>
            האם להחזיר {assignment.quantityAssigned} יחידות של{' '}
            <strong>{assignment.equipment?.name || 'ציוד'}</strong> מ-
            <strong>{assignment.assignedToName}</strong>?
          </p>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
            הערות החזרה (אופציונלי):
          </label>
          <Input.TextArea
            rows={3}
            placeholder="לדוגמה: התקבל במלואו | חסר פריט | ניזוק"
            onChange={(e) => {
              returnNotesValue = e.target.value;
            }}
          />
        </div>
      ),
      onOk: async () => {
        try {
          await returnMutation({
            variables: {
              assignmentId: assignment.id,
              notes: returnNotesValue.trim() || null,
            },
          });
          message.success('הציוד הוחזר בהצלחה');
          await refetch();
        } catch (err: any) {
          message.error(err?.message || 'שגיאה בהחזרת הציוד');
          throw err;
        }
      },
    });
  };

  const renderAssignment = (a: InternalAssignment) => {
    const isActive = a.status === 'active';
    const statusMeta = STATUS_LABELS[a.status] || { label: a.status, color: 'default' };

    return (
      <List.Item
        key={a.id}
        actions={
          canManage && isActive
            ? [
                <Button
                  key="transfer"
                  size="small"
                  icon={<SwapOutlined />}
                  onClick={() => setTransferTarget(a)}
                >
                  העבר ציוד
                </Button>,
                <Button
                  key="return"
                  size="small"
                  type="primary"
                  icon={<UndoOutlined />}
                  loading={returning}
                  onClick={() => handleReturn(a)}
                >
                  החזר ציוד
                </Button>,
              ]
            : undefined
        }
      >
        <List.Item.Meta
          avatar={
            <Avatar
              icon={a.assignedToType === 'internal' ? <UserOutlined /> : <TeamOutlined />}
              style={{
                backgroundColor: a.assignedToType === 'internal' ? '#1890ff' : '#fa8c16',
              }}
            />
          }
          title={
            <Space wrap>
              <strong>{a.assignedToName}</strong>
              <Tag color={a.assignedToType === 'internal' ? 'blue' : 'orange'}>
                {a.assignedToType === 'internal' ? 'עובד פנימי' : 'עובד חיצוני'}
              </Tag>
              <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
              {a.assignedToPhone && (
                <span className="text-xs text-gray-500">{a.assignedToPhone}</span>
              )}
            </Space>
          }
          description={
            <div>
              <Space wrap>
                <InboxOutlined />
                <strong className="text-sm">{a.equipment?.name || 'ציוד'}</strong>
                {a.equipment?.category && <Tag color="cyan">{a.equipment.category}</Tag>}
                {a.equipment?.barcode && (
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {a.equipment.barcode}
                  </code>
                )}
                <Tag>x{a.quantityAssigned}</Tag>
              </Space>
              <div className="text-xs text-gray-500 mt-1">
                הוקצה: {dayjs(a.assignedAt).format('DD/MM/YYYY HH:mm')}
                {a.assignedByName && ` • ע״י ${a.assignedByName}`}
              </div>
              {a.notes && (
                <div className="text-xs text-gray-600 mt-1">
                  <strong>הערות: </strong>
                  {a.notes}
                </div>
              )}
              {a.status === 'returned' && a.returnedAt && (
                <div className="text-xs text-green-700 mt-1">
                  הוחזר: {dayjs(a.returnedAt).format('DD/MM/YYYY HH:mm')}
                  {a.returnedByName && ` • ע״י ${a.returnedByName}`}
                  {a.returnNotes && ` — ${a.returnNotes}`}
                </div>
              )}
              {a.status === 'transferred' && a.transferredAt && (
                <div className="text-xs text-purple-700 mt-1">
                  הועבר: {dayjs(a.transferredAt).format('DD/MM/YYYY HH:mm')}
                  {a.transferredByName && ` • ע״י ${a.transferredByName}`}
                  {a.transferNotes && ` — ${a.transferNotes}`}
                </div>
              )}
            </div>
          }
        />
      </List.Item>
    );
  };

  const activeCount = useMemo(
    () => assignments.filter((a) => a.status === 'active').length,
    [assignments],
  );

  /** Build the export report for the current view (respects status filter,
   *  worker-type filter and free-text search). Both internal and external
   *  workers share one table because the row already carries the worker
   *  type as a column. */
  const buildReport = (): ExportReport | null => {
    if (filteredAssignments.length === 0) return null;

    const cols: ExportColumn<InternalAssignment>[] = [
      { key: 'worker', label: 'עובד', emphasis: true, value: (r) => r.assignedToName },
      {
        key: 'workerType',
        label: 'סוג',
        value: (r) => (r.assignedToType === 'internal' ? 'פנימי' : 'חיצוני'),
      },
      { key: 'phone', label: 'טלפון', value: (r) => r.assignedToPhone || '' },
      { key: 'equipment', label: 'ציוד', value: (r) => r.equipment?.name || '' },
      { key: 'category', label: 'קטגוריה', value: (r) => r.equipment?.category || '' },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.equipment?.barcode || '' },
      { key: 'qty', label: 'כמות', numeric: true, value: (r) => r.quantityAssigned },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => STATUS_LABELS[r.status]?.label || r.status,
        status: (r) => {
          const label = STATUS_LABELS[r.status]?.label || r.status;
          if (r.status === 'active') return { label, variant: 'active' };
          if (r.status === 'returned') return { label, variant: 'returned' };
          if (r.status === 'transferred') return { label, variant: 'warn' };
          if (r.status === 'cancelled') return { label, variant: 'danger' };
          return { label, variant: 'neutral' };
        },
      },
      { key: 'assignedAt', label: 'הוקצה', value: (r) => fmtDT(r.assignedAt) },
      { key: 'assignedBy', label: 'הוקצה ע"י', value: (r) => r.assignedByName || '' },
      { key: 'returnedAt', label: 'הוחזר', value: (r) => fmtDT(r.returnedAt) },
      {
        key: 'transferredAt',
        label: 'הועבר',
        value: (r) => (r.transferredAt ? fmtDT(r.transferredAt) : ''),
      },
      { key: 'notes', label: 'הערות', value: (r) => r.notes || '' },
    ];

    const chips: string[] = [];
    chips.push(
      `סטטוס: ${
        statusFilter === 'all'
          ? 'הכל'
          : statusFilter === 'active'
            ? 'פעילות'
            : statusFilter === 'returned'
              ? 'הוחזרו'
              : 'הועברו'
      }`,
    );
    if (workerTypeFilter !== 'all') {
      chips.push(`סוג עובד: ${workerTypeFilter === 'internal' ? 'פנימי' : 'חיצוני'}`);
    }
    if (searchText.trim()) chips.push(`חיפוש: ${searchText.trim()}`);

    const counts = {
      active: filteredAssignments.filter((a) => a.status === 'active').length,
      returned: filteredAssignments.filter((a) => a.status === 'returned').length,
      transferred: filteredAssignments.filter((a) => a.status === 'transferred').length,
    };

    return {
      title: 'דוח הקצאות פנימיות',
      subtitle: 'הקצאות ציוד פעילות והיסטוריות לעובדים פנימיים וחיצוניים.',
      filenameStem: 'מחסן-הקצאות-פנימיות',
      origin: 'מחסן · הקצאות פנימיות',
      metaChips: chips,
      summary: [
        { label: 'סה״כ הקצאות', value: filteredAssignments.length, accent: 'warehouse' },
        { label: 'פעילות', value: counts.active, accent: 'events' },
        { label: 'הוחזרו', value: counts.returned, accent: 'history' },
        { label: 'הועברו', value: counts.transferred, accent: 'staff' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'internal-assignments',
          title: 'הקצאות',
          accent: 'events',
          meta: `${filteredAssignments.length} שורות`,
          columns: cols,
          rows: filteredAssignments,
          emptyText: 'אין הקצאות תואמות לסינון',
        },
      ],
    };
  };

  return (
    <>
      <Alert
        message="הקצאות פנימיות"
        description="הקצאת ציוד לעובדים במערכת או לעובדים חיצוניים. הציוד יסומן כמוקצה, יישמר ביומן ההיסטוריה של הציוד, וניתן להחזירו או להעבירו לעובד אחר ישירות מטבלה זו."
        type="info"
        showIcon
        className="mb-6"
      />

      {/* Filters */}
      <Card className="mb-6">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={10}>
            <Input
              placeholder="חיפוש לפי עובד, ציוד, ברקוד או הערה"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              style={{ width: '100%' }}
              value={workerTypeFilter}
              onChange={(v) => setWorkerTypeFilter(v)}
            >
              <Select.Option value="all">כל העובדים</Select.Option>
              <Select.Option value="internal">עובדים פנימיים</Select.Option>
              <Select.Option value="external">עובדים חיצוניים</Select.Option>
            </Select>
          </Col>
          <Col xs={24} md={8}>
            <Segmented
              block
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { label: 'פעילות', value: 'active' },
                { label: 'הוחזרו', value: 'returned' },
                { label: 'הועברו', value: 'transferred' },
                { label: 'הכל', value: 'all' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* Header + dispatch button */}
      <Card
        title={
          <Space>
            <HistoryOutlined style={{ color: '#1890ff' }} />
            <span>
              {statusFilter === 'active' ? 'הקצאות פעילות' : 'הקצאות'} ({filteredAssignments.length})
            </span>
            {activeCount > 0 && statusFilter !== 'active' && (
              <Tooltip title="מספר הקצאות פעילות כעת">
                <Tag color="green">{activeCount} פעילות</Tag>
              </Tooltip>
            )}
          </Space>
        }
        extra={
          <Space>
            <WarehouseExportButtons
              buildReport={buildReport}
              disabled={loading || filteredAssignments.length === 0}
            />
            {canManage && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setDispatchOpen(true)}
                size="large"
              >
                הקצה ציוד לעובד
              </Button>
            )}
          </Space>
        }
      >
        {loading && !data ? (
          <div className="text-center py-8">
            <Spin size="large" />
            <div className="mt-3 text-gray-500">טוען הקצאות...</div>
          </div>
        ) : error ? (
          <Alert type="error" showIcon message="שגיאה בטעינת ההקצאות" description={error.message} />
        ) : filteredAssignments.length === 0 ? (
          <Empty
            description={
              statusFilter === 'active'
                ? 'אין הקצאות פעילות כעת'
                : 'לא נמצאו הקצאות תואמות לסינון'
            }
          >
            {canManage && statusFilter === 'active' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setDispatchOpen(true)}>
                הקצאה חדשה
              </Button>
            )}
          </Empty>
        ) : (
          <List
            dataSource={filteredAssignments}
            renderItem={renderAssignment}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} מתוך ${total}`,
            }}
          />
        )}
      </Card>

      {canManage && (
        <>
          <InternalAssignmentDispatchModal
            visible={dispatchOpen}
            onClose={() => setDispatchOpen(false)}
            onSuccess={() => {
              refetch();
            }}
          />

          <InternalAssignmentTransferModal
            visible={transferTarget !== null}
            assignment={transferTarget}
            onClose={() => setTransferTarget(null)}
            onSuccess={() => {
              refetch();
            }}
          />
        </>
      )}
    </>
  );
};

export default InternalAssignmentsTab;
