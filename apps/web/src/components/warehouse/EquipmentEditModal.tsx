import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Tabs,
  App,
  Space,
  Upload,
  Switch,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import { UPDATE_EQUIPMENT } from '../../graphql/mutations';
import { GET_WAREHOUSE_EQUIPMENT } from '../../graphql/queries';
import type { UploadFile } from 'antd/es/upload';
import dayjs from 'dayjs';
import WarehouseLocationPicker from './WarehouseLocationPicker';

interface EquipmentLike {
  id: string;
  name?: string;
  category?: string;
  price?: number | null;
  purchaseDate?: string | null;
  warrantyExpiryDate?: string | null;
  company?: string | null;
  equipmentModel?: string | null;
  contactPerson?: string | null;
  manualLink?: string | null;
  imageUrl?: string | null;
  storage?: { row?: string | null; shelf?: string | null; cell?: string | null } | null;
  warehouseId?: string | null;
  storagePlaceId?: string | null;
  warehouse?: { id: string; name: string } | null;
  storagePlace?: { id: string; name: string; type?: string; code?: string | null } | null;
  quantityTotal?: number;
  isQuantityBased?: boolean;
  isSharedEngineeringEquipment?: boolean;
  suspensionStatus?: string | null;
  condition?: string | null;
  currentLocation?: string | null;
  status?: string;
}

interface EquipmentEditModalProps {
  visible: boolean;
  equipment: EquipmentLike | null;
  onClose: () => void;
  onSuccess?: () => void;
}

// Equipment categories shown in the picker. Keep in sync with
// `EquipmentRegistrationModal` and the backend `EQUIPMENT_CATEGORIES` map.
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

const EquipmentEditModal: React.FC<EquipmentEditModalProps> = ({
  visible,
  equipment,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const [updateEquipment] = useMutation(UPDATE_EQUIPMENT, {
    refetchQueries: [{ query: GET_WAREHOUSE_EQUIPMENT }],
    awaitRefetchQueries: true,
    onCompleted: () => {
      message.success('פרטי הציוד נשמרו בהצלחה');
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      console.error('Error updating equipment:', error);
      message.error('שגיאה בשמירת פרטי הציוד');
    },
  });

  // Prefill the form whenever a new equipment object is opened. We rely on
  // `equipment?.id` rather than the whole object so the effect doesn't
  // re-run while the user is editing.
  useEffect(() => {
    if (!equipment || !visible) return;
    form.setFieldsValue({
      name: equipment.name,
      category: equipment.category,
      price: equipment.price ?? undefined,
      purchaseDate: equipment.purchaseDate ? dayjs(equipment.purchaseDate) : null,
      warrantyExpiryDate: equipment.warrantyExpiryDate
        ? dayjs(equipment.warrantyExpiryDate)
        : null,
      company: equipment.company ?? undefined,
      equipmentModel: equipment.equipmentModel ?? undefined,
      contactPerson: equipment.contactPerson ?? undefined,
      manualLink: equipment.manualLink ?? undefined,
      row: equipment.storage?.row ?? undefined,
      shelf: equipment.storage?.shelf ?? undefined,
      cell: equipment.storage?.cell ?? undefined,
      warehouseId:
        equipment.warehouseId ?? equipment.warehouse?.id ?? null,
      storagePlaceId:
        equipment.storagePlaceId ?? equipment.storagePlace?.id ?? null,
      quantityTotal: equipment.quantityTotal ?? 1,
      isQuantityBased: !!equipment.isQuantityBased,
      isSharedEngineeringEquipment: !!equipment.isSharedEngineeringEquipment,
    });
    if (equipment.imageUrl) {
      setFileList([
        {
          uid: '-existing',
          name: 'תמונה קיימת',
          status: 'done',
          url: equipment.imageUrl,
        } as UploadFile,
      ]);
    } else {
      setFileList([]);
    }
  }, [equipment?.id, visible, form, equipment]);

  const handleSubmit = async () => {
    if (!equipment) return;
    try {
      setLoading(true);
      const values = await form.validateFields();

      const hasLegacyStorage = !!(values.row || values.shelf || values.cell);
      const input = {
        name: values.name,
        category: values.category,
        price: values.price ?? null,
        purchaseDate: values.purchaseDate ? values.purchaseDate.toISOString() : null,
        warrantyExpiryDate: values.warrantyExpiryDate
          ? values.warrantyExpiryDate.toISOString()
          : null,
        company: values.company || null,
        equipmentModel: values.equipmentModel || null,
        contactPerson: values.contactPerson || null,
        manualLink: values.manualLink || null,
        imageUrl: fileList.length > 0
          ? fileList[0].url || fileList[0].response?.url || equipment.imageUrl
          : null,
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

      await updateEquipment({ variables: { id: equipment.id, input } });
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Image uploader configured for client-side replacement only — the saved
  // imageUrl reuses the existing URL until a new file is supplied with a
  // real upload pipeline.
  const uploadProps = {
    fileList,
    onChange: ({ fileList: next }: { fileList: UploadFile[] }) => {
      setFileList(next.slice(-1));
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
      return false;
    },
    maxCount: 1,
  };

  return (
    <Modal
      title={equipment ? `עריכת ציוד: ${equipment.name || ''}` : 'עריכת ציוד'}
      open={visible}
      onCancel={onClose}
      width={700}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          שמור שינויים
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
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
                    <Select placeholder="בחר קטגוריה">
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
                  <Form.Item name="price" label="מחיר">
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      placeholder="0"
                      addonBefore="₪"
                    />
                  </Form.Item>

                  <Form.Item name="purchaseDate" label="תאריך רכישה">
                    <DatePicker style={{ width: '100%' }} placeholder="בחר תאריך" />
                  </Form.Item>

                  <Form.Item name="warrantyExpiryDate" label="תאריך סיום אחריות">
                    <DatePicker style={{ width: '100%' }} placeholder="בחר תאריך" />
                  </Form.Item>

                  <Form.Item name="company" label="חברה">
                    <Input placeholder="לדוגמה: Sony" />
                  </Form.Item>

                  <Form.Item name="equipmentModel" label="דגם">
                    <Input placeholder="לדוגמה: FX6" />
                  </Form.Item>

                  <Form.Item name="contactPerson" label="איש קשר">
                    <Input placeholder="שם איש הקשר" />
                  </Form.Item>

                  <Form.Item name="manualLink" label="הוראות הפעלה (Link)">
                    <Input placeholder="https://..." />
                  </Form.Item>

                  <Form.Item name="image" label="תמונה של המוצר">
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
                      ערכי טקסט חופשי לציוד ישן שעדיין לא הותאם למחסן מוגדר.
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

export default EquipmentEditModal;
