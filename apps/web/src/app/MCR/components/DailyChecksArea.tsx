'use client';

import React, { useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Skeleton,
  Switch,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import dayjs from 'dayjs';
import {
  GET_MCR_DAILY_CHECK,
  GET_MCR_DAILY_CHECK_TEMPLATES,
  MCR_DAILY_CHECK_ENTRY_UPDATED_SUB,
  MCR_DAILY_CHECK_TEMPLATE_CHANGED_SUB,
} from '@/graphql/mcrQueries';
import {
  CREATE_MCR_DAILY_CHECK_TEMPLATE,
  DEACTIVATE_MCR_DAILY_CHECK_TEMPLATE,
  SET_MCR_DAILY_CHECK_COMPLETED,
  UPDATE_MCR_DAILY_CHECK_TEMPLATE,
} from '@/graphql/mcrMutations';
import RangeNavigator from './RangeNavigator';
import { useMcrRange } from '../hooks/useMcrRange';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import type { MCRDailyCheckEntry, MCRDailyCheckSummary, MCRDailyCheckTemplate } from '../types';

interface Props {
  canManage: boolean;
}

const DailyChecksArea: React.FC<Props> = ({ canManage }) => {
  const { message } = App.useApp();
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission(Permission.MCR_ADMIN);
  const range = useMcrRange();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MCRDailyCheckTemplate | null>(null);

  const dateIso = range.date.startOf('day').toISOString();

  const { data, loading, refetch } = useQuery(GET_MCR_DAILY_CHECK, {
    variables: { date: dateIso },
    fetchPolicy: 'cache-and-network',
  });

  // Live updates so when another operator ticks a check it appears
  // immediately on every connected screen.
  useSubscription(MCR_DAILY_CHECK_ENTRY_UPDATED_SUB, { onData: () => refetch() });
  useSubscription(MCR_DAILY_CHECK_TEMPLATE_CHANGED_SUB, { onData: () => refetch() });

  const summary: MCRDailyCheckSummary | null = data?.mcrDailyCheck || null;

  const [toggle] = useMutation(SET_MCR_DAILY_CHECK_COMPLETED, {
    refetchQueries: [{ query: GET_MCR_DAILY_CHECK, variables: { date: dateIso } }],
  });

  const handleToggle = async (entry: MCRDailyCheckEntry, next: boolean) => {
    try {
      await toggle({
        variables: {
          date: dateIso,
          templateId: entry.template.id,
          completed: next,
        },
      });
      message.success(next ? 'הבדיקה סומנה כהושלמה' : 'סימון הבדיקה בוטל');
    } catch (err: any) {
      message.error('עדכון נכשל: ' + (err?.message || 'שגיאה'));
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
        onModeChange={(m) => range.setMode(m === 'day' ? 'day' : 'day')}
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
            {isAdmin && (
              <Button onClick={() => setShowAdminPanel(true)} icon={<EditOutlined />}>
                ניהול בדיקות
              </Button>
            )}
          </>
        }
      />

      <div className="mcr-panel mcr-panel-padded flex flex-col gap-3">
        {!summary || loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-slate-800">
                  {summary.completed} מתוך {summary.total} בדיקות הושלמו
                </span>
                <span className="text-sm text-slate-500">
                  לתאריך {dayjs(summary.date).format('DD/MM/YYYY')}
                </span>
              </div>
              <Progress
                percent={summary.percentage}
                style={{ minWidth: 240 }}
                status={summary.percentage === 100 ? 'success' : 'active'}
              />
            </div>

            {summary.entries.length === 0 ? (
              <Empty description="לא הוגדרו בדיקות פעילות" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {summary.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`mcr-checklist-card ${entry.isCompleted ? 'is-done' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800">
                          {entry.template.name}
                        </span>
                        {entry.template.description && (
                          <span className="text-xs text-slate-500">
                            {entry.template.description}
                          </span>
                        )}
                      </div>
                      <Tooltip title={canManage ? '' : 'אין הרשאת ניהול'}>
                        <Switch
                          checked={entry.isCompleted}
                          disabled={!canManage}
                          onChange={(checked) => handleToggle(entry, checked)}
                          checkedChildren={<CheckCircleOutlined />}
                        />
                      </Tooltip>
                    </div>
                    {entry.isCompleted && (
                      <div className="text-xs text-emerald-700">
                        {entry.completedBy?.displayName && (
                          <span>בוצע ע&quot;י {entry.completedBy.displayName} </span>
                        )}
                        {entry.completedAt && (
                          <span>· {dayjs(entry.completedAt).format('DD/MM HH:mm')}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AdminTemplatesModal
        open={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        canManage={isAdmin}
        editingTemplate={editingTemplate}
        setEditingTemplate={setEditingTemplate}
      />
    </div>
  );
};

export default DailyChecksArea;

const AdminTemplatesModal: React.FC<{
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  editingTemplate: MCRDailyCheckTemplate | null;
  setEditingTemplate: (t: MCRDailyCheckTemplate | null) => void;
}> = ({ open, onClose, canManage, editingTemplate, setEditingTemplate }) => {
  const { message } = App.useApp();
  const { data, loading, refetch } = useQuery(GET_MCR_DAILY_CHECK_TEMPLATES, {
    variables: { activeOnly: false },
    skip: !open,
  });
  const [createTpl] = useMutation(CREATE_MCR_DAILY_CHECK_TEMPLATE, {
    refetchQueries: ['GetMCRDailyCheckTemplates', 'GetMCRDailyCheck'],
  });
  const [updateTpl] = useMutation(UPDATE_MCR_DAILY_CHECK_TEMPLATE, {
    refetchQueries: ['GetMCRDailyCheckTemplates', 'GetMCRDailyCheck'],
  });
  const [deactivateTpl] = useMutation(DEACTIVATE_MCR_DAILY_CHECK_TEMPLATE, {
    refetchQueries: ['GetMCRDailyCheckTemplates', 'GetMCRDailyCheck'],
  });

  const templates: MCRDailyCheckTemplate[] = data?.mcrDailyCheckTemplates || [];

  const submit = async (values: { name: string; description?: string }) => {
    try {
      if (editingTemplate) {
        await updateTpl({ variables: { id: editingTemplate.id, input: values } });
        message.success('הבדיקה עודכנה');
      } else {
        await createTpl({ variables: { input: values } });
        message.success('הבדיקה נוספה');
      }
      setEditingTemplate(null);
      refetch();
    } catch (err: any) {
      message.error('עדכון נכשל: ' + (err?.message || 'שגיאה'));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>סגור</Button>}
      title="ניהול בדיקות יומיות"
      width={720}
    >
      <div className="flex flex-col gap-4">
        <TemplateForm
          key={editingTemplate?.id || 'new'}
          initial={editingTemplate}
          onSubmit={submit}
          canManage={canManage}
          onCancel={() => setEditingTemplate(null)}
        />
        {loading ? (
          <Skeleton active />
        ) : (
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
            {templates.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 p-2 rounded border ${
                  t.isActive ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {t.name} {t.isDefault && <span className="text-xs text-blue-600">(ברירת מחדל)</span>}
                  </span>
                  {t.description && <span className="text-xs text-slate-500">{t.description}</span>}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setEditingTemplate(t)}
                  >
                    ערוך
                  </Button>
                  {t.isActive ? (
                    <Popconfirm
                      title="הסרת בדיקה?"
                      description="הבדיקה לא תופיע יותר ברשימת הבדיקות הפעילות."
                      onConfirm={() => deactivateTpl({ variables: { id: t.id } })}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        הסר
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      size="small"
                      onClick={() =>
                        updateTpl({ variables: { id: t.id, input: { isActive: true } } })
                      }
                    >
                      הפעל מחדש
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

const TemplateForm: React.FC<{
  initial: MCRDailyCheckTemplate | null;
  onSubmit: (v: { name: string; description?: string }) => void;
  canManage: boolean;
  onCancel: () => void;
}> = ({ initial, onSubmit, canManage, onCancel }) => {
  const [form] = Form.useForm();
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onSubmit}
      initialValues={initial || { name: '', description: '' }}
      disabled={!canManage}
    >
      <div className="flex gap-2 items-end">
        <Form.Item
          label="שם הבדיקה"
          name="name"
          rules={[{ required: true, message: 'נא להזין שם' }]}
          style={{ flex: 2, marginBottom: 0 }}
        >
          <Input placeholder="לדוגמה: בדיקת שרשרת שידור" />
        </Form.Item>
        <Form.Item label="תיאור" name="description" style={{ flex: 3, marginBottom: 0 }}>
          <Input placeholder="תיאור קצר" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
            {initial ? 'עדכן' : 'הוסף'}
          </Button>
        </Form.Item>
        {initial && (
          <Form.Item style={{ marginBottom: 0 }}>
            <Button onClick={onCancel}>ביטול</Button>
          </Form.Item>
        )}
      </div>
    </Form>
  );
};
