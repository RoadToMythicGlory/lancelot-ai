import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Card, Space, Tag, App, Popconfirm, Row, Col, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined, MailOutlined, GlobalOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_VENDORS, CREATE_VENDOR, UPDATE_VENDOR, DELETE_VENDOR, TOGGLE_VENDOR_STATUS } from '../../graphql/vendor-queries';
import WarehouseExportButtons from './WarehouseExportButtons';
import type { ExportColumn, ExportReport } from '@/utils/warehouseReportExport';

const { Option } = Select;
const { TextArea } = Input;

interface Vendor {
  id: string;
  name: string;
  hebrewName?: string;
  category: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  alternateContactName?: string;
  alternateContactPhone?: string;
  address: {
    street: string;
    city: string;
    postalCode?: string;
    country: string;
  };
  website?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VendorManagementProps {
  canManage?: boolean;
}

const VendorManagement: React.FC<VendorManagementProps> = ({ canManage = false }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form] = Form.useForm();
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const { message } = App.useApp();

  // GraphQL queries and mutations
  const { data, loading, refetch } = useQuery(GET_VENDORS, {
    variables: {
      filter: {
        category: filterCategory,
        searchText: searchText || undefined
      }
    }
  });

  const [createVendor] = useMutation(CREATE_VENDOR, {
    onCompleted: () => {
      message.success('ספק נוצר בהצלחה');
      refetch();
      handleCancel();
    },
    onError: (error) => {
      message.error(`שגיאה ביצירת ספק: ${error.message}`);
    }
  });

  const [updateVendor] = useMutation(UPDATE_VENDOR, {
    onCompleted: () => {
      message.success('ספק עודכן בהצלחה');
      refetch();
      handleCancel();
    },
    onError: (error) => {
      message.error(`שגיאה בעדכון ספק: ${error.message}`);
    }
  });

