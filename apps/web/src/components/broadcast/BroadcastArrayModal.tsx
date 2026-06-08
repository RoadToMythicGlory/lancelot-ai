import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, Row, Col, Button, Space, Divider, Alert, Spin, App } from 'antd';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import { GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS, GET_BROADCAST_EVENT } from '../../graphql/queries';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import DynamicDepartmentJobsPanel, { AssignmentJob } from '../assignments/DynamicDepartmentJobsPanel';
import { ensureAvailabilityOk } from '../shifts/availabilityWarning';

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
  /** When false, hides save / not-applicable buttons and disables form fields. */
  canEdit?: boolean;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone?: string;
  mobile?: string;
  isActive?: boolean;
  department: string;
  systemRole?: string;
  departments?: Array<{
    departmentId: string;
    departmentName: string;
    roles: string[];
  }>;
  createdAt?: string;
  updatedAt?: string;
}

const BroadcastArrayModal: React.FC<BroadcastArrayModalProps> = ({ visible, event, onClose, onSave, onDataSaved, canEdit = true }) => {
  const { message, modal } = App.useApp();
  const apolloClient = useApolloClient();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [dynamicJobs, setDynamicJobs] = useState<AssignmentJob[]>([]);

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

  /**
   * IMPORTANT: `users(filter: { departmentId })` expects a department "code" (string),
   * not a Mongo ObjectId. Our `departments` resolver exposes `Department.id` as the code
   * for compatibility, but we also keep fallback matching to support mixed environments.
   */
  const getDepartmentIdByCodes = useMemo(() => {
    return (codes: string[]): string | null => {
      const list = departmentsData?.departments || [];
      for (const code of codes) {
        const department = list.find((dept: any) => dept?.code === code);
        if (department?.id) return String(department.id);
      }
      return null;
    };
  }, [departmentsData]);

  // Try multiple known codes across environments (prod vs seeded dev DB)
  const editorsDeptId = getDepartmentIdByCodes(['CONTENT_EDIT', 'Visuals-VideoEditors', 'NewMedia-Editors', 'News-Editors']);
  const producersDeptId = getDepartmentIdByCodes(['PROD', 'NewMedia-Producers', 'News-Producers']);
  const vtrDeptId = getDepartmentIdByCodes(['VTR', 'Production-VTR']);
  const directorsDeptId = getDepartmentIdByCodes(['DIR', 'Production-Directors']);
  const commentatorsDeptId = getDepartmentIdByCodes(['COMMENT', 'Production-Commentators']);
  const soundmenDeptId = getDepartmentIdByCodes(['SOUND', 'Production-Soundmen']);

  // Queries for different department employees
  const { data: editorsData, loading: editorsLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: editorsDeptId,
        isActive: true
      }
    },
    skip: !visible || !editorsDeptId
  });

  const { data: producersData, loading: producersLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: producersDeptId,
        isActive: true
      }
    },
    skip: !visible || !producersDeptId
  });

  const { data: vtrData, loading: vtrLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: vtrDeptId,
        isActive: true
      }
    },
    skip: !visible || !vtrDeptId
  });

  const { data: directorsData, loading: directorsLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: directorsDeptId,
        isActive: true
      }
    },
    skip: !visible || !directorsDeptId
  });

  const { data: commentatorsData, loading: commentatorsLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: commentatorsDeptId,
        isActive: true
      }
    },
    skip: !visible || !commentatorsDeptId
  });

  const { data: soundmenData, loading: soundmenLoading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { 
      filter: {
        departmentId: soundmenDeptId,
        isActive: true
      }
    },
    skip: !visible || !soundmenDeptId
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
      
      // Get existing broadcast array data from metadata (support legacy key)
      const broadcastArrayData =
        eventData.metadata?.departments?.broadcastArray ||
        eventData.metadata?.departments?.['broadcast-array'];
      
      console.log('🔍 BroadcastArrayModal - Broadcast array data:', broadcastArrayData);
      console.log('🔍 BroadcastArrayModal - Hebrew fields:', {
        שידור: broadcastArrayData?.שידור,
        מקוםשידור: broadcastArrayData?.מקוםשידור,
        specialInstructions: broadcastArrayData?.specialInstructions
      });
      
      // Extract crew assignments. Each role can now have multiple users
      // assigned to it, so we collect *every* matching userId per role
      // instead of taking only the first one — this matches the way the
      // form's role selects render in `mode="multiple"`.
      const crewAssignments = broadcastArrayData?.crewAssignments || [];
      const getCrewMembersByRole = (role: string): string[] =>
        crewAssignments
          .filter((a: any) => a?.role === role && a?.userId)
          .map((a: any) => a.userId);

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
        עורך: getCrewMembersByRole('עורך'),
        מפיק: getCrewMembersByRole('מפיק'),
        אישVTR: getCrewMembersByRole('איש VTR'),
        טכנאישידור: getCrewMembersByRole('טכנאי שידור'),
        שדר: getCrewMembersByRole('שדר'),
        אנליסט: getCrewMembersByRole('אנליסט'),
        שדרקוים: getCrewMembersByRole('שדר קוים')
      });

      // Pre-fill dynamic jobs (the new admin-configurable list) from saved data.
      const savedJobs: any[] = broadcastArrayData?.dynamicJobs || [];
      if (Array.isArray(savedJobs) && savedJobs.length > 0) {
        setDynamicJobs(
          savedJobs.map((j: any, i: number) => ({
            uid: `loaded_${i}_${Date.now()}`,
            departmentCode: j.departmentCode,
            roleKey: j.roleKey,
            roleLabel: j.roleLabel,
            count: typeof j.count === 'number' ? j.count : 1,
            userId: j.userId,
            userName: j.userName,
          })),
        );
      } else {
        setDynamicJobs([]);
      }
    }
  }, [visible, event, form, existingData]);

  const handleSubmit = async (values: any) => {
    if (!canEdit) {
      message.error('אין לך הרשאת עריכה');
      return;
    }
    setLoading(true);
    try {
      console.log('📤 BroadcastArrayModal - Form values:', values);
      
      // Helper function to get employee name by ID
      const getEmployeeName = (employeeId: string, employeesList: Employee[] | undefined): string => {
        if (!employeesList || !employeeId) return '';
        const employee = employeesList.find(e => e.id === employeeId);
        if (!employee) return '';

        // Prefer Hebrew name if available
        return employee.displayName || `${employee.firstName} ${employee.lastName}`;
      };

      // Each role is now multi-select (`mode="multiple"`), so values come
      // through as arrays of userIds. We expand each array into one
      // `crewAssignments` entry per selected user — the server-side
      // `summarizeBroadcastArrayCrew` already groups by role and joins
      // names, so this stays compatible with the flight board read path.
      const buildAssignmentsForRole = (
        role: string,
        userIds: any,
        usersList: Employee[] | undefined,
      ): Array<{ role: string; userId: string; userName: string }> => {
        const ids: string[] = Array.isArray(userIds)
          ? userIds.filter((id) => typeof id === 'string' && id.length > 0)
          : userIds
            ? [userIds]
            : [];
        return ids.map((id) => ({
          role,
          userId: id,
          userName: getEmployeeName(id, usersList),
        }));
      };

      // Prepare the data in the format expected by the mutation
      // Only include schema-defined fields in broadcastArray
      const departmentData = {
        broadcastArray: {
          // Schema-defined fields ONLY
          crewAssignments: [
            ...buildAssignmentsForRole('עורך', values.עורך, editorsData?.users),
            ...buildAssignmentsForRole('מפיק', values.מפיק, producersData?.users),
            ...buildAssignmentsForRole('איש VTR', values.אישVTR, vtrData?.users),
            ...buildAssignmentsForRole('טכנאי שידור', values.טכנאישידור, directorsData?.users),
            ...buildAssignmentsForRole('שדר', values.שדר, commentatorsData?.users),
            // Analyst (אנליסט) draws from the same Commentators pool today;
            // when there's a dedicated department for it, swap the list.
            ...buildAssignmentsForRole('אנליסט', values.אנליסט, commentatorsData?.users),
            ...buildAssignmentsForRole('שדר קוים', values.שדרקוים, soundmenData?.users),
          ],
          specialInstructions: values.שידור || '',
          setupTime: null,
          breakdownTime: null,
          // New admin-configurable jobs list (saved alongside legacy fields).
          dynamicJobs: dynamicJobs.map((j) => ({
            departmentCode: j.departmentCode,
            roleKey: j.roleKey,
            roleLabel: j.roleLabel,
            count: j.count || 1,
            userId: j.userId,
            userName: j.userName,
          }))
        },
        // Custom fields go in customData
        customData: {
          מקוםשידור: values.מקוםשידור,
          שידור: values.שידור,
          notApplicable: false // Clear the not applicable flag when saving data
        }
      };

      console.log('📤 BroadcastArrayModal - Department data to save:', departmentData);

      // Preflight: warn the operator if any selected internal user has
      // marked themselves unavailable for the event's time window. We
      // pull ids from both the legacy role lists and the dynamic jobs
      // list. Custom/free-text people are ignored because they have no
      // matching user record.
      const internalUserIds: string[] = [
        ...departmentData.broadcastArray.crewAssignments
          .map((a) => a.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ...dynamicJobs
          .map((j) => j.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ];
      if (internalUserIds.length > 0) {
        const fullEvent =
          (existingData as any)?.broadcastEvent || (event as any) || {};
        const ok = await ensureAvailabilityOk(apolloClient, modal, {
          userIds: internalUserIds,
          startTime: fullEvent?.startTime || (event as any)?.startTime || null,
          endTime: fullEvent?.endTime || (event as any)?.endTime || null,
        });
        if (!ok) {
          setLoading(false);
          return;
        }
      }

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
    const displayName = employee.displayName || `${employee.firstName} ${employee.lastName}`;
    
    return (
      <Option key={employee.id} value={employee.id}>
        {displayName}
        {employee.systemRole && <span className="text-gray-500 text-sm"> - {employee.systemRole}</span>}
      </Option>
    );
  };

  return (
    <Modal
      title={
        <span>
          מערך שידורים
          {!canEdit && (
            <span style={{
              marginInlineStart: 8,
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
        </span>
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
      ] : [
        <Button key="close" onClick={onClose}>
          סגור
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
        disabled={!canEdit}
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
                <Option value="קונטרול 8">קונטרול 8</Option>
                <Option value="יוניפייד 1">יוניפייד 1</Option>
                <Option value="יוניפייד 2">יוניפייד 2</Option>
                <Option value="יוניפייד 3">יוניפייד 3</Option>
                <Option value="יוניפייד 4">יוניפייד 4</Option>
                <Option value="יוניפייד 5">יוניפייד 5</Option>
                <Option value="יוניפייד 6">יוניפייד 6</Option>
                <Option value="רדיו">רדיו</Option>
                <Option value="יעלה לווין בלבד">יעלה לווין בלבד</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="עורך" label="עורך">
              <Select
                mode="multiple"
                placeholder="בחר עורכים"
                showSearch
                optionFilterProp="children"
                loading={editorsLoading}
                notFoundContent={editorsLoading ? <Spin size="small" /> : 'אין עורכים זמינים'}
                allowClear
              >
                {editorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="מפיק" label="מפיק">
              <Select
                mode="multiple"
                placeholder="בחר מפיקים"
                showSearch
                optionFilterProp="children"
                loading={producersLoading}
                notFoundContent={producersLoading ? <Spin size="small" /> : 'אין מפיקים זמינים'}
                allowClear
              >
                {producersData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="אישVTR" label="אנשי VTR (ריפליי)">
              <Select
                mode="multiple"
                placeholder="בחר אנשי VTR"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={vtrLoading}
                notFoundContent={vtrLoading ? <Spin size="small" /> : 'אין אנשי VTR זמינים'}
                allowClear
              >
                {vtrData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="טכנאישידור" label="טכנאי שידור / במאי">
              <Select
                mode="multiple"
                placeholder="בחר טכנאי/במאי"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={directorsLoading}
                notFoundContent={directorsLoading ? <Spin size="small" /> : 'אין במאים זמינים'}
                allowClear
              >
                {directorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="שדר" label="שדרים (פרשנים)">
              <Select
                mode="multiple"
                placeholder="בחר שדרים/פרשנים"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={commentatorsLoading}
                notFoundContent={commentatorsLoading ? <Spin size="small" /> : 'אין פרשנים זמינים'}
                allowClear
              >
                {commentatorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="אנליסט" label="אנליסטים">
              <Select
                mode="multiple"
                placeholder="בחר אנליסטים"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={commentatorsLoading}
                notFoundContent={commentatorsLoading ? <Spin size="small" /> : 'אין אנליסטים זמינים'}
                allowClear
              >
                {commentatorsData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="שדרקוים" label="שדרי קווים">
              <Select
                mode="multiple"
                placeholder="בחר שדרי קווים"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                loading={soundmenLoading}
                notFoundContent={soundmenLoading ? <Spin size="small" /> : 'אין סאונדמנים זמינים'}
                allowClear
              >
                {soundmenData?.users?.map((employee: Employee) => renderEmployeeOption(employee))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Divider>משימות נוספות לפי הגדרות מחלקות</Divider>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="כאן ניתן להוסיף משימות נוספות לפי המחלקות שמנהל המערכת הגדיר לטופס מערך השידורים. ניתן גם לשמור פריסטים משותפים לאירועים חוזרים."
        />
        <DynamicDepartmentJobsPanel
          formKey="broadcastArray"
          value={dynamicJobs}
          onChange={canEdit ? setDynamicJobs : () => {}}
          title="משימות מערך שידורים"
        />
      </Form>
    </Modal>
  );
};

export default BroadcastArrayModal; 