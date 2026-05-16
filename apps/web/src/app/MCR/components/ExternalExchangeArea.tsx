'use client';

import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LinkOutlined,
  PlusOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import {
  GET_MCR_EXCHANGE_GROUPS,
  MCR_EXCHANGE_GROUP_UPDATED_SUB,
} from '@/graphql/mcrQueries';
import {
  ACCEPT_MCR_EXCHANGE_UPLOAD,
  CLOSE_MCR_EXCHANGE_GROUP,
  CREATE_MCR_EXCHANGE_GROUP,
  LINK_MCR_EXCHANGE_GROUP_TO_EVENT,
  UNLINK_MCR_EXCHANGE_GROUP_FROM_EVENT,
} from '@/graphql/mcrMutations';
import type { MCREvent, MCRExchangeGroup } from '../types';
import { EXCHANGE_STATUS_COLORS, EXCHANGE_STATUS_LABELS } from '../constants';
import StatusChip from './StatusChip';

interface Props {
  selectedEvent: MCREvent | null;
  canManage: boolean;
}

const ExternalExchangeArea: React.FC<Props> = ({ selectedEvent, canManage }) => {
  const { message } = App.useApp();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const eventId = selectedEvent?.id;

  // Linked groups (scoped to the selected event)
  const linkedQuery = useQuery(GET_MCR_EXCHANGE_GROUPS, {
    variables: { mcrEventId: eventId },
    fetchPolicy: 'cache-and-network',
    skip: !eventId,
  });
  // All groups (used for the "link existing" picker)
  const allQuery = useQuery(GET_MCR_EXCHANGE_GROUPS, {
    fetchPolicy: 'cache-and-network',
  });

  // Live updates so accepting an upload / closing a group propagates to
  // everyone instantly. We refetch both queries because the linked-groups
  // and all-groups lists can both be impacted by a single change.
  useSubscription(MCR_EXCHANGE_GROUP_UPDATED_SUB, {
    onData: () => {
      linkedQuery.refetch();
      allQuery.refetch();
    },
  });

  const [createGroup] = useMutation(CREATE_MCR_EXCHANGE_GROUP, {
    refetchQueries: ['GetMCRExchangeGroups'],
  });
  const [closeGroup] = useMutation(CLOSE_MCR_EXCHANGE_GROUP, {
    refetchQueries: ['GetMCRExchangeGroups'],
  });
  const [linkGroup] = useMutation(LINK_MCR_EXCHANGE_GROUP_TO_EVENT, {
    refetchQueries: ['GetMCRExchangeGroups'],
  });
  const [unlinkGroup] = useMutation(UNLINK_MCR_EXCHANGE_GROUP_FROM_EVENT, {
    refetchQueries: ['GetMCRExchangeGroups'],
  });
  const [acceptUpload] = useMutation(ACCEPT_MCR_EXCHANGE_UPLOAD, {
    refetchQueries: ['GetMCRExchangeGroups'],
  });

  const linkedGroups: MCRExchangeGroup[] = useMemo(
    () => linkedQuery.data?.mcrExchangeGroups || [],
    [linkedQuery.data],
  );
  const allGroups: MCRExchangeGroup[] = useMemo(
    () => allQuery.data?.mcrExchangeGroups || [],
    [allQuery.data],
  );
  const linkableGroups = useMemo(
    () => allGroups.filter((g) => !linkedGroups.find((l) => l.id === g.id) && g.status !== 'CLOSED'),
    [allGroups, linkedGroups],
  );

  if (!selectedEvent) {
    return (
      <div className="mcr-panel mcr-panel-padded" dir="rtl">
        <Empty description="בחר אירוע בלשונית 'אירועי MCR' כדי לראות החלפות חיצוניות" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-col">
          <span className="text-sm text-slate-500">אירוע נבחר</span>
          <span className="font-semibold text-slate-800">{selectedEvent.title}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tooltip title="עדכון חי – נתונים מסונכרנים אוטומטית">
            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold px-2">
              <WifiOutlined />
              חי
            </span>
          </Tooltip>
          {canManage && (
            <Button icon={<LinkOutlined />} onClick={() => setShowLinkModal(true)}>
              קישור קבוצה קיימת
            </Button>
          )}
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreateModal(true)}>
              צור קבוצה חדשה
            </Button>
          )}
        </div>
      </div>

      <div className="mcr-panel mcr-panel-padded flex flex-col gap-3">
        {linkedQuery.loading ? (
          <Skeleton active />
        ) : linkedGroups.length === 0 ? (
          <Empty description="אין קבוצות החלפה מקושרות לאירוע זה" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {linkedGroups.map((g) => (
              <div key={g.id} className="mcr-exchange-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <div className="font-semibold text-slate-800">{g.name}</div>
                    {g.description && (
                      <div className="text-xs text-slate-500">{g.description}</div>
                    )}
                  </div>
                  <StatusChip
                    size="sm"
                    label={EXCHANGE_STATUS_LABELS[g.status]}
                    color={EXCHANGE_STATUS_COLORS[g.status]}
                  />
                </div>
                <div className="text-xs text-slate-500 flex gap-3">
                  <span>קולטים: <strong>{g.takerCount}</strong></span>
                  <span>סינופסיסים: <strong>{g.synopsisCount}</strong></span>
                  <span>
                    ממתינים: <strong>{g.pendingUploads.filter((u) => !u.isAccepted).length}</strong>
                  </span>
                </div>

                {g.pendingUploads.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1">
                    {g.pendingUploads.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{u.fileName}</span>
                          <span className="text-xs text-slate-500">
                            {u.uploadedByName && <>הועלה ע&quot;י {u.uploadedByName} </>}
                            {u.synopsisTitle && <>· {u.synopsisTitle}</>}
                          </span>
                        </div>
                        {u.isAccepted ? (
                          <Tag color="green" style={{ margin: 0 }}>
                            התקבל
                          </Tag>
                        ) : (
                          canManage && (
                            <Button
                              size="small"
                              type="primary"
                              icon={<CheckCircleOutlined />}
                              onClick={() =>
                                acceptUpload({
                                  variables: { groupId: g.id, uploadId: u.id },
                                })
                              }
                            >
                              אשר העלאה
                            </Button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-2">
                  <Tooltip title="עמוד החלפה מלא">
                    <Button
                      size="small"
                      onClick={() => window.open(`/external-broadcasts?group=${g.id}`, '_blank')}
                    >
                      עמוד מלא
                    </Button>
                  </Tooltip>
                  {canManage && (
                    <Popconfirm
                      title="ניתוק קבוצה"
                      description="להסיר את הקישור בין הקבוצה לאירוע?"
                      okText="כן"
                      cancelText="לא"
                      onConfirm={() =>
                        unlinkGroup({
                          variables: { groupId: g.id, mcrEventId: selectedEvent.id },
                        })
                      }
                    >
                      <Button size="small" icon={<CloseCircleOutlined />}>
                        נתק
                      </Button>
                    </Popconfirm>
                  )}
                  {canManage && g.status !== 'CLOSED' && (
                    <Popconfirm
                      title="סגירת קבוצה"
                      description="לאחר הסגירה לא ניתן יהיה להוסיף סינופסיסים. להמשיך?"
                      okText="כן, סגור"
                      cancelText="ביטול"
                      onConfirm={async () => {
                        try {
                          await closeGroup({ variables: { id: g.id } });
                          message.success('הקבוצה נסגרה');
                        } catch (err: any) {
                          message.error('סגירה נכשלה: ' + (err?.message || 'שגיאה'));
                        }
                      }}
                    >
                      <Button size="small" danger>
                        סגור קבוצה
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={showCreateModal}
        title="יצירת קבוצת החלפה חדשה"
        okText="צור"
        cancelText="ביטול"
        onCancel={() => setShowCreateModal(false)}
        destroyOnHidden
        onOk={async () => {
          // The Form.useForm hook is owned by the inner form. We trigger
          // submit via DOM since the modal is the host.
          (document.getElementById('mcr-create-exchange-form') as HTMLFormElement)?.requestSubmit();
        }}
      >
        <Form
          id="mcr-create-exchange-form"
          layout="vertical"
          onFinish={async (values) => {
            try {
              await createGroup({
                variables: {
                  input: {
                    name: values.name,
                    description: values.description,
                    linkedMcrEventId: selectedEvent.id,
                  },
                },
              });
              message.success('הקבוצה נוצרה וקושרה לאירוע');
              setShowCreateModal(false);
            } catch (err: any) {
              message.error('יצירה נכשלה: ' + (err?.message || 'שגיאה'));
            }
          }}
        >
          <Form.Item name="name" label="שם הקבוצה" rules={[{ required: true, message: 'נא להזין שם' }]}>
            <Input placeholder="לדוגמה: מבזק חדשות 18:00" />
          </Form.Item>
          <Form.Item name="description" label="תיאור (אופציונלי)">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Link existing modal */}
      <Modal
        open={showLinkModal}
        title="קישור קבוצה קיימת לאירוע"
        okText="קשר"
        cancelText="ביטול"
        onCancel={() => setShowLinkModal(false)}
        destroyOnHidden
        onOk={() => {
          (document.getElementById('mcr-link-exchange-form') as HTMLFormElement)?.requestSubmit();
        }}
      >
        <Form
          id="mcr-link-exchange-form"
          layout="vertical"
          onFinish={async (values) => {
            if (!values.groupId) {
              return;
            }
            try {
              await linkGroup({
                variables: { groupId: values.groupId, mcrEventId: selectedEvent.id },
              });
              message.success('הקבוצה קושרה לאירוע');
              setShowLinkModal(false);
            } catch (err: any) {
              message.error('קישור נכשל: ' + (err?.message || 'שגיאה'));
            }
          }}
        >
          <Form.Item
            name="groupId"
            label="בחר קבוצה"
            rules={[{ required: true, message: 'נא לבחור קבוצה' }]}
          >
            <Select
              placeholder="קבוצות זמינות לקישור"
              options={linkableGroups.map((g) => ({
                value: g.id,
                label: (
                  <div className="flex justify-between gap-2">
                    <span>{g.name}</span>
                    <StatusChip
                      size="sm"
                      label={EXCHANGE_STATUS_LABELS[g.status]}
                      color={EXCHANGE_STATUS_COLORS[g.status]}
                    />
                  </div>
                ),
              }))}
              notFoundContent={<div>אין קבוצות פעילות זמינות</div>}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ExternalExchangeArea;
