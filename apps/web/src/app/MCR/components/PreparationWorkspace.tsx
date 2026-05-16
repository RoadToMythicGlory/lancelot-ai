'use client';

import React, { useEffect, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  TimePicker,
  Tooltip,
} from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import RichTextEditor from './RichTextEditor';
import StatusChip from './StatusChip';
import SynopsisHelper from './SynopsisHelper';
import {
  PREPARATION_STATUS_COLORS,
  PREPARATION_STATUS_LABELS,
  PLATFORM_STATUS_COLORS,
  PLATFORM_STATUS_LABELS,
} from '../constants';
import type {
  MCRContact,
  MCREvent,
  MCRFeed,
  MCROutputPlatform,
  MCRPlatformStatus,
  MCRPreparationStatus,
} from '../types';

interface Props {
  event: MCREvent | null;
  saving: boolean;
  canManage: boolean;
  onSave: (next: MCREvent) => Promise<void>;
  onDelete?: (event: MCREvent) => Promise<void>;
}

function newId() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyFeed(): MCRFeed {
  return { id: newId() };
}
function emptyContact(): MCRContact {
  return { id: newId() };
}
function emptyPlatform(): MCROutputPlatform {
  return { id: newId(), status: 'PENDING' };
}

const PreparationWorkspace: React.FC<Props> = ({
  event,
  saving,
  canManage,
  onSave,
  onDelete,
}) => {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<MCREvent | null>(event);
  const [isDirty, setIsDirty] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState<MCRFeed | null>(null);
  const [showContactModal, setShowContactModal] = useState<MCRContact | null>(null);
  const [showPlatformModal, setShowPlatformModal] = useState<MCROutputPlatform | null>(null);
  const [showSynopsisHelper, setShowSynopsisHelper] = useState(false);
  const [showSavedAt, setShowSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setDraft(event);
    setIsDirty(false);
  }, [event?.id, event?.updatedAt]);

  const update = <K extends keyof MCREvent>(key: K, value: MCREvent[K]) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      await onSave(draft);
      setIsDirty(false);
      setShowSavedAt(dayjs().format('HH:mm:ss'));
      message.success('פרטי האירוע נשמרו');
    } catch (err: any) {
      message.error('שמירה נכשלה: ' + (err?.message || 'שגיאה לא ידועה'));
    }
  };

  if (!event || !draft) {
    return (
      <div className="mcr-panel mcr-panel-padded" dir="rtl">
        <Empty description="בחר אירוע מהרשימה כדי לפתוח את אזור ההכנה" />
      </div>
    );
  }

  const sourceLabel = draft.sourceLabel || (draft.broadcastEventId ? 'תכנון שידור' : 'אירוע ידני');

  const upsertFeed = (next: MCRFeed) => {
    if (!draft) return;
    const exists = draft.feeds.find((f) => f.id === next.id);
    const feeds = exists
      ? draft.feeds.map((f) => (f.id === next.id ? next : f))
      : [...draft.feeds, next];
    update('feeds', feeds);
  };

  const upsertContact = (next: MCRContact) => {
    if (!draft) return;
    const exists = draft.contacts.find((c) => c.id === next.id);
    const contacts = exists
      ? draft.contacts.map((c) => (c.id === next.id ? next : c))
      : [...draft.contacts, next];
    update('contacts', contacts);
  };

  const upsertPlatform = (next: MCROutputPlatform) => {
    if (!draft) return;
    const exists = draft.outputPlatforms.find((p) => p.id === next.id);
    const platforms = exists
      ? draft.outputPlatforms.map((p) => (p.id === next.id ? next : p))
      : [...draft.outputPlatforms, next];
    update('outputPlatforms', platforms);
  };

  const removeFeed = (id?: string) => {
    if (!draft || !id) return;
    update('feeds', draft.feeds.filter((f) => f.id !== id));
  };
  const removeContact = (id?: string) => {
    if (!draft || !id) return;
    update('contacts', draft.contacts.filter((c) => c.id !== id));
  };
  const removePlatform = (id?: string) => {
    if (!draft || !id) return;
    update('outputPlatforms', draft.outputPlatforms.filter((p) => p.id !== id));
  };

  return (
    <div className="mcr-panel" dir="rtl">
      {/* Header */}
      <div className="mcr-panel-header" style={{ alignItems: 'flex-start' }}>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <h2 className="truncate">{draft.title || 'אירוע ללא שם'}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{dayjs(draft.start).format('dddd, DD/MM/YYYY')}</span>
            <span>·</span>
            <Tag color="default" style={{ margin: 0 }}>
              {sourceLabel}
            </Tag>
            {showSavedAt && (
              <span className="text-emerald-600">
                <CheckOutlined /> נשמר ב-{showSavedAt}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <StatusChip
            label={PREPARATION_STATUS_LABELS[draft.preparationStatus]}
            color={PREPARATION_STATUS_COLORS[draft.preparationStatus]}
          />
          {canManage && onDelete && (
            <Popconfirm
              title="מחיקת אירוע"
              description="האירוע יוסר לצמיתות. להמשיך?"
              okText="כן, מחק"
              cancelText="ביטול"
              onConfirm={() => onDelete(draft)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                מחק
              </Button>
            </Popconfirm>
          )}
          <Button
            type="primary"
            disabled={!isDirty || !canManage}
            loading={saving}
            icon={<SaveOutlined />}
            onClick={handleSave}
          >
            שמור
          </Button>
        </div>
      </div>

      <div className="mcr-panel-padded flex flex-col gap-6">
        {/* Top editable details */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Form.Item label="סטטוס הכנה" colon={false} style={{ marginBottom: 0 }}>
            <Select
              value={draft.preparationStatus}
              onChange={(v: MCRPreparationStatus) => update('preparationStatus', v)}
              disabled={!canManage}
              options={(['NOT_STARTED', 'IN_PROGRESS', 'READY'] as MCRPreparationStatus[]).map(
                (s) => ({ value: s, label: PREPARATION_STATUS_LABELS[s] }),
              )}
            />
          </Form.Item>
          <Form.Item label="אולפן בקרה" colon={false} style={{ marginBottom: 0 }}>
            <Input
              value={draft.controlStudio || ''}
              onChange={(e) => update('controlStudio', e.target.value)}
              disabled={!canManage}
              placeholder="לדוגמה: אולפן 3"
            />
          </Form.Item>
          <Form.Item label="ערוץ שידור" colon={false} style={{ marginBottom: 0 }}>
            <Input
              value={draft.broadcastChannel || ''}
              onChange={(e) => update('broadcastChannel', e.target.value)}
              disabled={!canManage}
              placeholder="לדוגמה: ערוץ 11"
            />
          </Form.Item>
          <Form.Item label="התחלת MCR" colon={false} style={{ marginBottom: 0 }}>
            <TimePicker
              value={draft.mcrStartTime ? dayjs(draft.mcrStartTime) : null}
              onChange={(v) => update('mcrStartTime', v ? v.toISOString() : null)}
              disabled={!canManage}
              format="HH:mm"
              minuteStep={5}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="סיום MCR" colon={false} style={{ marginBottom: 0 }}>
            <TimePicker
              value={draft.mcrEndTime ? dayjs(draft.mcrEndTime) : null}
              onChange={(v) => update('mcrEndTime', v ? v.toISOString() : null)}
              disabled={!canManage}
              format="HH:mm"
              minuteStep={5}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </section>

        {/* Feeds */}
        <Section
          title="קליטות ולוויינים"
          count={draft.feeds.length}
          actions={
            canManage && (
              <>
                <Tooltip title="ניתוח מסמך סינופסיס">
                  <Button
                    size="small"
                    icon={<FileSearchOutlined />}
                    onClick={() => setShowSynopsisHelper(true)}
                  >
                    ייבוא ממסמך
                  </Button>
                </Tooltip>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setShowFeedModal(emptyFeed())}
                >
                  הוסף קליטה
                </Button>
              </>
            )
          }
        >
          {draft.feeds.length === 0 ? (
            <Empty description="לא הוגדרו קליטות עבור אירוע זה" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {draft.feeds.map((feed) => (
                <FeedCard
                  key={feed.id}
                  feed={feed}
                  canManage={canManage}
                  onEdit={() => setShowFeedModal(feed)}
                  onRemove={() => removeFeed(feed.id)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Contacts */}
        <Section
          title="אנשי קשר"
          count={draft.contacts.length}
          actions={
            canManage && (
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowContactModal(emptyContact())}
              >
                הוסף איש קשר
              </Button>
            )
          }
        >
          {draft.contacts.length === 0 ? (
            <Empty description="לא הוגדרו אנשי קשר" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {draft.contacts.map((c) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  canManage={canManage}
                  onEdit={() => setShowContactModal(c)}
                  onRemove={() => removeContact(c.id)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Output Platforms */}
        <Section
          title="פלטפורמות יציאה"
          count={draft.outputPlatforms.length}
          actions={
            canManage && (
              <>
                <Tooltip title="ניתוח מסמך סינופסיס">
                  <Button
                    size="small"
                    icon={<FileSearchOutlined />}
                    onClick={() => setShowSynopsisHelper(true)}
                  >
                    ייבוא ממסמך
                  </Button>
                </Tooltip>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setShowPlatformModal(emptyPlatform())}
                >
                  הוסף פלטפורמה
                </Button>
              </>
            )
          }
        >
          {draft.outputPlatforms.length === 0 ? (
            <Empty description="לא הוגדרו פלטפורמות יציאה" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {draft.outputPlatforms.map((p) => (
                <PlatformCard
                  key={p.id}
                  platform={p}
                  canManage={canManage}
                  onEdit={() => setShowPlatformModal(p)}
                  onRemove={() => removePlatform(p.id)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Preparation Notes */}
        <Section title="הערות הכנה" count={draft.preparationNotes ? 1 : 0}>
          <RichTextEditor
            value={draft.preparationNotes || ''}
            onChange={(v) => update('preparationNotes', v)}
            placeholder="הערות מפורטות, מקודים, רוטינות, אנשי קשר חירום, ועוד"
          />
        </Section>
      </div>

      {isDirty && (
        <div className="mcr-sticky-save" role="status" aria-live="polite">
          <LoadingOutlined spin={saving} style={{ display: saving ? 'inline' : 'none' }} />
          <span className="label">יש שינויים שלא נשמרו</span>
          <Button
            type="primary"
            ghost
            style={{ background: 'transparent', borderColor: '#fff', color: '#fff' }}
            icon={<SaveOutlined />}
            onClick={handleSave}
            disabled={!canManage}
            loading={saving}
          >
            שמור עכשיו
          </Button>
        </div>
      )}

      {/* Modals */}
      <FeedModal
        open={!!showFeedModal}
        value={showFeedModal}
        onClose={() => setShowFeedModal(null)}
        onSave={(v) => {
          upsertFeed(v);
          setShowFeedModal(null);
        }}
        canManage={canManage}
      />
      <ContactModal
        open={!!showContactModal}
        value={showContactModal}
        onClose={() => setShowContactModal(null)}
        onSave={(v) => {
          upsertContact(v);
          setShowContactModal(null);
        }}
        canManage={canManage}
      />
      <PlatformModal
        open={!!showPlatformModal}
        value={showPlatformModal}
        onClose={() => setShowPlatformModal(null)}
        onSave={(v) => {
          upsertPlatform(v);
          setShowPlatformModal(null);
        }}
        canManage={canManage}
      />
      <SynopsisHelper
        open={showSynopsisHelper}
        onClose={() => setShowSynopsisHelper(false)}
        canManage={canManage}
        onApply={({ feeds, platforms }) => {
          if (!draft) return;
          const next: MCREvent = {
            ...draft,
            feeds: [
              ...draft.feeds,
              ...feeds.map((f): MCRFeed => ({ id: newId(), ...f })),
            ],
            outputPlatforms: [
              ...draft.outputPlatforms,
              ...platforms.map(
                (p): MCROutputPlatform => ({ id: newId(), status: 'PENDING', ...p }),
              ),
            ],
          };
          setDraft(next);
          setIsDirty(true);
          setShowSynopsisHelper(false);
          message.success(
            `נוספו ${feeds.length} קליטות ו-${platforms.length} פלטפורמות לאירוע`,
          );
        }}
      />
    </div>
  );
};

export default PreparationWorkspace;

// ---------------- Sub-components ----------------

const Section: React.FC<{
  title: string;
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, count, actions, children }) => (
  <section className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="mcr-section-title">
        <span>{title}</span>
        {typeof count === 'number' && <span className="mcr-section-count">{count}</span>}
      </div>
      {actions && <div className="flex gap-1.5">{actions}</div>}
    </div>
    {children}
  </section>
);

const FeedCard: React.FC<{
  feed: MCRFeed;
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ feed, canManage, onEdit, onRemove }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-1">
    <div className="flex items-center justify-between gap-2">
      <div className="font-semibold text-slate-800 truncate">
        {feed.name || feed.satellite || 'קליטה'}
      </div>
      {canManage && (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={onEdit} />
          <Popconfirm
            title="הסרת קליטה"
            okText="כן"
            cancelText="לא"
            onConfirm={onRemove}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )}
    </div>
    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
      {feed.satellite && <span>לוויין: {feed.satellite}</span>}
      {feed.frequency && <span>תדר: {feed.frequency}</span>}
      {feed.symbolRate && <span>SR: {feed.symbolRate}</span>}
      {feed.polarization && <span>קוטביות: {feed.polarization}</span>}
      {feed.fec && <span>FEC: {feed.fec}</span>}
      {feed.format && <span>פורמט: {feed.format}</span>}
      {feed.encryptionType && <span>הצפנה: {feed.encryptionType}</span>}
      {feed.bissKey && <span>BISS Key: ••••</span>}
    </div>
    {feed.notes && <div className="text-sm text-slate-600 mt-1">{feed.notes}</div>}
  </div>
);

const ContactCard: React.FC<{
  contact: MCRContact;
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ contact, canManage, onEdit, onRemove }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-1">
    <div className="flex items-center justify-between gap-2">
      <div className="font-semibold text-slate-800 truncate">
        {contact.fullName || 'איש קשר'}
      </div>
      {canManage && (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={onEdit} />
          <Popconfirm
            title="הסרת איש קשר"
            okText="כן"
            cancelText="לא"
            onConfirm={onRemove}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )}
    </div>
    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
      {contact.role && <span>תפקיד: {contact.role}</span>}
      {contact.phone && <span>טלפון: {contact.phone}</span>}
      {contact.email && <span>דוא&quot;ל: {contact.email}</span>}
    </div>
    {contact.notes && <div className="text-sm text-slate-600 mt-1">{contact.notes}</div>}
  </div>
);

const PlatformCard: React.FC<{
  platform: MCROutputPlatform;
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ platform, canManage, onEdit, onRemove }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-1">
    <div className="flex items-center justify-between gap-2">
      <div className="font-semibold text-slate-800 truncate">
        {platform.name || 'פלטפורמה'}
      </div>
      <div className="flex gap-2 items-center">
        {platform.status && (
          <StatusChip
            size="sm"
            label={PLATFORM_STATUS_LABELS[platform.status]}
            color={PLATFORM_STATUS_COLORS[platform.status]}
          />
        )}
        {canManage && (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={onEdit} />
            <Popconfirm
              title="הסרת פלטפורמה"
              okText="כן"
              cancelText="לא"
              onConfirm={onRemove}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        )}
      </div>
    </div>
    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
      {platform.outputType && <span>סוג: {platform.outputType}</span>}
      {platform.details && (
        <span className="truncate" title={platform.details}>
          {platform.details}
        </span>
      )}
    </div>
  </div>
);

// ---------------- Modals ----------------

const FeedModal: React.FC<{
  open: boolean;
  value: MCRFeed | null;
  onSave: (v: MCRFeed) => void;
  onClose: () => void;
  canManage: boolean;
}> = ({ open, value, onSave, onClose, canManage }) => {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) form.setFieldsValue(value || {});
  }, [open, value, form]);
  return (
    <Modal
      open={open}
      title={value?.name ? 'עריכת קליטה' : 'הוספת קליטה'}
      onCancel={onClose}
      okText="שמור"
      cancelText="ביטול"
      okButtonProps={{ disabled: !canManage }}
      onOk={() => {
        form.validateFields().then((vals) => onSave({ id: value?.id || newId(), ...vals }));
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} disabled={!canManage}>
        <Form.Item name="name" label="שם הקליטה">
          <Input placeholder="לדוגמה: Feed ראשי" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-2">
          <Form.Item name="satellite" label="לוויין">
            <Input />
          </Form.Item>
          <Form.Item name="frequency" label="תדר">
            <Input placeholder="MHz" />
          </Form.Item>
          <Form.Item name="symbolRate" label="Symbol Rate">
            <Input />
          </Form.Item>
          <Form.Item name="polarization" label="קוטביות">
            <Select
              allowClear
              options={[
                { value: 'Horizontal', label: 'אופקי' },
                { value: 'Vertical', label: 'אנכי' },
                { value: 'Circular', label: 'מעגלי' },
              ]}
            />
          </Form.Item>
          <Form.Item name="fec" label="FEC">
            <Input />
          </Form.Item>
          <Form.Item name="format" label="פורמט">
            <Input />
          </Form.Item>
          <Form.Item name="encryptionType" label="סוג הצפנה">
            <Input />
          </Form.Item>
          <Form.Item name="encryptionKey" label="מפתח הצפנה">
            <Input.Password />
          </Form.Item>
          <Form.Item name="bissKey" label="BISS Key">
            <Input.Password />
          </Form.Item>
        </div>
        <Form.Item name="notes" label="הערות">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const ContactModal: React.FC<{
  open: boolean;
  value: MCRContact | null;
  onSave: (v: MCRContact) => void;
  onClose: () => void;
  canManage: boolean;
}> = ({ open, value, onSave, onClose, canManage }) => {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) form.setFieldsValue(value || {});
  }, [open, value, form]);
  return (
    <Modal
      open={open}
      title={value?.fullName ? 'עריכת איש קשר' : 'הוספת איש קשר'}
      onCancel={onClose}
      okText="שמור"
      cancelText="ביטול"
      okButtonProps={{ disabled: !canManage }}
      onOk={() => {
        form.validateFields().then((vals) => onSave({ id: value?.id || newId(), ...vals }));
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} disabled={!canManage}>
        <Form.Item name="fullName" label="שם מלא" rules={[{ required: true, message: 'נא להזין שם' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="role" label="תפקיד">
          <Input />
        </Form.Item>
        <Form.Item name="phone" label="טלפון">
          <Input />
        </Form.Item>
        <Form.Item name="email" label='דוא"ל'>
          <Input type="email" />
        </Form.Item>
        <Form.Item name="notes" label="הערות">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const PlatformModal: React.FC<{
  open: boolean;
  value: MCROutputPlatform | null;
  onSave: (v: MCROutputPlatform) => void;
  onClose: () => void;
  canManage: boolean;
}> = ({ open, value, onSave, onClose, canManage }) => {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) form.setFieldsValue(value || { status: 'PENDING' });
  }, [open, value, form]);
  return (
    <Modal
      open={open}
      title={value?.name ? 'עריכת פלטפורמה' : 'הוספת פלטפורמה'}
      onCancel={onClose}
      okText="שמור"
      cancelText="ביטול"
      okButtonProps={{ disabled: !canManage }}
      onOk={() => {
        form.validateFields().then((vals) =>
          onSave({ id: value?.id || newId(), status: 'PENDING', ...vals }),
        );
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} disabled={!canManage}>
        <Form.Item name="name" label="שם הפלטפורמה" rules={[{ required: true, message: 'נא להזין שם' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="outputType" label="סוג יציאה">
          <Input placeholder="SRT / RTMP / Satellite / OTT" />
        </Form.Item>
        <Form.Item name="status" label="סטטוס" initialValue="PENDING">
          <Select
            options={(['PENDING', 'CONFIRMED', 'LIVE', 'OFF'] as MCRPlatformStatus[]).map((s) => ({
              value: s,
              label: PLATFORM_STATUS_LABELS[s],
            }))}
          />
        </Form.Item>
        <Form.Item name="details" label="פרטים / כתובת">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="srt://... rtmps://... URL לשירות" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
