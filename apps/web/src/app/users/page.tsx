'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import {
  Table, Button, Modal, Form, Input, Select, message, Tag, Space, Card,
  Row, Col, Divider, Switch, Spin, Tabs,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined,
} from '@ant-design/icons';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import RoleTemplatesPanel from '@/components/users/RoleTemplatesPanel';
import UserRoleAssigner from '@/components/users/UserRoleAssigner';

const { Option } = Select;

// ---- GraphQL ----

const GET_USERS = gql`
  query GetUsers($filter: UserFilter) {
    users(filter: $filter) {
      id
      email
      firstName
      lastName
      displayName
      systemRole
      departments {
        departmentId
        departmentName
        roles
      }
      phone
      mobile
      isActive
      lastLogin
      createdAt
      roleTemplateId
      roleTemplateName
    }
  }
`;

const GET_ME = gql`
  query GetMe {
    me {
      id
      systemRole
      departments {
        departmentId
      }
    }
  }
`;

const CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      email
      displayName
    }
  }
`;

const UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      id
      email
      displayName
    }
  }
`;

const DELETE_USER = gql`
  mutation DeleteUser($id: ID!) {
    deleteUser(id: $id)
  }
`;

// ---- Department config ----

const DEPARTMENTS = {
  IT: ['IT', 'IT-MEDIA'],
  MCR: ['MCR-Playout', 'MCR-Ingest', 'MCR-General'],
  Warehouse: ['Warehouse'],
  Visuals: ['Visuals-VideoEditors'],
  'New Media': ['NewMedia-Producers', 'NewMedia-Editors', 'NewMedia-Analysts'],
  News: ['News-Producers', 'News-Desk', 'News-Editors', 'News-ProductionAssistants', 'News-Researchers'],
  Production: ['Production-VTR', 'Production-Directors', 'Production-CG', 'Production-Commentators', 'Production-Soundmen', 'Production-Technicians', 'Production-ExternalTechnicians'],
};

const DEPARTMENT_ROLES: Record<string, string[]> = {
  'IT': ['System Administrator', 'Developer', 'Support'],
  'IT-MEDIA': ['Media Systems Engineer', 'Broadcast IT Specialist'],
  'MCR-Playout': ['Playout Operator', 'Senior Playout Operator'],
  'MCR-Ingest': ['Ingest Operator', 'Senior Ingest Operator'],
  'MCR-General': ['MCR Operator', 'MCR Supervisor'],
  'Warehouse': ['Warehouse Manager', 'Equipment Handler'],
  'Visuals-VideoEditors': ['Video Editor', 'Senior Video Editor'],
  'NewMedia-Producers': ['Producer', 'Senior Producer'],
  'NewMedia-Editors': ['Editor', 'Senior Editor'],
  'NewMedia-Analysts': ['Analyst', 'Senior Analyst'],
  'News-Producers': ['News Producer', 'Senior News Producer'],
  'News-Desk': ['Desk Editor', 'Senior Desk Editor'],
  'News-Editors': ['News Editor', 'Senior News Editor'],
  'News-ProductionAssistants': ['Production Assistant', 'Senior Production Assistant'],
  'News-Researchers': ['Researcher', 'Senior Researcher'],
  'Production-VTR': ['VTR Operator', 'Senior VTR Operator'],
  'Production-Directors': ['Director', 'Senior Director'],
  'Production-CG': ['CG Operator', 'Senior CG Operator'],
  'Production-Commentators': ['Commentator', 'Senior Commentator'],
  'Production-Soundmen': ['Sound Engineer', 'Senior Sound Engineer'],
  'Production-Technicians': ['Technician', 'Senior Technician'],
  'Production-ExternalTechnicians': ['External Technician'],
};

// ---- Types ----

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  systemRole: string;
  departments: {
    departmentId: string;
    departmentName: string;
    roles: string[];
  }[];
  phone?: string;
  mobile?: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  roleTemplateId?: string;
  roleTemplateName?: string;
}

