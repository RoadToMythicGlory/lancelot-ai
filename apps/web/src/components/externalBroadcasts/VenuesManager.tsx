'use client';

/**
 * Venues / stadiums manager — a panel that lists every venue saved in
 * the system and lets users with VENUES_MANAGE create, edit and
 * deactivate them. Each venue can carry:
 *   - basic metadata (name, city, address, capacity, notes),
 *   - one or more linked equipment presets (ExternalBroadcastPreset),
 *   - one or more crew structures (each is a list of jobs).
 *
 * Rendered inline on the External Broadcasts page. Activating "ייבוא
 * תבנית מאתר" inside the External Broadcast modal will read from this
 * same data via the `useVenuePicker` hook.
 */

import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import {
  GET_EXTERNAL_BROADCAST_PRESETS,
  GET_VENUES,
} from '@/graphql/queries';
import { CREATE_VENUE, DELETE_VENUE, UPDATE_VENUE } from '@/graphql/mutations';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/rbac';

const { Title, Text } = Typography;

interface CrewJobDraft {
  departmentCode: string;
  roleKey?: string | null;
  roleLabel?: string | null;
  count: number;
  userName?: string | null;
}

interface CrewStructureDraft {
  name: string;
  notes?: string | null;
  jobs: CrewJobDraft[];
}

interface VenueFormState {
  name: string;
  hebrewName: string;
  city: string;
  address: string;
  notes: string;
  capacity: number | null;
  equipmentPresetIds: string[];
  crewStructures: CrewStructureDraft[];
}

const emptyVenue = (): VenueFormState => ({
  name: '',
  hebrewName: '',
  city: '',
  address: '',
  notes: '',
  capacity: null,
  equipmentPresetIds: [],
  crewStructures: [],
});

