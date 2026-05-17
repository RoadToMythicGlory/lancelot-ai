'use client';

import React, { useState, useMemo } from 'react';
import { Card, List, Tag, Space, Select, Button, Typography, Empty, Badge, Row, Col, Collapse, Spin, Alert, Tooltip } from 'antd';
import {
  GlobalOutlined, VideoCameraOutlined, ToolOutlined, CheckCircleOutlined,
  AudioOutlined, SearchOutlined, SettingOutlined, SaveOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_EXTERNAL_BROADCAST_PRESETS, GET_WAREHOUSE_EQUIPMENT } from '@/graphql/queries';
import { UPDATE_EXTERNAL_BROADCAST_PRESET } from '@/graphql/mutations';

const { Text } = Typography;
const { Option } = Select;

const EQUIPMENT_CATEGORIES: Record<string, string> = {
  cameras: 'מצלמות',
  batteries: 'סוללות',
  liveu_kits: 'ערכות LIVEU',
  unity_kits: 'ערכות UNITY',
  monitors: 'מוניטורים',
  headphones: 'אוזניות',
  stabilizers: 'מייצבים',
  cards: 'כרטיסים',
  adapters: 'מתאמים',
  matrix_components: 'רכיבי מטריצה',
  other: 'אחר',
};

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand?: string;
  equipmentModel?: string;
  quantityAvailable: number;
  status: string;
}

interface UnitSetting {
  unitIndex: number;
  purpose: string;
  audioConfig?: string;
  assignedEquipmentId?: string;
  assignedEquipmentName?: string;
}

interface PresetEquipment {
  category: string;
  categoryLabel: string;
  count: number;
  unitSettings?: UnitSetting[];
}

interface Preset {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  roles: Array<{ roleKey: string; roleLabel: string; count: number; isCustom: boolean }>;
  equipment: PresetEquipment[];
}

interface Props {
  message: any;
  canManage?: boolean;
}