// ---- Helpers ----

const getSystemRoleColor = (role: string) => {
  const colors: Record<string, string> = {
    SYSTEM_ADMIN: 'red',
    IT_ADMIN: 'orange',
    IT_USER: 'blue',
    DEPARTMENT_ADMIN: 'green',
    DEPARTMENT_USER: 'default',
  };
  return colors[role] || 'default';
};

const getSystemRoleDisplay = (role: string) => {
  const display: Record<string, string> = {
    SYSTEM_ADMIN: 'מנהל מערכת',
    IT_ADMIN: 'מנהל IT',
    IT_USER: 'משתמש IT',
    DEPARTMENT_ADMIN: 'מנהל מחלקה',
    DEPARTMENT_USER: 'משתמש מחלקה',
  };
  return display[role] || role;
};

// ---- Page ----

export default function UsersPage() {
  const { user: currentUser, loading: authLoading, hasPermission } = useAuth();
  const router = useRouter();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [departmentRoles, setDepartmentRoles] = useState<Record<string, string[]>>({});
  const [roleTemplateId, setRoleTemplateId] = useState<string | null>(null);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      message.warning('נדרשת התחברות למערכת');
      router.push('/login');
    }
  }, [authLoading, currentUser, router]);

  const { loading, data, refetch, error } = useQuery(GET_USERS, {
    skip: !currentUser,
    onError: (error) => {
      if (error.message.includes('Not authenticated')) {
        message.error('נדרשת התחברות למערכת');
        router.push('/login');
      }
    },
  });

  const { data: meData } = useQuery(GET_ME, { skip: !currentUser });
  const [createUser] = useMutation(CREATE_USER);
  const [updateUser] = useMutation(UPDATE_USER);
  const [deleteUser] = useMutation(DELETE_USER);

  const mySystemRole = meData?.me?.systemRole;
  const canCreateUsers = ['SYSTEM_ADMIN', 'IT_ADMIN', 'DEPARTMENT_ADMIN'].includes(mySystemRole);
  const canManageTemplates = hasPermission(Permission.ROLE_TEMPLATES_MANAGE);

  const handleCreateOrUpdate = async (values: any) => {
    try {
      const departments = selectedDepartments.map((deptId) => {
        let departmentName = deptId;
        if (deptId.startsWith('MCR-')) {
          departmentName = deptId.split('-').slice(1).join(' ');
        } else {
          const category = Object.keys(DEPARTMENTS).find((cat) =>
            DEPARTMENTS[cat as keyof typeof DEPARTMENTS].includes(deptId),
          );
          if (category && deptId.includes('-')) {
            departmentName = deptId.split('-').slice(1).join(' ');
          }
        }
        return {
          departmentId: deptId,
          departmentName,
          roles: departmentRoles[deptId] || [],
        };
      });

      const inputData: any = {
        ...values,
        departments,
      };

      if (roleTemplateId) {
        inputData.roleTemplateId = roleTemplateId;
      }
      if (customPermissions.length > 0) {
        inputData.customPermissions = customPermissions;
      }

      if (editingUser) {
        await updateUser({
          variables: { id: editingUser.id, input: inputData },
        });
        message.success('משתמש עודכן בהצלחה');
      } else {
        inputData.isActive = true;
        await createUser({ variables: { input: inputData } });
        message.success('משתמש נוצר בהצלחה');
      }

      setIsModalVisible(false);
      form.resetFields();
      setSelectedDepartments([]);
      setDepartmentRoles({});
      setRoleTemplateId(null);
      setCustomPermissions([]);
      refetch();
    } catch (error: any) {
      message.error(error.message || 'שגיאה בשמירת המשתמש');
    }
  };

  const handleDelete = async (userId: string) => {
    Modal.confirm({
      title: 'האם אתה בטוח?',
      content: 'פעולה זו תבטל את המשתמש',
      okText: 'כן',
      cancelText: 'לא',
      onOk: async () => {
        try {
          await deleteUser({ variables: { id: userId } });
          message.success('משתמש בוטל בהצלחה');
          refetch();
        } catch (error: any) {
          message.error(error.message || 'שגיאה בביטול המשתמש');
        }
      },
    });
  };

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      form.setFieldsValue({
        ...user,
        password: undefined,
      });
      setSelectedDepartments(user.departments.map((d) => d.departmentId));
      const roles: Record<string, string[]> = {};
      user.departments.forEach((d) => {
        roles[d.departmentId] = d.roles;
      });
      setDepartmentRoles(roles);
      setRoleTemplateId(user.roleTemplateId ?? null);
      setCustomPermissions([]);
    } else {
      setEditingUser(null);
      form.resetFields();
      setSelectedDepartments([]);
      setDepartmentRoles({});
      setRoleTemplateId(null);
      setCustomPermissions([]);
    }
    setIsModalVisible(true);
  };

  const columns = [
    {
      title: 'שם מלא',
      key: 'displayName',
      render: (user: User) => (
        <Space>
          <UserOutlined />
          {user.displayName}
        </Space>
      ),
    },
    {
      title: 'אימייל',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'תפקיד במערכת',
      key: 'systemRole',
      render: (user: User) => (
        <Tag color={getSystemRoleColor(user.systemRole)}>
          {getSystemRoleDisplay(user.systemRole)}
        </Tag>
      ),
    },
    {
      title: 'תפקיד',
      key: 'roleTemplate',
      render: (user: User) => {
        if (user.roleTemplateName) {
          return <Tag color="purple">{user.roleTemplateName}</Tag>;
        }
        return <Tag>מותאם אישית</Tag>;
      },
    },
    {
      title: 'מחלקות',
      key: 'departments',
      render: (user: User) => (
        <Space direction="vertical" size="small">
          {user.departments.map((dept) => (
            <div key={dept.departmentId}>
              <Tag>{dept.departmentName}</Tag>
              {dept.roles.map((role) => (
                <Tag key={role} color="blue" style={{ marginLeft: 4 }}>
                  {role}
                </Tag>
              ))}
            </div>
          ))}
        </Space>
      ),
    },
    {
      title: 'סטטוס',
      key: 'isActive',
      render: (user: User) => (
        <Tag color={user.isActive ? 'green' : 'red'}>
          {user.isActive ? 'פעיל' : 'לא פעיל'}
        </Tag>
      ),
    },
    {
      title: 'התחברות אחרונה',
      key: 'lastLogin',
      render: (user: User) =>
        user.lastLogin
          ? new Date(user.lastLogin).toLocaleString('he-IL')
          : 'טרם התחבר',
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (user: User) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openModal(user)} />
          {(mySystemRole === 'SYSTEM_ADMIN' || mySystemRole === 'IT_ADMIN') && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(user.id)}
            />
          )}
        </Space>
      ),
    },
  ];

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="בודק הרשאות..." fullscreen />
      </div>
    );
  }

  if (!currentUser) return null;

  const usersTable = (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <h2 style={{ margin: 0 }}>משתמשים</h2>
        </Col>
        <Col>
          {canCreateUsers && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              צור משתמש חדש
            </Button>
          )}
        </Col>
      </Row>

      <Table
        loading={loading}
        dataSource={data?.users || []}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
    </Card>
  );

  const pageTabItems = [
    {
      key: 'users',
      label: 'משתמשים',
      children: usersTable,
    },
  ];

  if (canManageTemplates) {
    pageTabItems.push({
      key: 'templates',
      label: 'תפקידים',
      children: <RoleTemplatesPanel />,
    });
  }

  return (
    <ProtectedRoute requires={Permission.USERS_VIEW}>
      <div style={{ padding: 24 }}>
        <h1 style={{ marginBottom: 16 }}>ניהול משתמשים</h1>
        <Tabs items={pageTabItems} />

        {/* Create / Edit User Modal */}
        <Modal
          title={editingUser ? 'ערוך משתמש' : 'צור משתמש חדש'}
          open={isModalVisible}
          onCancel={() => {
            setIsModalVisible(false);
            form.resetFields();
          }}
          footer={null}
          width={700}
          forceRender
        >
          <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="firstName"
                  label="שם פרטי"
                  rules={[{ required: true, message: 'נא להזין שם פרטי' }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="lastName"
                  label="שם משפחה"
                  rules={[{ required: true, message: 'נא להזין שם משפחה' }]}
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="email"
              label="אימייל"
              rules={[
                { required: true, message: 'נא להזין אימייל' },
                { type: 'email', message: 'אימייל לא תקין' },
              ]}
            >
              <Input disabled={!!editingUser} />
            </Form.Item>

            {!editingUser && (
              <Form.Item
                name="password"
                label="סיסמה"
                rules={[{ required: true, message: 'נא להזין סיסמה' }]}
              >
                <Input.Password />
              </Form.Item>
            )}

            <Form.Item
              name="systemRole"
              label="תפקיד במערכת"
              rules={[{ required: true, message: 'נא לבחור תפקיד' }]}
            >
              <Select>
                {mySystemRole === 'SYSTEM_ADMIN' && (
                  <>
                    <Option value="SYSTEM_ADMIN">מנהל מערכת</Option>
                    <Option value="IT_ADMIN">מנהל IT</Option>
                  </>
                )}
                {['SYSTEM_ADMIN', 'IT_ADMIN'].includes(mySystemRole || '') && (
                  <Option value="IT_USER">משתמש IT</Option>
                )}
                {['SYSTEM_ADMIN', 'IT_ADMIN', 'DEPARTMENT_ADMIN'].includes(mySystemRole || '') && (
                  <Option value="DEPARTMENT_ADMIN">מנהל מחלקה</Option>
                )}
                <Option value="DEPARTMENT_USER">משתמש מחלקה</Option>
              </Select>
            </Form.Item>

            <Divider>מחלקות ותפקידים</Divider>

            <Form.Item label="בחר מחלקות">
              <Select
                mode="multiple"
                value={selectedDepartments}
                onChange={setSelectedDepartments}
                placeholder="בחר מחלקות"
              >
                {Object.entries(DEPARTMENTS).map(([category, depts]) => (
                  <Select.OptGroup key={category} label={category}>
                    {depts.map((dept) => (
                      <Option key={dept} value={dept}>
                        {dept}
                      </Option>
                    ))}
                  </Select.OptGroup>
                ))}
              </Select>
            </Form.Item>

            {selectedDepartments.map((dept) => (
              <Form.Item key={dept} label={`תפקידים ב-${dept}`}>
                <Select
                  mode="multiple"
                  value={departmentRoles[dept] || []}
                  onChange={(roles) =>
                    setDepartmentRoles({ ...departmentRoles, [dept]: roles })
                  }
                  placeholder="בחר תפקידים"
                >
                  {(DEPARTMENT_ROLES[dept] || []).map((role) => (
                    <Option key={role} value={role}>
                      {role}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            ))}

            <Divider>תבנית תפקיד והרשאות</Divider>

            <UserRoleAssigner
              actorSystemRole={mySystemRole || 'DEPARTMENT_USER'}
              roleTemplateId={roleTemplateId}
              customPermissions={customPermissions}
              onRoleTemplateChange={setRoleTemplateId}
              onCustomPermissionsChange={setCustomPermissions}
            />

            <Divider />

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="phone" label="טלפון">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="mobile" label="נייד">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            {editingUser && (
              <Form.Item name="isActive" label="פעיל" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  {editingUser ? 'עדכן' : 'צור'}
                </Button>
                <Button
                  onClick={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                  }}
                >
                  ביטול
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </ProtectedRoute>
  );
}
