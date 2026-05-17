import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Button, Card, Row, Col, Radio, Space, Alert } from 'antd';
import { MessageOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';

const { Option } = Select;

interface BroadcastEvent {
  id: string;
  title: string;
  [key: string]: any;
}

interface ClosedCaptionsModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onDataSaved?: () => void;
  /** When false, hides save / not-applicable buttons and disables form fields. */
  canEdit?: boolean;
}

const ClosedCaptionsModal: React.FC<ClosedCaptionsModalProps> = ({
  visible,
  event,
  onClose,
  onDataSaved,
  canEdit = true,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string>('none');
  const [captionType, setCaptionType] = useState<string>('None');

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    onCompleted: () => {
      console.log('✅ Closed Captions data saved successfully');
      if (onDataSaved) {
        onDataSaved();
      }
    },
    onError: (error) => {
      console.error('❌ Error saving Closed Captions data:', error);
    }
  });

  // Initialize form with existing data
  useEffect(() => {
    if (visible && event) {
      const metadata = event.metadata || {};
      const departmentData = metadata.departments?.closedCaptions || {};
      const existingCaptionType = event.subtitles || departmentData.captionType || 'None';
      
      setCaptionType(existingCaptionType);
      setSelectedOption(
        existingCaptionType === 'CC' ? 'cc' : 
        existingCaptionType === 'Sign Language' ? 'signLanguage' : 
        'none'
      );
      
      form.setFieldsValue({
        captionType: existingCaptionType === 'CC' ? 'cc' : 
                    existingCaptionType === 'Sign Language' ? 'signLanguage' : 
                    'none'
      });
    }
  }, [visible, event, form]);

  const captionOptions = [
    {
      value: 'cc',
      label: 'CC (Closed Captions)',
      description: 'כתוביות סמויות רגילות לתמלול שיחות ודיאלוגים'
    },
    {
      value: 'signLanguage',
      label: 'שפת סימנים',
      description: 'תרגום לשפת הסימנים יוצג בפינת המסך'
    },
    {
      value: 'none',
      label: 'ללא',
      description: 'השידור יועבר ללא כתוביות או שפת סימנים'
    }
  ];

  const handleSubmit = async (values: any) => {
    if (!canEdit) return;
    setLoading(true);
    try {
      // Map form value to display value
      const captionTypeValue = values.captionType === 'cc' ? 'CC' : 
                              values.captionType === 'signLanguage' ? 'Sign Language' : 
                              'None';

      // Prepare the data for saving - wrap in customData like other modals
      const departmentData = {
        customData: {
          captionType: captionTypeValue,
          notApplicable: false // Clear the not applicable flag when saving data
        }
      };

      console.log('📤 Closed Captions - Saving data:', departmentData);

      // Call the mutation to save to MongoDB
      await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'closedCaptions',
          data: departmentData
        }
      });
      
      onClose();
    } catch (error) {
      console.error('Error saving closed captions data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCaptionTypeColor = (type: string) => {
    switch (type) {
      case 'CC':
        return 'bg-blue-50 text-blue-700 border-blue-300';
      case 'Sign Language':
        return 'bg-green-50 text-green-700 border-green-300';
      case 'None':
        return 'bg-gray-50 text-gray-700 border-gray-300';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-300';
    }
  };

  const handleOptionChange = (value: string) => {
    setSelectedOption(value);
    setCaptionType(value === 'cc' ? 'CC' : value === 'signLanguage' ? 'Sign Language' : 'None');
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <MessageOutlined />
          <span>כתוביות סמויות</span>
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
      width={600}
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
                  department: 'closedCaptions',
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
        </Button>,
      ] : [
        <Button key="close" onClick={onClose}>
          סגור
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ captionType: 'none' }}
        disabled={!canEdit}
      >
        <div className="mb-4">
          <Card size="small" className="bg-purple-50">
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

        <Alert
          message="הגדרת כתוביות סמויות"
          description="בחר את סוג הכתוביות הסמויות הרצוי עבור השידור"
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          className="mb-4"
        />

        <Form.Item 
          name="captionType" 
          label="סוג כתוביות"
          rules={[{ required: true, message: 'אנא בחר סוג כתוביות' }]}
        >
          <Radio.Group 
            value={selectedOption} 
            onChange={(e) => handleOptionChange(e.target.value)}
            className="w-full"
          >
            <Space direction="vertical" className="w-full">
              {captionOptions.map(option => (
                <Card 
                  key={option.value}
                  className={`cursor-pointer transition-all ${
                    selectedOption === option.value ? 'border-purple-500 bg-purple-50' : ''
                  }`}
                >
                  <Radio value={option.value}>
                    <div>
                      <div className="font-semibold">{option.label}</div>
                      <div className="text-gray-600 text-sm mt-1">{option.description}</div>
                    </div>
                  </Radio>
                </Card>
              ))}
            </Space>
          </Radio.Group>
        </Form.Item>

        {selectedOption !== 'none' && (
          <Alert
            message="שים לב"
            description={
              selectedOption === 'cc' 
                ? "כתוביות CC יכללו תמלול של כל הדיאלוגים והטקסט המדובר בשידור"
                : "תרגום לשפת הסימנים יוצג בחלון נפרד בפינת המסך במהלך השידור"
            }
            type="warning"
            showIcon
            className="mt-4"
          />
        )}
      </Form>
    </Modal>
  );
};

export default ClosedCaptionsModal; 