const VenuesManager: React.FC = () => {
  const { message } = App.useApp();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.VENUES_MANAGE);

  const { data, loading, refetch } = useQuery(GET_VENUES, {
    variables: { includeInactive: false },
    fetchPolicy: 'cache-and-network',
  });
  const venues: any[] = data?.venues || [];

  const { data: presetData } = useQuery(GET_EXTERNAL_BROADCAST_PRESETS, {
    fetchPolicy: 'cache-first',
  });
  const presets: any[] = presetData?.externalBroadcastPresets || [];
  const presetOptions = useMemo(
    () => presets.map((p) => ({ value: p.id, label: p.name })),
    [presets],
  );

  const [createVenue] = useMutation(CREATE_VENUE, {
    onCompleted: () => {
      message.success('האולם נשמר');
      refetch();
    },
    onError: (err) => message.error(`שמירה נכשלה: ${err.message}`),
  });
  const [updateVenue] = useMutation(UPDATE_VENUE, {
    onCompleted: () => {
      message.success('האולם עודכן');
      refetch();
    },
    onError: (err) => message.error(`עדכון נכשל: ${err.message}`),
  });
  const [deleteVenue] = useMutation(DELETE_VENUE, {
    onCompleted: () => {
      message.success('האולם הוסר');
      refetch();
    },
    onError: (err) => message.error(`הסרה נכשלה: ${err.message}`),
  });

  const [editing, setEditing] = useState<{ id: string | null; state: VenueFormState } | null>(
    null,
  );

  const openCreate = () => setEditing({ id: null, state: emptyVenue() });
  const openEdit = (v: any) =>
    setEditing({
      id: v.id,
      state: {
        name: v.name || '',
        hebrewName: v.hebrewName || '',
        city: v.city || '',
        address: v.address || '',
        notes: v.notes || '',
        capacity: typeof v.capacity === 'number' ? v.capacity : null,
        equipmentPresetIds: v.equipmentPresetIds || [],
        crewStructures: (v.crewStructures || []).map((s: any) => ({
          name: s.name,
          notes: s.notes || '',
          jobs: (s.jobs || []).map((j: any) => ({
            departmentCode: j.departmentCode,
            roleKey: j.roleKey || null,
            roleLabel: j.roleLabel || null,
            count: typeof j.count === 'number' ? j.count : 1,
            userName: j.userName || null,
          })),
        })),
      },
    });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.state.name.trim()) {
      message.warning('יש להזין שם לאולם');
      return;
    }
    const input = {
      name: editing.state.name.trim(),
      hebrewName: editing.state.hebrewName || null,
      city: editing.state.city || null,
      address: editing.state.address || null,
      notes: editing.state.notes || null,
      capacity: editing.state.capacity,
      equipmentPresetIds: editing.state.equipmentPresetIds,
      crewStructures: editing.state.crewStructures.map((s) => ({
        name: s.name,
        notes: s.notes || null,
        jobs: s.jobs.map((j) => ({
          departmentCode: j.departmentCode,
          roleKey: j.roleKey || null,
          roleLabel: j.roleLabel || null,
          count: typeof j.count === 'number' ? j.count : 1,
          userName: j.userName || null,
        })),
      })),
    };
    if (editing.id) {
      await updateVenue({ variables: { id: editing.id, input } });
    } else {
      await createVenue({ variables: { input } });
    }
    setEditing(null);
  };

  const updateField = (patch: Partial<VenueFormState>) => {
    if (!editing) return;
    setEditing({ ...editing, state: { ...editing.state, ...patch } });
  };

  const addCrewStructure = () => {
    if (!editing) return;
    updateField({
      crewStructures: [
        ...editing.state.crewStructures,
        { name: 'מבנה חדש', jobs: [], notes: '' },
      ],
    });
  };

  const updateStructure = (idx: number, patch: Partial<CrewStructureDraft>) => {
    if (!editing) return;
    updateField({
      crewStructures: editing.state.crewStructures.map((s, i) =>
        i === idx ? { ...s, ...patch } : s,
      ),
    });
  };

  const removeStructure = (idx: number) => {
    if (!editing) return;
    updateField({
      crewStructures: editing.state.crewStructures.filter((_, i) => i !== idx),
    });
  };

  const addJobToStructure = (sIdx: number) => {
    if (!editing) return;
    const next = editing.state.crewStructures.map((s, i) =>
      i === sIdx
        ? {
            ...s,
            jobs: [
              ...s.jobs,
              { departmentCode: '', roleKey: null, roleLabel: null, count: 1 },
            ],
          }
        : s,
    );
    updateField({ crewStructures: next });
  };

  const updateJob = (sIdx: number, jIdx: number, patch: Partial<CrewJobDraft>) => {
    if (!editing) return;
    const next = editing.state.crewStructures.map((s, i) =>
      i === sIdx
        ? {
            ...s,
            jobs: s.jobs.map((j, jj) => (jj === jIdx ? { ...j, ...patch } : j)),
          }
        : s,
    );
    updateField({ crewStructures: next });
  };

  const removeJob = (sIdx: number, jIdx: number) => {
    if (!editing) return;
    const next = editing.state.crewStructures.map((s, i) =>
      i === sIdx ? { ...s, jobs: s.jobs.filter((_, jj) => jj !== jIdx) } : s,
    );
    updateField({ crewStructures: next });
  };

  return (
    <Card
      title={
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            אולמות / מקומות שידור
          </Title>
          <Text type="secondary">
            נשמרים מראש ומאפשרים אכלוס מהיר של ציוד וצוותים בכל שידור חוץ
          </Text>
        </Space>
      }
      extra={
        canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            אולם חדש
          </Button>
        )
      }
    >
      {loading && venues.length === 0 ? (
        <Empty description="טוען..." />
      ) : venues.length === 0 ? (
        <Empty description="לא הוגדרו אולמות עדיין" />
      ) : (
        <List
          dataSource={venues}
          renderItem={(v: any) => (
            <List.Item
              key={v.id}
              actions={
                canManage
                  ? [
                      <Tooltip title="ערוך" key="edit">
                        <Button
                          icon={<EditOutlined />}
                          size="small"
                          onClick={() => openEdit(v)}
                        />
                      </Tooltip>,
                      <Popconfirm
                        key="del"
                        title="להסיר אולם זה?"
                        okText="כן"
                        cancelText="לא"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteVenue({ variables: { id: v.id } })}
                      >
                        <Button icon={<DeleteOutlined />} danger size="small" />
                      </Popconfirm>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{v.hebrewName || v.name}</Text>
                    {v.city && <Tag color="blue">{v.city}</Tag>}
                    {v.crewStructures?.length > 0 && (
                      <Tag color="purple">
                        {v.crewStructures.length} מבני צוות
                      </Tag>
                    )}
                    {v.equipmentPresetIds?.length > 0 && (
                      <Tag color="green">
                        {v.equipmentPresetIds.length} תבניות ציוד
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    {v.address && <Text type="secondary">{v.address}</Text>}
                    {v.notes && <Text type="secondary">{v.notes}</Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        open={!!editing}
        title={editing?.id ? 'עריכת אולם' : 'אולם חדש'}
        onCancel={() => setEditing(null)}
        onOk={handleSave}
        okText="שמור"
        cancelText="בטל"
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={780}
        destroyOnClose
      >
        {editing && (
          <Form layout="vertical">
            <Form.Item label="שם (לוגי)" required>
              <Input
                value={editing.state.name}
                onChange={(e) => updateField({ name: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="שם בעברית">
              <Input
                value={editing.state.hebrewName}
                onChange={(e) => updateField({ hebrewName: e.target.value })}
              />
            </Form.Item>
            <Space style={{ width: '100%' }} align="start">
              <Form.Item label="עיר" style={{ flex: 1 }}>
                <Input
                  value={editing.state.city}
                  onChange={(e) => updateField({ city: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="כתובת" style={{ flex: 2 }}>
                <Input
                  value={editing.state.address}
                  onChange={(e) => updateField({ address: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="קיבולת">
                <InputNumber
                  min={0}
                  value={editing.state.capacity || undefined}
                  onChange={(v) => updateField({ capacity: v ?? null })}
                />
              </Form.Item>
            </Space>
            <Form.Item label="הערות">
              <Input.TextArea
                rows={2}
                value={editing.state.notes}
                onChange={(e) => updateField({ notes: e.target.value })}
              />
            </Form.Item>

            <Form.Item label="תבניות ציוד מקושרות">
              <Select
                mode="multiple"
                placeholder="בחר תבניות ציוד"
                value={editing.state.equipmentPresetIds}
                onChange={(vals) => updateField({ equipmentPresetIds: vals as string[] })}
                options={presetOptions}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </Form.Item>

            <div style={{ marginTop: 16 }}>
              <Space style={{ marginBottom: 8 }}>
                <Text strong>מבני צוות</Text>
                <Button size="small" icon={<PlusOutlined />} onClick={addCrewStructure}>
                  הוסף מבנה
                </Button>
              </Space>
              {editing.state.crewStructures.length === 0 ? (
                <Empty description="אין מבנים — הוסף לפחות אחד אם רוצים מילוי אוטומטי של צוות" />
              ) : (
                editing.state.crewStructures.map((s, sIdx) => (
                  <Card
                    key={sIdx}
                    size="small"
                    style={{ marginBottom: 8 }}
                    title={
                      <Space>
                        <Input
                          value={s.name}
                          onChange={(e) => updateStructure(sIdx, { name: e.target.value })}
                          placeholder="שם המבנה"
                          style={{ width: 200 }}
                        />
                      </Space>
                    }
                    extra={
                      <Popconfirm
                        title="להסיר מבנה זה?"
                        okText="כן"
                        cancelText="לא"
                        onConfirm={() => removeStructure(sIdx)}
                      >
                        <Button danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    }
                  >
                    <Form.Item label="הערות">
                      <Input
                        value={s.notes || ''}
                        onChange={(e) => updateStructure(sIdx, { notes: e.target.value })}
                      />
                    </Form.Item>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {s.jobs.map((j, jIdx) => (
                        <Space key={jIdx} wrap>
                          <Input
                            value={j.departmentCode}
                            onChange={(e) => updateJob(sIdx, jIdx, { departmentCode: e.target.value })}
                            placeholder="קוד מחלקה"
                            style={{ width: 160 }}
                          />
                          <Input
                            value={j.roleLabel || ''}
                            onChange={(e) =>
                              updateJob(sIdx, jIdx, {
                                roleLabel: e.target.value,
                                roleKey: e.target.value,
                              })
                            }
                            placeholder="שם תפקיד"
                            style={{ width: 160 }}
                          />
                          <InputNumber
                            min={1}
                            value={j.count}
                            onChange={(v) => updateJob(sIdx, jIdx, { count: Number(v) || 1 })}
                          />
                          <Input
                            value={j.userName || ''}
                            onChange={(e) => updateJob(sIdx, jIdx, { userName: e.target.value })}
                            placeholder="שם מומלץ (אופציונלי)"
                            style={{ width: 200 }}
                          />
                          <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => removeJob(sIdx, jIdx)}
                          />
                        </Space>
                      ))}
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => addJobToStructure(sIdx)}
                      >
                        הוסף תפקיד
                      </Button>
                    </Space>
                  </Card>
                ))
              )}
            </div>
          </Form>
        )}
      </Modal>
    </Card>
  );
};

export default VenuesManager;
