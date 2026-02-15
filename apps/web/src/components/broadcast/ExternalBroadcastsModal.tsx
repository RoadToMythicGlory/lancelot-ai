import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Button, Space, Card, Row, Col, Tag, Table, Divider, InputNumber } from 'antd';
import { 
  ToolOutlined, 
  TeamOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  UserOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT, GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS, GET_BROADCAST_EVENT } from '../../graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';

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
}

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand: string;
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

const ExternalBroadcastsModal: React.FC<ExternalBroadcastsModalProps> = ({ visible, event, onClose, onDataSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Array<{ id: string; quantity: number }>>([]);
  const [departmentIds, setDepartmentIds] = useState<Record<string, string>>({});

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

  // Query for equipment
  const { data: equipmentData } = useQuery(GET_WAREHOUSE_EQUIPMENT);
  const equipment: Equipment[] = equipmentData?.warehouseEquipment || [];

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
          notApplicable: false // Clear the not applicable flag when saving data
        }
      };

      // console.log('📤 External Broadcasts - Saving data:', departmentData);

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
      filters: [
        { text: 'מצלמות', value: 'camera' },
        { text: 'אודיו', value: 'audio' },
        { text: 'תאורה', value: 'lighting' },
        { text: 'אחר', value: 'other' }
      ],
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
            disabled={record.quantityAvailable === 0}
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
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={[
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
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
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
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ToolOutlined />
            ציוד נדרש
          </h3>
          <Table
            columns={equipmentColumns}
            dataSource={equipment}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10 }}
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
      </Form>
    </Modal>
  );
};

export default ExternalBroadcastsModal; 