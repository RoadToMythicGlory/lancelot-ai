import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Row, Col, Button, Space, Divider, Alert, Spin, App } from 'antd';
import { useMutation, useQuery } from '@apollo/client';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import { GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS, GET_BROADCAST_EVENT } from '../../graphql/queries';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

const { Option } = Select;

interface BroadcastEvent {
  id: string;
  title: string;
  תאריך?: string;
  שעה?: string;
  metadata?: any;
  [key: string]: any;
}

interface BroadcastArrayModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onSave?: (data: any) => Promise<void>;
  onDataSaved?: () => void; // Add callback for when data is saved
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  hebrewFirstName: string;
  hebrewLastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: {
    id: string;
    name: string;
    hebrewName: string;
    code: string;
  };
}

const BroadcastArrayModal: React.FC<BroadcastArrayModalProps> = ({ visible, event, onClose, onSave, onDataSaved }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    onCompleted: () => {
      message.success('נתוני מערך השידורים נשמרו בהצלחה');
    },
    onError: (error) => {
      message.error(`שגיאה בשמירת הנתונים: ${error.message}`);
    }
  });

  // Query for existing broadcast array data
  const { data: existingData, refetch } = useQuery(GET_BROADCAST_EVENT, {
    variables: { id: event?.id },
    skip: !event?.id || !visible
  });

  // Query for all departments to map codes to IDs
  const { data: departmentsData } = useQuery(GET_DEPARTMENTS, {
    skip: !visible
  });

  // Create department code to ID mapping
  const getDepartmentIdByCode = (code: string): string | null => {
    if (!departmentsData?.departments) return null;
    const department = departmentsData.departments.find((dept: any) => dept.code === code);
    return department?.id || null;
  };

  // Queries for different department employees
  const { data: editorsData, loading: editorsLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      departmentId: getDepartmentIdByCode('CONTENT_EDIT'),
      isActive: true 
    },
    skip: !visible || !departmentsData
  });

  const { data: producersData, loading: producersLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      departmentId: getDepartmentIdByCode('PROD'),
      isActive: true 
    },
    skip: !visible || !departmentsData
  });

  const { data: vtrData, loading: vtrLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      departmentId: getDepartmentIdByCode('VTR'),
      isActive: true 
    },
    skip: !visible || !departmentsData
  });

  const { data: directorsData, loading: directorsLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      departmentId: getDepartmentIdByCode('DIR'),
      isActive: true 
    },
    skip: !visible || !departmentsData
  });

  const { data: commentatorsData, loading: commentatorsLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      departmentId: getDepartmentIdByCode('COMMENT'),
      isActive: true 
    },
    skip: !visible || !departmentsData
  });

  const { data: soundmenData, loading: soundmenLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      departmentId: getDepartmentIdByCode('SOUND'),
      isActive: true 
    },
    skip: !visible || !departmentsData
  });

  const isLoadingEmployees = editorsLoading || producersLoading || vtrLoading || 
                            directorsLoading || commentatorsLoading || soundmenLoading;

  // Pre-fill form with existing data when modal opens
  useEffect(() => {
    if (visible && event) {
      console.log('🔍 BroadcastArrayModal - Event prop:', event);
      console.log('🔍 BroadcastArrayModal - Event ID:', event?.id);
      
      // Get the fresh event data from the query
      const eventData = existingData?.broadcastEvent || event;
      
      console.log('🔍 BroadcastArrayModal - Event data:', eventData);
      console.log('🔍 BroadcastArrayModal - Metadata:', eventData.metadata);
      
      // Get existing broadcast array data from metadata
      const broadcastArrayData = eventData.metadata?.departments?.broadcastArray;
      
      console.log('🔍 BroadcastArrayModal - Broadcast array data:', broadcastArrayData);
      console.log('🔍 BroadcastArrayModal - Hebrew fields:', {
        שידור: broadcastArrayData?.שידור,
        מקוםשידור: broadcastArrayData?.מקוםשידור,
        specialInstructions: broadcastArrayData?.specialInstructions
      });
      
      // Extract crew assignments
      const crewAssignments = broadcastArrayData?.crewAssignments || [];
      const getCrewMemberByRole = (role: string) => {
        const assignment = crewAssignments.find((a: any) => a.role === role);
        return assignment?.userId || '';
      };
      
      form.setFieldsValue({
        // Read-only fields from Broadcast Planning
        תאריך: eventData.תאריך || eventData.metadata?.rawHebrewData?.תאריך || eventData.metadata?.eventDetails?.date || (eventData.startTime ? dayjs(eventData.startTime).format('DD/MM/YYYY') : ''),
        יום: eventData.יום || eventData.metadata?.rawHebrewData?.יום || eventData.metadata?.eventDetails?.day || (eventData.startTime ? dayjs(eventData.startTime).locale('he').format('dddd') : ''),
        שעתשידור: eventData.שעה || eventData.metadata?.rawHebrewData?.שעה || eventData.startTime?.substring(11, 16) || eventData.metadata?.eventDetails?.time,
        משחק: eventData.title || eventData.hebrewTitle,
        ערוץ: eventData.ערוץ || eventData.metadata?.rawHebrewData?.ערוץ || eventData.channel || eventData.metadata?.eventDetails?.channel,
        הערות: eventData.הערות || eventData.metadata?.rawHebrewData?.הערות || eventData.notes || eventData.metadata?.eventDetails?.notes,
        
        // Editable fields from saved department data
        שידור: broadcastArrayData?.specialInstructions || broadcastArrayData?.שידור || '',
        מקוםשידור: broadcastArrayData?.מקוםשידור || '',
        עורך: getCrewMemberByRole('עורך'),
        מפיק: getCrewMemberByRole('מפיק'),
        אישVTR: getCrewMemberByRole('איש VTR'),
        טכנאישידור: getCrewMemberByRole('טכנאי שידור'),
        שדר: getCrewMemberByRole('שדר'),
        שדרקוים: getCrewMemberByRole('שדר קוים')
      });
    }
  }, [visible, event, form, existingData]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      console.log('📤 BroadcastArrayModal - Form values:', values);
      
      // Helper function to get employee name by ID
      const getEmployeeName = (employeeId: string, employeesList: Employee[] | undefined): string => {
        if (!employeesList || !employeeId) return '';
        const employee = employeesList.find(e => e.id === employeeId);
        if (!employee) return '';
        
        // Prefer Hebrew name if available
        if (employee.hebrewFirstName && employee.hebrewLastName) {
          return `${employee.hebrewFirstName} ${employee.hebrewLastName}`;
        }
        return employee.fullName || `${employee.firstName} ${employee.lastName}`;
      };
      
      // Prepare the data in the format expected by the mutation
      // Only include schema-defined fields in broadcastArray
      const departmentData = {
        broadcastArray: {
          // Schema-defined fields ONLY
          crewAssignments: [
            values.עורך && { 
              role: 'עורך', 
              userId: values.עורך,
              userName: getEmployeeName(values.עורך, editorsData?.users)
            },
            values.מפיק && { 
              role: 'מפיק', 
              userId: values.מפיק,
              userName: getEmployeeName(values.מפיק, producersData?.users)
            },
            values.אישVTR && { 
              role: 'איש VTR', 
              userId: values.אישVTR,
              userName: getEmployeeName(values.אישVTR, vtrData?.users)
            },
            values.טכנאישידור && { 
              role: 'טכנאי שידור', 
              userId: values.טכנאישידור,
              userName: getEmployeeName(values.טכנאישידור, directorsData?.users)
            },
            values.שדר && { 
              role: 'שדר', 
              userId: values.שדר,
              userName: getEmployeeName(values.שדר, commentatorsData?.users)
            },
            values.שדרקוים && { 
              role: 'שדר קוים', 
              userId: values.שדרקוים,
              userName: getEmployeeName(values.שדרקוים, soundmenData?.users)
            }
          ].filter(Boolean), // Remove null values
          specialInstructions: values.שידור || '',
          setupTime: null,
          breakdownTime: null
        },
        // Custom fields go in customData
        customData: {
          מקוםשידור: values.מקוםשידור,
          שידור: values.שידור,
          notApplicable: false // Clear the not applicable flag when saving data
        }
      };

      console.log('📤 BroadcastArrayModal - Department data to save:', departmentData);

      // Call the mutation to save to MongoDB
      const result = await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'broadcastArray',
          data: departmentData
        },
        refetchQueries: [
          {
            query: GET_BROADCAST_EVENT,
            variables: { id: event.id }
          }
        ]
      });

      console.log('✅ Mutation completed successfully:', result);

      // Call the onSave prop if provided
      if (onSave) {
        await onSave({
          eventId: event.id,
          ...values
        });
      }

      // Notify parent that data was saved
      console.log('🔄 Calling onDataSaved callback');
      if (onDataSaved) {
        onDataSaved();
      }

      onClose();
    } catch (error) {
      console.error('Error saving broadcast array data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderEmployeeOption = (employee: Employee) => {
    const displayName = employee.hebrewFirstName && employee.hebrewLastName
      ? `${employee.hebrewFirstName} ${employee.hebrewLastName}`
      : employee.fullName || `${employee.firstName} ${employee.lastName}`;
    
    return (
      <Option key={employee.id} value={employee.id}>
        {displayName}
        {employee.jobTitle && <span className="text-gray-500 text-sm"> - {employee.jobTitle}</span>}
      </Option>
    );
  };

  return (
    <Modal
      title="מערך שידורים"
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
                  department: 'broadcastArray',
                  data: departmentData
                }
              });
              
              if (onDataSaved) {
                onDataSaved();
              }
              onClose();
            } catch (error) {
              console.error('Error marking as not applicable:', error);
            } finally {
              setLoading(false);
            }
          }}
        >
          לא עבורנו
        </Button>,
        <Button 
          key="submit" 
          type="primary" 
          loading={loading}
          onClick={() => form.submit()}
        >
          שמור
        </Button>
      ]}
    >
      <Alert
        message="שדות מתכנונית השידורים"
        description="השדות הבאים מגיעים מתכנונית השידורים ולא ניתן לערוך אותם כאן."
        type="info"
        showIcon
        className="mb-4"
      />
      
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        {/* Read-only fields from Broadcast Planning */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="תאריך" label="תאריך">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="יום" label="יום">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="שעתשידור" label="שעת שידור">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="משחק" label="משחק">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="ערוץ" label="ערוץ">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="הערות" label="הערות">
              <Input.TextArea rows={1} disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
        </Row>

        <Divider>שדות ניהול מערך</Divider>

        {isLoadingEmployees && (
          <div className="text-center py-4">
            <Spin />
            <div className="mt-2 text-gray-500">טוען רשימת עובדים...</div>
          </div>
        )}

        {/* Editable fields for Broadcast Array */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="שידור" label="שם השידור">
              <Input placeholder="שם השידור" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="מקוםשידור" label="מקום שידור">
              <Select placeholder="בחר מקום שידור">
                <Option value="קונטרול 1">קונטרול 1</Option>
                <Option value="קונטרול 2">קונטרול 2</Option>
                <Option value="קונטרול 3">קונטרול 3</Option>
                <Option value="קונטרול 4">קונטרול 4</Option>
                <Option value="קונטרול 5">קונטרול 5</Option>
                <Option value="קונטרול 6">קונטרול 6</Option>
                <Option value="קונטרול 7">קונטרול 7</Option>
                <Option value="יוניפייד 1">יוניפייד 1</Option>
                <Option value="יוניפייד 2">יוניפייד 2</Option>
                <Option value="יוניפייד 3">יוניפייד 3</Option>
                <Option value="יוניפייד 4">יוניפייד 4</Option>
                <Option value="יוניפייד 5">יוניפייד 5</Option>
                <Option value="יוניפייד 6">יוניפייד 6</Option>
                <Option value="יעלה לווין בלבד">יעלה לווין בלבד</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="עורך" label="עורך">
              <Select 
                placeholder="בחר עורך"
                showSearch
                optionFilterProp="children"
                loading={editorsLoading}
                notFoundContent={editorsLoading ? <Spin size="small" /> : 'אין עורכים זמינים'}
              >
                {editorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="מפיק" label="מפיק">
              <Select 
                placeholder="בחר מפיק"
                showSearch
                optionFilterProp="children"
                loading={producersLoading}
                notFoundContent={producersLoading ? <Spin size="small" /> : 'אין מפיקים זמינים'}
              >
                {producersData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="אישVTR" label="איש VTR (ריפליי)">
              <Select 
                placeholder="בחר איש VTR"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={vtrLoading}
                notFoundContent={vtrLoading ? <Spin size="small" /> : 'אין אנשי VTR זמינים'}
              >
                {vtrData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="טכנאישידור" label="טכנאי שידור / במאי">
              <Select 
                placeholder="בחר טכנאי/במאי"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={directorsLoading}
                notFoundContent={directorsLoading ? <Spin size="small" /> : 'אין במאים זמינים'}
              >
                {directorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="שדר" label="שדר + פרשן">
              <Select 
                placeholder="בחר שדר/פרשן"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={commentatorsLoading}
                notFoundContent={commentatorsLoading ? <Spin size="small" /> : 'אין פרשנים זמינים'}
              >
                {commentatorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="שדרקוים" label="שדר קוים">
              <Select 
                placeholder="בחר שדר קוים"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={soundmenLoading}
                notFoundContent={soundmenLoading ? <Spin size="small" /> : 'אין סאונדמנים זמינים'}
              >
                {soundmenData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default BroadcastArrayModal; 