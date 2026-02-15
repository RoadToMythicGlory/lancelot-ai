import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Card, Row, Col, Divider, Typography } from 'antd';
import { 
  ControlOutlined,
  VideoCameraOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import { GET_BROADCAST_EVENT } from '../../graphql/queries';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface BroadcastEvent {
  id: string;
  title: string;
  metadata?: any;
  startTime?: string;
  [key: string]: any;
}

interface MCRModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onDataSaved?: () => void;
}

interface CameramanData {
  name: string;
  cameraBarcode: string;
  cameraModel?: string;
}

const MCRModal: React.FC<MCRModalProps> = ({ visible, event, onClose, onDataSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [cameramanData, setCameramanData] = useState<CameramanData[]>([]);

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    onCompleted: () => {
      console.log('✅ MCR data saved successfully');
      if (onDataSaved) {
        onDataSaved();
      }
    },
    onError: (error) => {
      console.error('❌ Error saving MCR data:', error);
    }
  });

  // Query for existing MCR data
  const { data: existingData, refetch } = useQuery(GET_BROADCAST_EVENT, {
    variables: { id: event?.id },
    skip: !event?.id || !visible
  });

  // Initialize form with existing data
  useEffect(() => {
    if (visible && event) {
      const eventData = existingData?.broadcastEvent || event;
      const mcrData = eventData.metadata?.departments?.mcr || {};
      
      // Format date and time from the event
      const formattedDate = eventData.startTime ? dayjs(eventData.startTime).format('DD/MM/YYYY') : 
                           eventData.metadata?.rawHebrewData?.תאריך || 
                           eventData.metadata?.eventDetails?.date || '';
      const formattedTime = eventData.startTime ? dayjs(eventData.startTime).format('HH:mm') : 
                           eventData.metadata?.rawHebrewData?.שעה || 
                           eventData.metadata?.eventDetails?.time || '';
      
      form.setFieldsValue({
        אירוע: eventData.title || eventData.hebrewTitle || '',
        תאריך: formattedDate,
        שעה: formattedTime,
        מקור: mcrData.מקור || '',
        גיבוי: mcrData.גיבוי || '',
        מכשירים: mcrData.מכשירים || '',
        ניתובים: mcrData.ניתובים || ''
      });

      // TODO: Fetch cameraman data from warehouse/equipment assignments
      // For now, using mock data or showing "No Available Data"
      if (mcrData.cameramanData) {
        setCameramanData(mcrData.cameramanData);
      } else {
        setCameramanData([]);
      }
    }
  }, [visible, event, existingData, form]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // Prepare the data for saving - the backend expects customData at the root level
      const departmentData = {
        customData: {
          מקור: values.מקור,
          גיבוי: values.גיבוי,
          מכשירים: values.מכשירים,
          ניתובים: values.ניתובים,
          // Store cameraman data if available
          cameramanData: cameramanData.length > 0 ? cameramanData : null,
          notApplicable: false // Clear the not applicable flag when saving data
        }
      };

      console.log('📤 MCR Modal - Saving data:', departmentData);

      // Call the mutation to save to MongoDB
      const result = await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'mcr',
          data: departmentData
        }
      });
      
      console.log('📥 MCR Modal - Save result:', result);
      
      onClose();
    } catch (error) {
      console.error('Error saving MCR configuration:', error);
      // Add user-facing error message
      alert('שגיאה בשמירת נתוני MCR: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <ControlOutlined />
          <span>MCR - מכשירים וניתוב</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
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
                  department: 'mcr',
                  data: departmentData
                }
              });
              
              if (onDataSaved) {
                onDataSaved();
              }
              onClose();
            } catch (error) {
              console.error('Error marking as not applicable:', error);
              alert('שגיאה בסימון כלא רלוונטי: ' + (error as any).message);
            } finally {
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
          שמור
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        dir="rtl"
      >
        {/* Read-only fields from Broadcast Planning */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="אירוע" label="אירוע">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="תאריך" label="תאריך">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="שעה" label="שעה">
              <Input disabled className="bg-gray-50" />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        {/* Fillable containers */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              name="מקור" 
              label="מקור"
            >
              <TextArea 
                rows={4} 
                placeholder="הזן פרטי מקור..."
                className="font-mono"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              name="גיבוי" 
              label="גיבוי"
            >
              <TextArea 
                rows={4} 
                placeholder="הזן פרטי גיבוי..."
                className="font-mono"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              name="מכשירים" 
              label="מכשירים"
            >
              <TextArea 
                rows={4} 
                placeholder="הזן רשימת מכשירים..."
                className="font-mono"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              name="ניתובים" 
              label="ניתובים"
            >
              <TextArea 
                rows={4} 
                placeholder="הזן פרטי ניתובים..."
                className="font-mono"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Divider />

      {/* Cameraman Data Section */}
      <div className="mt-4">
        <Title level={5} className="mb-3">
          <VideoCameraOutlined className="ml-2" />
          נתוני צלמים ומצלמות
        </Title>
        
        {cameramanData.length > 0 ? (
          <div className="space-y-2">
            {cameramanData.map((cameraman, index) => (
              <Card key={index} size="small" className="bg-gray-50">
                <Row>
                  <Col span={12}>
                    <Text strong>
                      <UserOutlined className="ml-1" />
                      שם הצלם:
                    </Text>{' '}
                    {cameraman.name}
                  </Col>
                  <Col span={12}>
                    <Text strong>
                      <VideoCameraOutlined className="ml-1" />
                      ברקוד מצלמה:
                    </Text>{' '}
                    {cameraman.cameraBarcode}
                    {cameraman.cameraModel && (
                      <Text className="text-gray-500 mr-2">
                        ({cameraman.cameraModel})
                      </Text>
                    )}
                  </Col>
                </Row>
              </Card>
            ))}
          </div>
        ) : (
          <Card size="small" className="bg-gray-100 text-center">
            <Text className="text-gray-500">No Available Data</Text>
          </Card>
        )}
      </div>
    </Modal>
  );
};

export default MCRModal; 