  const [deleteVendor] = useMutation(DELETE_VENDOR, {
    onCompleted: () => {
      message.success('ספק נמחק בהצלחה');
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה במחיקת ספק: ${error.message}`);
    }
  });

  const [toggleVendorStatus] = useMutation(TOGGLE_VENDOR_STATUS, {
    onCompleted: () => {
      message.success('סטטוס ספק עודכן בהצלחה');
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה בעדכון סטטוס: ${error.message}`);
    }
  });

  const vendors = data?.vendors || [];

  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingVendor(null);
    form.resetFields();
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingVendor) {
        await updateVendor({
          variables: {
            id: editingVendor.id,
            input: values
          }
        });
      } else {
        await createVendor({
          variables: {
            input: values
          }
        });
      }
    } catch (error) {
      // Error handling is done in mutation callbacks
    }
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    form.setFieldsValue({
      name: vendor.name,
      hebrewName: vendor.hebrewName,
      category: vendor.category,
      contactName: vendor.contactName,
      contactPhone: vendor.contactPhone,
      contactEmail: vendor.contactEmail,
      alternateContactName: vendor.alternateContactName,
      alternateContactPhone: vendor.alternateContactPhone,
      address: vendor.address,
      website: vendor.website,
      notes: vendor.notes
    });
    setIsModalVisible(true);
  };

  const buildVendorReport = (): ExportReport | null => {
    if (vendors.length === 0) return null;

    const cols: ExportColumn<Vendor>[] = [
      {
        key: 'name',
        label: 'שם ספק',
        emphasis: true,
        value: (r) => [r.name, r.hebrewName].filter(Boolean).join(' / '),
      },
      {
        key: 'category',
        label: 'קטגוריה',
        value: (r) =>
          r.category === 'equipment'
            ? 'ציוד'
            : r.category === 'services'
              ? 'שירותים'
              : r.category === 'both'
                ? 'משולב'
                : r.category || '',
      },
      { key: 'contactName', label: 'איש קשר', value: (r) => r.contactName || '' },
      { key: 'contactPhone', label: 'טלפון', value: (r) => r.contactPhone || '' },
      { key: 'contactEmail', label: 'דוא״ל', value: (r) => r.contactEmail || '' },
      {
        key: 'address',
        label: 'כתובת',
        value: (r) =>
          [r.address?.street, r.address?.city, r.address?.country]
            .filter(Boolean)
            .join(', '),
      },
      { key: 'website', label: 'אתר אינטרנט', value: (r) => r.website || '' },
      {
        key: 'altContact',
        label: 'איש קשר משני',
        value: (r) =>
          [r.alternateContactName, r.alternateContactPhone]
            .filter(Boolean)
            .join(' · '),
      },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => (r.isActive ? 'פעיל' : 'לא פעיל'),
        status: (r) =>
          r.isActive
            ? { label: 'פעיל', variant: 'active' }
            : { label: 'לא פעיל', variant: 'danger' },
      },
      { key: 'notes', label: 'הערות', value: (r) => r.notes || '' },
    ];

    const active = vendors.filter((v: Vendor) => v.isActive).length;
    const inactive = vendors.length - active;
    const equipmentVendors = vendors.filter((v: Vendor) => v.category === 'equipment' || v.category === 'both').length;
    const serviceVendors = vendors.filter((v: Vendor) => v.category === 'services' || v.category === 'both').length;

    const chips: string[] = [];
    if (filterCategory) {
      chips.push(
        `קטגוריה: ${
          filterCategory === 'equipment'
            ? 'ציוד'
            : filterCategory === 'services'
              ? 'שירותים'
              : 'משולב'
        }`,
      );
    }
    if (searchText.trim()) chips.push(`חיפוש: ${searchText.trim()}`);

    return {
      title: 'דוח ספקים',
      subtitle: 'רשימת ספקים פעילים ולא פעילים, כולל פרטי קשר וכתובות.',
      filenameStem: 'מחסן-ספקים',
      origin: 'מחסן · ספקים',
      metaChips: chips,
      summary: [
        { label: 'סה״כ ספקים', value: vendors.length, accent: 'vendors' },
        { label: 'פעילים', value: active, accent: 'events' },
        { label: 'לא פעילים', value: inactive, accent: 'history' },
        { label: 'ספקי ציוד', value: equipmentVendors, accent: 'warehouse' },
        { label: 'ספקי שירות', value: serviceVendors, accent: 'sets' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'vendors',
          title: 'ספקים',
          accent: 'vendors',
          meta: `${vendors.length} שורות`,
          columns: cols,
          rows: vendors,
        },
      ],
    };
  };

  const columns = [
    {
      title: 'שם ספק',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Vendor) => (
        <div>
          <div>{text}</div>
          {record.hebrewName && <div className="text-gray-500 text-sm">{record.hebrewName}</div>}
          {!record.isActive && <Tag color="red">לא פעיל</Tag>}
        </div>
      )
    },
    {
      title: 'קטגוריה',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => category ? (
        <Tag color={category === 'equipment' ? 'blue' : category === 'services' ? 'green' : 'purple'}>
          {category === 'equipment' ? 'ציוד' : category === 'services' ? 'שירותים' : 'משולב'}
        </Tag>
      ) : <span className="text-gray-400">-</span>
    },
    {
      title: 'איש קשר',
      key: 'contact',
      render: (_: any, record: Vendor) => {
        if (!record.contactName && !record.contactPhone && !record.contactEmail) {
          return <span className="text-gray-400">-</span>;
        }
        return (
          <div>
            {record.contactName && <div>{record.contactName}</div>}
            {record.contactPhone && (
              <div className="text-gray-500 text-sm">
                <PhoneOutlined /> {record.contactPhone}
              </div>
            )}
            {record.contactEmail && (
              <div className="text-gray-500 text-sm">
                <MailOutlined /> {record.contactEmail}
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'כתובת',
      key: 'address',
      render: (_: any, record: Vendor) => {
        if (!record.address || (!record.address.street && !record.address.city)) {
          return <span className="text-gray-400">-</span>;
        }
        return (
          <div>
            {record.address.street && <div>{record.address.street}</div>}
            {(record.address.city || record.address.country) && (
              <div className="text-gray-500 text-sm">
                {[record.address.city, record.address.country].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'אתר אינטרנט',
      dataIndex: 'website',
      key: 'website',
      render: (website: string) => website && (
        <a href={website} target="_blank" rel="noopener noreferrer">
          <GlobalOutlined /> קישור
        </a>
      )
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: Vendor) => canManage ? (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            ערוך
          </Button>
          <Button
            type="link"
            onClick={() => toggleVendorStatus({ variables: { id: record.id } })}
          >
            {record.isActive ? 'השבת' : 'הפעל'}
          </Button>
          <Popconfirm
            title="האם אתה בטוח שברצונך למחוק ספק זה?"
            onConfirm={() => deleteVendor({ variables: { id: record.id } })}
            okText="כן"
            cancelText="לא"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              מחק
            </Button>
          </Popconfirm>
        </Space>
      ) : null
    }
  ];

  return (
    <Card>
      <div className="mb-4">
        <Row gutter={16} align="middle">
          <Col span={6}>
            <h2 className="text-2xl font-bold">ניהול ספקים</h2>
          </Col>
          <Col span={6}>
            <Input.Search
              placeholder="חפש ספק..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={() => refetch()}
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="סנן לפי קטגוריה"
              style={{ width: '100%' }}
              allowClear
              value={filterCategory}
              onChange={setFilterCategory}
            >
              <Option value="equipment">ציוד</Option>
              <Option value="services">שירותים</Option>
              <Option value="both">משולב</Option>
            </Select>
          </Col>
          <Col span={6} style={{ textAlign: 'left' }}>
            <Space>
              <WarehouseExportButtons
                buildReport={() => buildVendorReport()}
                disabled={loading || vendors.length === 0}
              />
              {canManage && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setIsModalVisible(true)}
                >
                  הוסף ספק חדש
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={vendors}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `סה"כ ${total} ספקים`
          }}
        />
      </Spin>

      <Modal
        title={editingVendor ? 'ערוך ספק' : 'הוסף ספק חדש'}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            address: { country: 'Israel' }
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="שם ספק (אנגלית)"
                rules={[{ required: true, message: 'שדה חובה' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hebrewName" label="שם ספק (עברית)">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="category"
                label="קטגוריה"
              >
                <Select placeholder="בחר קטגוריה">
                  <Option value="equipment">ציוד</Option>
                  <Option value="services">שירותים</Option>
                  <Option value="both">משולב</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="website" label="אתר אינטרנט">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <h4 className="mb-3 font-semibold">פרטי איש קשר ראשי</h4>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="contactName"
                label="שם איש קשר"
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="contactPhone"
                label="טלפון"
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contactEmail" label="דוא״ל">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>

          <h4 className="mb-3 font-semibold">איש קשר משני (אופציונלי)</h4>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="alternateContactName" label="שם איש קשר משני">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="alternateContactPhone" label="טלפון איש קשר משני">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <h4 className="mb-3 font-semibold">כתובת</h4>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={['address', 'street']}
                label="רחוב"
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name={['address', 'city']}
                label="עיר"
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name={['address', 'postalCode']} label="מיקוד">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name={['address', 'country']}
                label="מדינה"
              >
                <Input placeholder="Israel" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="הערות">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingVendor ? 'עדכן' : 'צור'}
              </Button>
              <Button onClick={handleCancel}>ביטול</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default VendorManagement;
