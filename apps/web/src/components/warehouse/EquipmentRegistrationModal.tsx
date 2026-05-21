import React, { useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, InputNumber, Button, Tabs, message, Space, Upload, Switch } from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import { CREATE_EQUIPMENT } from '../../graphql/mutations';
import { GET_WAREHOUSE_EQUIPMENT } from '../../graphql/queries';
import type { UploadFile } from 'antd/es/upload';
import type { TabsProps } from 'antd';
import dayjs from 'dayjs';
import WarehouseLocationPicker from './WarehouseLocationPicker';

const { TextArea } = Input;

interface EquipmentRegistrationModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Equipment categories mapping
const EQUIPMENT_CATEGORIES = {
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
  other: 'אחר'
};

const QUANTITY_BASED_DEFAULT_CATEGORIES = new Set(['batteries', 'cards', 'adapters']);

const EquipmentRegistrationModal: React.FC<EquipmentRegistrationModalProps> = ({ 
  visible, 
  onClose, 
  onSuccess 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  
  const [createEquipment] = useMutation(CREATE_EQUIPMENT, {
    refetchQueries: [{ query: GET_WAREHOUSE_EQUIPMENT }],
    onCompleted: () => {
      message.success('הציוד נרשם בהצלחה!');
      form.resetFields();
      setFileList([]);
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      console.error('Error creating equipment:', error);
      message.error('שגיאה ברישום הציוד');
    }
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      // Only send the legacy storage strings when the user actually
      // entered something — otherwise the warehouse/place picker is the
      // sole source of truth.
      const hasLegacyStorage = !!(values.row || values.shelf || values.cell);

      const input = {
        name: values.name,
        category: values.category,
        price: values.price || null,
        purchaseDate: values.purchaseDate ? values.purchaseDate.toISOString() : null,
        warrantyExpiryDate: values.warrantyExpiryDate ? values.warrantyExpiryDate.toISOString() : null,
        company: values.company || null,
        equipmentModel: values.equipmentModel || null,
        contactPerson: values.contactPerson || null,
        manualLink: values.manualLink || null,
        imageUrl: fileList.length > 0 ? fileList[0].url || fileList[0].response?.url : null,
        storage: hasLegacyStorage
          ? {
              row: values.row || null,
              shelf: values.shelf || null,
              cell: values.cell || null,
            }
          : null,
        warehouseId: values.warehouseId || null,
        storagePlaceId: values.storagePlaceId || null,
        quantityTotal: values.quantityTotal || 1,
        isQuantityBased: values.isQuantityBased ?? false,
        isSharedEngineeringEquipment: values.isSharedEngineeringEquipment ?? false,
      };

      await createEquipment({
        variables: { input },
      });
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    fileList,
    onChange: ({ fileList }: { fileList: UploadFile[] }) => {
      setFileList(fileList.slice(-1)); // Keep only the last file
    },
    beforeUpload: (file: File) => {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        message.error('ניתן להעלות רק קובצי תמונה!');
      }
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error('גודל התמונה חייב להיות פחות מ-5MB!');
      }
      return false; // Prevent auto upload
    },
    maxCount: 1
  };

  return (
    <Modal
      title="רשום ציוד חדש"
      open={visible}
      onCancel={onClose}
      width={700}
      footer={[
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          רשום ציוד
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ quantityTotal: 1 }}
      >
        <Tabs
          defaultActiveKey="1"
          items={[
            {
              key: '1',
              label: 'פרטים',
              children: (
                <>
                  <Form.Item
                    name="name"
                    label="שם המוצר"
                    rules={[{ required: true, message: 'נא להזין שם מוצר' }]}
                  >
                    <Input placeholder="לדוגמה: מצלמת Sony FX6" />
                  </Form.Item>

                  <Form.Item
                    name="category"
                    label="קטגוריה"
                    rules={[{ required: true, message: 'נא לבחור קטגוריה' }]}
                  >
                    <Select
                      placeholder="בחר קטגוריה"
                      onChange={(val: string) => {
                        form.setFieldValue('isQuantityBased', QUANTITY_BASED_DEFAULT_CATEGORIES.has(val));
                      }}
                    >
                      {Object.entries(EQUIPMENT_CATEGORIES).map(([key, value]) => (
                        <Select.Option key={key} value={key}>
                          {value}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="quantityTotal"
                    label="כמות"
                    rules={[{ required: true, message: 'נא להזין כמות' }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    name="isQuantityBased"
                    label="מעקב כמותי (ללא ברקוד ליחידה)"
                    valuePropName="checked"
                    tooltip="פריטים כמותיים מנוהלים כמאגר עם כפתור 'התאם כמות' במקום סריקת ברקוד ליחידה"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name="isSharedEngineeringEquipment"
                    label="ציוד הנדסה שיתופי"
                    valuePropName="checked"
                    tooltip="סימון ציוד שיופיע בלשונית ייעודית ב-MCR בכל פעם שהוא מוקצה לאירוע או לאיש צוות"
                  >
                    <Switch />
                  </Form.Item>
                </>
              ),
            },
            {
              key: '2',
              label: 'פרטים נוספים',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Form.Item
                    name="price"
                    label="מחיר"
                  >
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      placeholder="0"
                      addonBefore="₪"
                    />
                  </Form.Item>

                  <Form.Item
                    name="purchaseDate"
                    label="תאריך רכישה"
                  >
                    <DatePicker style={{ width: '100%' }} placeholder="בחר תאריך" />
                  </Form.Item>

                  <Form.Item
                    name="warrantyExpiryDate"
                    label="תאריך סיום אחריות"
                  >
                    <DatePicker style={{ width: '100%' }} placeholder="בחר תאריך" />
                  </Form.Item>

                  <Form.Item
                    name="company"
                    label="חברה"
                  >
                    <Input placeholder="לדוגמה: Sony" />
                  </Form.Item>

                  <Form.Item
                    name="equipmentModel"
                    label="דגם"
                  >
                    <Input placeholder="לדוגמה: FX6" />
                  </Form.Item>

                  <Form.Item
                    name="contactPerson"
                    label="איש קשר"
                  >
                    <Input placeholder="שם איש הקשר" />
                  </Form.Item>

                  <Form.Item
                    name="manualLink"
                    label="הוראות הפעלה (Link)"
                  >
                    <Input placeholder="https://..." />
                  </Form.Item>

                  <Form.Item
                    name="image"
                    label="תמונה של המוצר"
                  >
                    <Upload {...uploadProps} listType="picture-card">
                      {fileList.length === 0 && (
                        <div>
                          <PlusOutlined />
                          <div style={{ marginTop: 8 }}>העלה תמונה</div>
                        </div>
                      )}
                    </Upload>
                  </Form.Item>
                </Space>
              ),
            },
            {
              key: '3',
              label: 'אחסון',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>
                      מחסן ומיקום אחסון
                    </div>
                    <Form.Item shouldUpdate noStyle>
                      {() => (
                        <WarehouseLocationPicker
                          warehouseId={form.getFieldValue('warehouseId')}
                          storagePlaceId={form.getFieldValue('storagePlaceId')}
                          onChange={({ warehouseId, storagePlaceId }) => {
                            form.setFieldsValue({ warehouseId, storagePlaceId });
                          }}
                        />
                      )}
                    </Form.Item>
                    <Form.Item name="warehouseId" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="storagePlaceId" hidden>
                      <Input />
                    </Form.Item>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>
                      פרטי מיקום חופשיים (אופציונלי)
                    </div>
                    <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
                      ניתן להזין כאן ערכי טקסט חופשי לציוד שעדיין לא הותאם למחסן מוגדר.
                    </div>
                    <Form.Item name="row" label="שורה">
                      <Input placeholder="לדוגמה: A" />
                    </Form.Item>
                    <Form.Item name="shelf" label="מדף">
                      <Input placeholder="לדוגמה: 1" />
                    </Form.Item>
                    <Form.Item name="cell" label="תא">
                      <Input placeholder="לדוגמה: 3B" />
                    </Form.Item>
                  </div>
                </Space>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
};

export default EquipmentRegistrationModal; 