import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, Button, Space, Card, Row, Col, Tag, Table, Divider, InputNumber, Input, App } from 'antd';
import { 
  ToolOutlined, 
  TeamOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  UserOutlined,
  GlobalOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { useApolloClient, useQuery, useMutation } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT_FOR_PICKER, GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS, GET_BROADCAST_EVENT } from '../../graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import DynamicDepartmentJobsPanel, { AssignmentJob } from '../assignments/DynamicDepartmentJobsPanel';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';
import { ensureAvailabilityOk } from '../shifts/availabilityWarning';

const { Option } = Select;

interface BroadcastEvent {
  id: string;
  title: string;
  [key: string]: any;
}

interface ExternalBroadcastsModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onDataSaved?: () => void;
  /** When false, hides save / not-applicable buttons and disables form fields. */
  canEdit?: boolean;
}

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand: string;
  barcode?: string | null;
  quantityAvailable: number;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  department: string;
  phone?: string;
  mobile?: string;
  systemRole?: string;
  departments?: Array<{
    departmentId: string;
    departmentName: string;
    roles: string[];
  }>;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const ExternalBroadcastsModal: React.FC<ExternalBroadcastsModalProps> = ({ visible, event, onClose, onDataSaved, canEdit = true }) => {
  const { modal } = App.useApp();
  const apolloClient = useApolloClient();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Array<{ id: string; quantity: number }>>([]);
  const [departmentIds, setDepartmentIds] = useState<Record<string, string>>({});
  const [dynamicJobs, setDynamicJobs] = useState<AssignmentJob[]>([]);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  // Category filters for the equipment table come from the canonical catalog
  // — replacing the previously-hardcoded English values (camera/audio/...) which
  // didn't actually match the slugs the backend stores (cameras/sound/...).
  const { activeCategories: equipmentCategories } = useEquipmentCategories();

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    refetchQueries: ['GetBroadcastEvents'],
    awaitRefetchQueries: true,
    onCompleted: () => {
      // console.log('✅ External Broadcasts data saved successfully');
      setLoading(false);
      // Close modal and cleanup after successful save
      form.resetFields();
      setSelectedEquipment([]);
      onClose();
      if (onDataSaved) {
        onDataSaved();
      }
    },
    onError: (error) => {
      console.error('❌ Error saving External Broadcasts data:', error);
      setLoading(false);
    }
  });

  // Full active equipment catalog (up to 5,000 rows). The previous
  // `warehouseEquipment` query is hard-capped at 500 server-side and
  // defaulted to 200 here, which silently truncated the picker for a
  // catalog of ~4,000+ items. The picker projection ships only the
  // fields we render, so the payload stays small even at the higher cap.
  const { data: equipmentData, loading: equipmentLoading } = useQuery(
    GET_WAREHOUSE_EQUIPMENT_FOR_PICKER,
    {
      skip: !visible,
      fetchPolicy: 'cache-first',
    },
  );
  const equipment: Equipment[] = useMemo(() => {
    const rows: any[] = equipmentData?.warehouseEquipmentForPicker || [];
    return rows
      .filter((r) => !r?.isDisabled)
      .map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category ?? '',
        brand: r.brand ?? '',
        barcode: r.barcode ?? null,
        quantityAvailable: typeof r.quantityAvailable === 'number' ? r.quantityAvailable : 0,
      }));
  }, [equipmentData]);

  const filteredEquipment: Equipment[] = useMemo(() => {
    const term = equipmentSearch.trim().toLowerCase();
    if (!term) return equipment;
    return equipment.filter((e) => {
      return (
        e.name?.toLowerCase().includes(term) ||
        e.brand?.toLowerCase().includes(term) ||
        e.category?.toLowerCase().includes(term) ||
        (e.barcode ? e.barcode.toLowerCase().includes(term) : false)
      );
    });
  }, [equipment, equipmentSearch]);

  // Query for all departments to get IDs
  const { data: departmentsData } = useQuery(GET_DEPARTMENTS, {
    skip: !visible
  });

  // Set department IDs when departments data is loaded
  useEffect(() => {
    if (departmentsData?.departments) {
      const deptMap: Record<string, string> = {};
      departmentsData.departments.forEach((dept: any) => {
        deptMap[dept.code] = dept.id;
      });
      setDepartmentIds(deptMap);
    }
  }, [departmentsData]);

  // Query for broadcast event details
  const { data: eventData } = useQuery(GET_BROADCAST_EVENT, {
    variables: { id: event?.id },
    skip: !event?.id || !visible
  });

  // Load existing data when modal opens
  useEffect(() => {
    if (visible) {
      // Reset the equipment search filter so it doesn't bleed across
      // events when the same modal instance is reused.
      setEquipmentSearch('');

      // First try to use the event data passed as prop
      let metadata = event?.metadata || {};
      
      // If we have fresh data from the query, use that instead
      if (eventData?.broadcastEvent?.metadata) {
        metadata = eventData.broadcastEvent.metadata;
      }
      
      // Check both in customData and directly in department data
      const externalBroadcastsDept = metadata.departments?.externalBroadcasts || {};
      const equipmentList = externalBroadcastsDept.customData?.equipmentList || 
                           externalBroadcastsDept.equipmentList || [];
      const productionCrew = externalBroadcastsDept.customData?.productionCrew || 
                            externalBroadcastsDept.productionCrew || [];
      
      // Load equipment selections
      if (equipmentList.length > 0) {
        const equipmentSelections = equipmentList.map((item: any) => ({
          id: item.equipmentId,
          quantity: item.quantity
        }));
        setSelectedEquipment(equipmentSelections);
        console.log('📥 Loaded existing equipment selections:', equipmentSelections);
      } else {
        // Only clear if we're opening and there's no existing data
        setSelectedEquipment([]);
      }
      
      // Load production crew selections
      if (productionCrew.length > 0) {
        const formValues: any = {};
        
        // Group crew by role
        const crewByRole = productionCrew.reduce((acc: any, member: any) => {
          if (!acc[member.role]) acc[member.role] = [];
          acc[member.role].push(member.userId);
          return acc;
        }, {});
        
        // Set form values
        Object.keys(crewByRole).forEach(role => {
          formValues[role] = crewByRole[role];
        });
        
        form.setFieldsValue(formValues);
        console.log('📥 Loaded existing crew selections:', formValues);
      } else {
        // Clear form if no existing data
        form.resetFields();
      }

      // Load admin-configurable jobs (new system)
      const savedDynamicJobs: any[] = externalBroadcastsDept.customData?.dynamicJobs || externalBroadcastsDept.dynamicJobs || [];
      setDynamicJobs(
        Array.isArray(savedDynamicJobs)
          ? savedDynamicJobs.map((j: any, i: number) => ({
              uid: `loaded_${i}_${Date.now()}`,
              departmentCode: j.departmentCode,
              roleKey: j.roleKey,
              roleLabel: j.roleLabel,
              count: typeof j.count === 'number' ? j.count : 1,
              userId: j.userId,
              userName: j.userName,
            }))
          : [],
      );
    }
  }, [visible, event, eventData, form]);

  // Query for cameramen
  const { data: cameramenData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: departmentIds['CAM'],
        isActive: true 
      }
    },
    skip: !visible || !departmentIds['CAM']
  });

  // Query for sound engineers
  const { data: soundmenData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: departmentIds['SOUND'],
        isActive: true 
      }
    },
    skip: !visible || !departmentIds['SOUND']
  });

  // Query for producers
  const { data: producersData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: departmentIds['PROD'],
        isActive: true 
      }
    },
    skip: !visible || !departmentIds['PROD']
  });

  // Query for directors
  const { data: directorsData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: departmentIds['DIR'],
        isActive: true 
      }
    },
    skip: !visible || !departmentIds['DIR']
  });

  const cameramen: Employee[] = cameramenData?.users || [];
  const soundmen: Employee[] = soundmenData?.users || [];
  const producers: Employee[] = producersData?.users || [];
  const directors: Employee[] = directorsData?.users || [];

  // Production roles with specific employee lists
  const productionRoles = [
    { key: 'cameraman', label: 'צלם', icon: <VideoCameraOutlined />, employees: cameramen },
    { key: 'soundman', label: 'סאונדמן', icon: <AudioOutlined />, employees: soundmen },
    { key: 'producer', label: 'מפיק', icon: <UserOutlined />, employees: producers },
    { key: 'director', label: 'במאי', icon: <UserOutlined />, employees: directors },
  ];

  const handleEquipmentChange = (equipmentId: string, quantity: number) => {
    setSelectedEquipment(prev => {
      const existing = prev.find(e => e.id === equipmentId);
      if (existing) {
        if (quantity === 0) {
          return prev.filter(e => e.id !== equipmentId);
        }
        return prev.map(e => e.id === equipmentId ? { ...e, quantity } : e);
      }
      return [...prev, { id: equipmentId, quantity }];
    });
  };

  const handleSubmit = async (values: any) => {
    if (!canEdit) {
      console.warn('Save attempted without BROADCAST_MANAGE permission');
      return;
    }
    setLoading(true);
    try {
      // Prepare production crew data
      const productionCrew: any[] = [];
      
      // Add selected cameramen
      if (values.cameraman && values.cameraman.length > 0) {
        values.cameraman.forEach((id: string) => {
          const cameraman = cameramen.find(c => c.id === id);
          if (cameraman) {
            productionCrew.push({
              role: 'cameraman',
              userId: id,
              name: cameraman.displayName || `${cameraman.firstName} ${cameraman.lastName}`,
              phone: cameraman.phone
            });
          }
        });
      }
      
      // Add selected soundmen
      if (values.soundman && values.soundman.length > 0) {
        values.soundman.forEach((id: string) => {
          const soundman = soundmen.find(s => s.id === id);
          if (soundman) {
            productionCrew.push({
              role: 'soundman',
              userId: id,
              name: soundman.displayName || `${soundman.firstName} ${soundman.lastName}`,
              phone: soundman.phone
            });
          }
        });
      }
      
      // Add selected producers
      if (values.producer && values.producer.length > 0) {
        values.producer.forEach((id: string) => {
          const producer = producers.find(p => p.id === id);
          if (producer) {
            productionCrew.push({
              role: 'producer',
              userId: id,
              name: producer.displayName || `${producer.firstName} ${producer.lastName}`,
              phone: producer.phone
            });
          }
        });
      }
      
      // Add selected directors
      if (values.director && values.director.length > 0) {
        values.director.forEach((id: string) => {
          const director = directors.find(d => d.id === id);
          if (director) {
            productionCrew.push({
              role: 'director',
              userId: id,
              name: director.displayName || `${director.firstName} ${director.lastName}`,
              phone: director.phone
            });
          }
        });
      }

      // Prepare equipment list
      const equipmentList = selectedEquipment.map(item => {
        const eq = equipment.find(e => e.id === item.id);
        return {
          equipmentId: item.id,
          quantity: item.quantity,
          name: eq?.name || '',
          category: eq?.category || ''
        };
      });

      // Prepare the data for saving - wrap in customData like MCR does
      const departmentData = {
        customData: {
          productionCrew: productionCrew,
          equipmentList: equipmentList,
          dynamicJobs: dynamicJobs.map((j) => ({
            departmentCode: j.departmentCode,
            roleKey: j.roleKey,
            roleLabel: j.roleLabel,
            count: j.count || 1,
            userId: j.userId,
            userName: j.userName,
          })),
          notApplicable: false // Clear the not applicable flag when saving data
        }
      };

      // console.log('📤 External Broadcasts - Saving data:', departmentData);

      // Preflight: warn the operator if any selected internal user has
      // marked themselves unavailable for the event's time window. We
      // pull ids from both the predefined `productionCrew` roles and
      // the admin-configurable `dynamicJobs` list.
      const internalUserIds: string[] = [
        ...productionCrew
          .map((c) => c.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ...dynamicJobs
          .map((j) => j.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ];
      if (internalUserIds.length > 0) {
        const ok = await ensureAvailabilityOk(apolloClient, modal, {
          userIds: internalUserIds,
          startTime: (event as any)?.startTime || null,
          endTime: (event as any)?.endTime || null,
        });
        if (!ok) {
          setLoading(false);
          return;
        }
      }

      // Call the mutation to save to MongoDB
      await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'externalBroadcasts',
          data: departmentData
        }
      });
      
      // Don't close here - let the onCompleted handler do it
    } catch (error) {
      console.error('Error saving external broadcast data:', error);
    } finally {
      setLoading(false);
    }
  };

  const equipmentColumns = [
    {
      title: 'ציוד',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Equipment) => (
        <Space>
          <ToolOutlined />
          <span>{name}</span>
          <Tag color="blue">{record.brand}</Tag>
        </Space>
      )
    },
    {
      title: 'קטגוריה',
      dataIndex: 'category',
      key: 'category',
      filters: equipmentCategories.map((c) => ({ text: c.labelHe, value: c.slug })),
      onFilter: (value: any, record: Equipment) => record.category === value
    },
    {
      title: 'זמין',
      dataIndex: 'quantityAvailable',
      key: 'quantityAvailable',
      render: (available: number) => (
        <Tag color={available > 0 ? 'green' : 'red'}>
          {available} יחידות
        </Tag>
      )
    },
    {
      title: 'כמות לבקש',
      key: 'quantity',
      render: (_: any, record: Equipment) => {
        const selected = selectedEquipment.find(e => e.id === record.id);
        return (
          <InputNumber
            min={0}
            max={record.quantityAvailable}
            value={selected?.quantity || 0}
            onChange={(value) => handleEquipmentChange(record.id, value || 0)}
            disabled={record.quantityAvailable === 0 || !canEdit}
          />
        );
      }
    }
  ];

  const renderEmployeeOption = (employee: Employee) => {
    const displayName = employee.displayName || `${employee.firstName} ${employee.lastName}`;
    
    return (
      <Option key={employee.id} value={employee.id}>
        {displayName}
        {employee.systemRole && (
          <span className="text-gray-500 text-sm mr-2"> - {employee.systemRole}</span>
        )}
      </Option>
    );
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <GlobalOutlined />
          <span>שידורי חוץ</span>
          {!canEdit && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: '#fff7e6',
              color: '#ad6800',
              border: '1px solid #ffd591',
              fontSize: 12,
              fontWeight: 500,
            }}>
              לקריאה בלבד
            </span>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={canEdit ? [
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button 
          key="not-for-us" 
          type="default"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              // Save only the not applicable flag
              const departmentData = {
                customData: {
                  notApplicable: true
                }
              };
              
              await updateDepartmentData({
                variables: {
                  eventId: event.id,
                  department: 'externalBroadcasts',
                  data: departmentData
                }
              });
              
              if (onDataSaved) {
                onDataSaved();
              }
              onClose();
            } catch (error) {
              console.error('Error marking as not applicable:', error);
              setLoading(false);
            }
          }}
        >
          לא עבורנו
        </Button>,
        <Button 
          key="save" 
          type="primary" 
          loading={loading}
          onClick={() => form.submit()}
        >
          שמור הגדרות
        </Button>
      ] : [
        <Button key="close" onClick={onClose}>
          סגור
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={!canEdit}
      >
        <div className="mb-4">
          <Card size="small" className="bg-orange-50">
            <Row>
              <Col span={12}>
                <strong>אירוע:</strong> {event.title}
              </Col>
              <Col span={12}>
                <strong>זמן:</strong> {event.תאריך} | {event.שעה}
              </Col>
            </Row>
          </Card>
        </div>

        {/* Equipment Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h3 className="text-lg font-semibold flex items-center gap-2 m-0">
              <ToolOutlined />
              ציוד נדרש
              <span className="text-sm text-gray-500 font-normal">
                ({filteredEquipment.length.toLocaleString('he-IL')} / {equipment.length.toLocaleString('he-IL')})
              </span>
            </h3>
            <Input
              allowClear
              placeholder="חיפוש ציוד לפי שם, מותג, קטגוריה או ברקוד"
              prefix={<SearchOutlined />}
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>
          <Table
            columns={equipmentColumns}
            dataSource={filteredEquipment}
            rowKey="id"
            size="small"
            loading={equipmentLoading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `סה"כ ${total.toLocaleString('he-IL')} פריטים`,
            }}
          />
        </div>

        <Divider />

        {/* Production Crew */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TeamOutlined />
            צוות הפקה
          </h3>
          
          <Row gutter={[16, 16]}>
            {productionRoles.map(role => (
              <Col key={role.key} xs={24} sm={12} md={12}>
                <Form.Item
                  name={role.key}
                  label={
                    <Space>
                      {role.icon}
                      {role.label}
                    </Space>
                  }
                >
                  <Select
                    mode="multiple"
                    placeholder={`בחר ${role.label}`}
                    loading={!role.employees.length && visible}
                    notFoundContent={
                      !role.employees.length ? `אין ${role.label}ים זמינים` : 'לא נמצאו תוצאות'
                    }
                    filterOption={(input, option) => {
                      const employee = role.employees.find(e => e.id === option?.value);
                      if (!employee) return false;
                      const name = employee.displayName || `${employee.firstName} ${employee.lastName}`;
                      return name.toLowerCase().includes(input.toLowerCase());
                    }}
                  >
                    {role.employees.map(renderEmployeeOption)}
                  </Select>
                </Form.Item>
              </Col>
            ))}
          </Row>
        </div>

        {/* Selected Summary */}
        {selectedEquipment.length > 0 && (
          <Card title="סיכום ציוד נבחר" size="small" className="mt-4">
            <Space wrap>
              {selectedEquipment.map(item => {
                const eq = equipment.find(e => e.id === item.id);
                return eq ? (
                  <Tag key={item.id} color="orange">
                    {eq.name} x{item.quantity}
                  </Tag>
                ) : null;
              })}
            </Space>
          </Card>
        )}

        <Divider>משימות נוספות לפי הגדרת מחלקות</Divider>
        <DynamicDepartmentJobsPanel
          formKey="externalBroadcasts"
          value={dynamicJobs}
          onChange={canEdit ? setDynamicJobs : () => {}}
          title="משימות שיוך"
        />
      </Form>
    </Modal>
  );
};

export default ExternalBroadcastsModal; 