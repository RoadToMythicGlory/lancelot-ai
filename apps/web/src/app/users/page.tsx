'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space, Card,
  Row, Col, Divider, Switch, Spin, Tabs, App as AntApp,
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
import { GET_DEPARTMENTS } from '@/graphql/queries';

const { Option } = Select;

interface DepartmentRoleDef {
  key: string;
  name: string;
  hebrewName?: string | null;
  isActive: boolean;
  permissions?: string[];
}

interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  hebrewName?: string | null;
  category: string;
  isActive: boolean;
  roles: string[]; // legacy string list
  departmentRoles?: DepartmentRoleDef[];
  permissions?: string[];
}

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
//
// Departments and their roles are now driven entirely from the API
// (see services/api-gateway departmentManagement resolvers + Settings UI).
// The previous hardcoded DEPARTMENTS / DEPARTMENT_ROLES maps were removed in
// favour of GET_DEPARTMENTS so admins can add/remove departments at runtime.

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
  const { message, modal } = AntApp.useApp();
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

  // We need to know whether the user can manage users *before* firing the
  // queries, otherwise React still runs the hook and the server rejects with
  // "Missing permission: USERS_VIEW" — polluting the dev console even though
  // ProtectedRoute would block the page render.
  const canSeeUsersList =
    hasPermission(Permission.USERS_MANAGE_DEPT) ||
    hasPermission(Permission.USERS_MANAGE_ALL);

  const { loading, data, refetch, error } = useQuery(GET_USERS, {
    skip: !currentUser || !canSeeUsersList,
    onError: (error) => {
      if (error.message.includes('Not authenticated')) {
        message.error('נדרשת התחברות למערכת');
        router.push('/login');
      }
    },
  });

  const { data: meData } = useQuery(GET_ME, { skip: !currentUser });
  const { data: deptData } = useQuery(GET_DEPARTMENTS, {
    skip: !currentUser || !canSeeUsersList,
    fetchPolicy: 'cache-and-network',
  });
  const [createUser] = useMutation(CREATE_USER);
  const [updateUser] = useMutation(UPDATE_USER);
  const [deleteUser] = useMutation(DELETE_USER);

  const mySystemRole = meData?.me?.systemRole;
  const canManageUsers =
    hasPermission(Permission.USERS_MANAGE_ALL) ||
    hasPermission(Permission.USERS_MANAGE_DEPT);
  const canCreateUsers = canManageUsers;
  const canManageTemplates = hasPermission(Permission.ROLE_TEMPLATES_MANAGE);

  const apiDepartments: DepartmentRecord[] = (deptData?.departments || []) as DepartmentRecord[];
  const departmentByCode = React.useMemo(() => {
    const m = new Map<string, DepartmentRecord>();
    for (const d of apiDepartments) m.set(d.code, d);
    return m;
  }, [apiDepartments]);

  // Build grouped options for the department picker, dynamically.
  const groupedDepartmentOptions = React.useMemo(() => {
    const groups = new Map<string, DepartmentRecord[]>();
    for (const d of apiDepartments) {
      if (!d.isActive) continue;
      const cat = d.category || 'General';
      const list = groups.get(cat) || [];
      list.push(d);
      groups.set(cat, list);
    }
    return Array.from(groups.entries()).map(([category, items]) => ({
      category,
      items: items.sort((a, b) => (a.hebrewName || a.name).localeCompare(b.hebrewName || b.name, 'he')),
    }));
  }, [apiDepartments]);

  const rolesForDepartment = (code: string): { key: string; label: string }[] => {
    const dept = departmentByCode.get(code);
    if (!dept) return [];
    if (Array.isArray(dept.departmentRoles) && dept.departmentRoles.length > 0) {
      return dept.departmentRoles
        .filter((r) => r.isActive !== false)
        .map((r) => ({ key: r.name || r.key, label: r.hebrewName || r.name || r.key }));
    }
    // Fallback to legacy string roles for backwards compatibility.
    return (dept.roles || []).map((r) => ({ key: r, label: r }));
  };

  // Permissions implied by the user's selected departments and the roles the
  // admin picked within each. These are surfaced as locked, pre-checked
  // entries inside the "custom permissions" picker so the admin can see the
  // full effective permission set without having to re-select things by hand.
  const presetPermissionsFromDepartments = React.useMemo(() => {
    const set = new Set<string>();
    for (const deptCode of selectedDepartments) {
      const dept = departmentByCode.get(deptCode);
      if (!dept) continue;
      for (const p of dept.permissions || []) set.add(p);
      const selectedRoleKeys = departmentRoles[deptCode] || [];
      for (const roleKey of selectedRoleKeys) {
        const roleDef = (dept.departmentRoles || []).find(
          (r) => r.key === roleKey || r.name === roleKey,
        );
        if (roleDef) {
          for (const p of roleDef.permissions || []) set.add(p);
        }
      }
    }
    return Array.from(set);
  }, [selectedDepartments, departmentRoles, departmentByCode]);

  const handleCreateOrUpdate = async (values: any) => {
    if (!canManageUsers) {
      message.error('אין לך הרשאה לשנות משתמשים');
      return;
    }

    try {
      const departments = selectedDepartments.map((deptId) => {
        const dept = departmentByCode.get(deptId);
        const departmentName = dept?.hebrewName || dept?.name || deptId;
        return {
          departmentId: deptId,
          departmentName,
          roles: departmentRoles[deptId] || [],
        };
      });

      if (editingUser) {
        // UpdateUserInput does NOT accept `email`; the schema treats email as
        // immutable after creation. Pick only the fields that UpdateUserInput
        // actually allows so we don't trip the GraphQL validator.
        const updateInput: any = {
          firstName: values.firstName,
          lastName: values.lastName,
          systemRole: values.systemRole,
          phone: values.phone ?? null,
          mobile: values.mobile ?? null,
          isActive: typeof values.isActive === 'boolean' ? values.isActive : true,
          departments,
        };
        if (values.password) {
          updateInput.password = values.password;
        }
        if (roleTemplateId) {
          updateInput.roleTemplateId = roleTemplateId;
        }
        if (customPermissions.length > 0) {
          updateInput.customPermissions = customPermissions;
        }

        await updateUser({
          variables: { id: editingUser.id, input: updateInput },
        });
        message.success('משתמש עודכן בהצלחה');
      } else {
        const createInput: any = {
          ...values,
          departments,
          isActive: true,
        };
        if (roleTemplateId) {
          createInput.roleTemplateId = roleTemplateId;
        }
        if (customPermissions.length > 0) {
          createInput.customPermissions = customPermissions;
        }
        await createUser({ variables: { input: createInput } });
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
    if (!hasPermission(Permission.USERS_DELETE)) {
      message.error('אין לך הרשאה למחוק משתמשים');
      return;
    }

    modal.confirm({
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
    if (!canManageUsers) {
      message.error('אין לך הרשאה לשנות משתמשים');
      return;
    }

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
          {canManageUsers && <Button icon={<EditOutlined />} onClick={() => openModal(user)} />}
          {hasPermission(Permission.USERS_DELETE) && (
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
    // Tightened: viewing /users without management permission is meaningless
    // (page only renders a list + create/edit modal). This prevents MCR
    // Operators or any other role that may have only USERS_VIEW (legacy
    // tokens, accidental grants via the runtime registry, etc.) from landing
    // on the page.
    <ProtectedRoute requiresAny={[Permission.USERS_MANAGE_DEPT, Permission.USERS_MANAGE_ALL]}>
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
                showSearch
                filterOption={(input, option) =>
                  String(option?.label || option?.children || '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              >
                {groupedDepartmentOptions.map(({ category, items }) => (
                  <Select.OptGroup key={category} label={category}>
                    {items.map((dept) => (
                      <Option key={dept.code} value={dept.code}>
                        {dept.hebrewName || dept.name}
                      </Option>
                    ))}
                  </Select.OptGroup>
                ))}
              </Select>
            </Form.Item>

            {selectedDepartments.map((deptCode) => {
              const dept = departmentByCode.get(deptCode);
              const label = dept?.hebrewName || dept?.name || deptCode;
              const roles = rolesForDepartment(deptCode);
              return (
                <Form.Item key={deptCode} label={`תפקידים ב-${label}`}>
                  <Select
                    mode="multiple"
                    value={departmentRoles[deptCode] || []}
                    onChange={(rolesSelected) =>
                      setDepartmentRoles({ ...departmentRoles, [deptCode]: rolesSelected })
                    }
                    placeholder="בחר תפקידים"
                  >
                    {roles.map((role) => (
                      <Option key={role.key} value={role.key}>
                        {role.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              );
            })}

            <Divider>תבנית תפקיד והרשאות</Divider>

            <UserRoleAssigner
              actorSystemRole={mySystemRole || 'DEPARTMENT_USER'}
              roleTemplateId={roleTemplateId}
              customPermissions={customPermissions}
              presetPermissions={presetPermissionsFromDepartments}
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