const ExternalBroadcastRequests: React.FC<Props> = ({ message, canManage = false }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, Record<number, { id: string; name: string }>>>({});

  const { data: presetsData, loading: presetsLoading, error: presetsError, refetch: refetchPresets } = useQuery(GET_EXTERNAL_BROADCAST_PRESETS, {
    fetchPolicy: 'cache-and-network',
  });
  const presets: Preset[] = presetsData?.externalBroadcastPresets || [];

  const { data: equipmentData } = useQuery(GET_WAREHOUSE_EQUIPMENT);
  const allEquipment: Equipment[] = equipmentData?.warehouseEquipment || [];

  const [updatePreset, { loading: saving }] = useMutation(UPDATE_EXTERNAL_BROADCAST_PRESET, {
    refetchQueries: ['GetExternalBroadcastPresets'],
  });

  const presetsWithEquipment = useMemo(() =>
    presets.filter(p => p.equipment.length > 0),
    [presets]
  );

  const selectedPreset = useMemo(() =>
    presetsWithEquipment.find(p => p.id === selectedPresetId) || null,
    [presetsWithEquipment, selectedPresetId]
  );

  const equipmentByCategory = useMemo(() => {
    const grouped: Record<string, Equipment[]> = {};
    allEquipment.forEach(eq => {
      if (!grouped[eq.category]) grouped[eq.category] = [];
      grouped[eq.category].push(eq);
    });
    return grouped;
  }, [allEquipment]);

  const handleAssignmentChange = (category: string, unitIndex: number, equipmentId: string) => {
    const eq = allEquipment.find(e => e.id === equipmentId);
    setAssignments(prev => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [unitIndex]: { id: equipmentId, name: eq?.name || '' },
      },
    }));
  };

  const handleSaveAssignments = async () => {
    if (!selectedPreset) return;
    try {
      const updatedEquipment = selectedPreset.equipment.map(eq => {
        const categoryAssignments = assignments[eq.category] || {};
        const existingSettings = eq.unitSettings || [];

        const unitSettings = Array.from({ length: eq.count }, (_, i) => {
          const existing = existingSettings.find(u => u.unitIndex === i) || { unitIndex: i, purpose: '', audioConfig: '' };
          const newAssignment = categoryAssignments[i];
          return {
            unitIndex: i,
            purpose: existing.purpose || '',
            audioConfig: existing.audioConfig || undefined,
            assignedEquipmentId: newAssignment?.id || existing.assignedEquipmentId || undefined,
            assignedEquipmentName: newAssignment?.name || existing.assignedEquipmentName || undefined,
          };
        });

        return {
          category: eq.category,
          categoryLabel: eq.categoryLabel,
          count: eq.count,
          unitSettings,
        };
      });

      await updatePreset({
        variables: {
          id: selectedPreset.id,
          input: { equipment: updatedEquipment },
        },
      });

      message.success('הקצאות הציוד נשמרו בפריסט בהצלחה');
      setAssignments({});
      await refetchPresets();
    } catch (err: any) {
      message.error(`שגיאה בשמירה: ${err.message}`);
    }
  };

  // Load existing assignments when preset is selected
  const loadPresetAssignments = (preset: Preset) => {
    setSelectedPresetId(preset.id);
    setAssignments({});
  };

  if (presetsLoading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 40 }} />;
  if (presetsError) return <Alert message="שגיאה בטעינת פריסטים" type="error" showIcon />;

  return (
    <div style={{ direction: 'rtl' }}>
      <Row gutter={16}>
        {/* Preset list */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <GlobalOutlined />
                <span>פריסטים עם דרישות ציוד</span>
                <Badge count={presetsWithEquipment.length} style={{ backgroundColor: '#1890ff' }} />
              </Space>
            }
          >
            {presetsWithEquipment.length === 0 ? (
              <Empty description="אין פריסטים עם דרישות ציוד" />
            ) : (
              <List
                size="small"
                dataSource={presetsWithEquipment}
                renderItem={preset => {
                  const totalUnits = preset.equipment.reduce((s, e) => s + e.count, 0);
                  const assignedUnits = preset.equipment.reduce((s, e) =>
                    s + (e.unitSettings?.filter(u => u.assignedEquipmentId)?.length || 0), 0
                  );

                  return (
                    <List.Item
                      onClick={() => loadPresetAssignments(preset)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedPresetId === preset.id ? '#e6f7ff' : undefined,
                        padding: '8px 12px',
                        borderRadius: 4,
                      }}
                    >
                      <List.Item.Meta
                        title={<Text strong>{preset.name}</Text>}
                        description={
                          <Space size={4} wrap>
                            {preset.equipment.map((e, i) => (
                              <Tag key={i} color="orange">{e.categoryLabel} x{e.count}</Tag>
                            ))}
                            <Tag color={assignedUnits >= totalUnits ? 'green' : assignedUnits > 0 ? 'gold' : 'default'}>
                              {assignedUnits}/{totalUnits} הוקצו
                            </Tag>
                          </Space>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* Assignment panel */}
        <Col xs={24} lg={16}>
          {!selectedPreset ? (
            <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
              <Empty
                image={<ToolOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
                description={<Text type="secondary">בחר פריסט מהרשימה כדי להקצות ציוד ספציפי</Text>}
              />
            </Card>
          ) : (
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <ToolOutlined />
                    <Text strong>הקצאת ציוד לפריסט - {selectedPreset.name}</Text>
                  </Space>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSaveAssignments}
                    loading={saving}
                    disabled={!canManage || Object.keys(assignments).length === 0}
                  >
                    שמור הקצאות
                  </Button>
                </div>
              }
            >
              {selectedPreset.description && (
                <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
                  <Text type="secondary">{selectedPreset.description}</Text>
                </Card>
              )}

              {selectedPreset.equipment.map(eq => {
                const categoryEquipment = equipmentByCategory[eq.category] || [];
                const availableEquipment = categoryEquipment.filter(e => e.status !== 'maintenance' && e.quantityAvailable > 0);
                const unitSettings = eq.unitSettings || [];

                return (
                  <Card
                    key={eq.category}
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={
                      <Space>
                        {eq.category === 'cameras' ? <VideoCameraOutlined /> : <ToolOutlined />}
                        <Text strong>{eq.categoryLabel}</Text>
                        <Tag color="blue">דרישה: {eq.count}</Tag>
                        <Tag color={
                          unitSettings.filter(u => u.assignedEquipmentId).length >= eq.count ? 'green' :
                          unitSettings.filter(u => u.assignedEquipmentId).length > 0 ? 'gold' : 'default'
                        }>
                          {unitSettings.filter(u => u.assignedEquipmentId).length}/{eq.count} הוקצו
                        </Tag>
                      </Space>
                    }
                  >
                    {Array.from({ length: eq.count }, (_, idx) => {
                      const unit = unitSettings.find(u => u.unitIndex === idx) || { unitIndex: idx, purpose: '', audioConfig: '' };
                      const newAssignment = assignments[eq.category]?.[idx];
                      const currentEquipId = newAssignment?.id || unit.assignedEquipmentId;
                      const currentEquipName = newAssignment?.name || unit.assignedEquipmentName;

                      return (
                        <Row key={idx} gutter={8} style={{
                          marginBottom: 8,
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: idx < eq.count - 1 ? '1px solid #f5f5f5' : undefined,
                        }}>
                          <Col style={{ width: 36 }}>
                            <Tag>{idx + 1}</Tag>
                          </Col>
                          <Col flex="1">
                            <Space wrap size={4}>
                              {unit.purpose && (
                                <Tooltip title="ייעוד">
                                  <Tag color="geekblue"><SettingOutlined /> {unit.purpose}</Tag>
                                </Tooltip>
                              )}
                              {unit.audioConfig && (
                                <Tooltip title="הגדרת אודיו">
                                  <Tag color="purple"><AudioOutlined /> {unit.audioConfig}</Tag>
                                </Tooltip>
                              )}
                              {!unit.purpose && !unit.audioConfig && (
                                <Text type="secondary" style={{ fontSize: 12 }}>ללא הגדרות</Text>
                              )}
                            </Space>
                          </Col>
                          <Col style={{ width: 320 }}>
                            <Select
                              placeholder="בחר ציוד ספציפי"
                              value={currentEquipId || undefined}
                              onChange={v => handleAssignmentChange(eq.category, idx, v)}
                              style={{ width: '100%' }}
                              size="small"
                              allowClear
                              disabled={!canManage}
                              showSearch
                              filterOption={(input, option) =>
                                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
                              }
                            >
                              {availableEquipment.map(e => (
                                <Option key={e.id} value={e.id}>
                                  {e.name} {e.equipmentModel ? `(${e.equipmentModel})` : ''} - {e.quantityAvailable} זמין
                                </Option>
                              ))}
                            </Select>
                          </Col>
                          <Col>
                            {currentEquipId && !newAssignment && (
                              <Tag color="green"><CheckCircleOutlined /> {currentEquipName}</Tag>
                            )}
                          </Col>
                        </Row>
                      );
                    })}
                  </Card>
                );
              })}
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default ExternalBroadcastRequests;
