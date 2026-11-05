'use client';

import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Button, 
  Form, 
  Input, 
  Select, 
  Card, 
  Space, 
  message, 
  Alert,
  Row,
  Col,
  Divider,
  Tag,
  Spin,
  Image,
  Switch,
  InputNumber
} from 'antd';
import { useMutation, useQuery } from '@apollo/client';
import { 
  GET_VIZRT_TEMPLATES, 
  TRIGGER_CG, 
  PREVIEW_CG 
} from '../../graphql/vizrt-queries';
import { 
  PlayCircleOutlined, 
  EyeOutlined, 
  SettingOutlined,
  ThunderboltOutlined,
  LoadingOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;

interface VizrtTemplateField {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT' | 'COLOR' | 'IMAGE' | 'VIDEO';
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

interface VizrtTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  fields: VizrtTemplateField[];
  previewUrl?: string;
}

interface CGControlPanelProps {
  visible: boolean;
  onClose: () => void;
  eventId?: string;
  segmentId?: string;
  initialTemplate?: string;
  initialFields?: Record<string, any>;
}

const TEMPLATE_CATEGORIES = [
  { value: 'LOWER_THIRD', label: 'Lower Third', color: 'blue' },
  { value: 'SCORE_BUG', label: 'Score Bug', color: 'green' },
  { value: 'BREAKING_NEWS', label: 'Breaking News', color: 'red' },
  { value: 'WEATHER', label: 'Weather', color: 'cyan' },
  { value: 'SPORTS_TICKER', label: 'Sports Ticker', color: 'orange' },
  { value: 'ELECTION_RESULTS', label: 'Election Results', color: 'purple' },
  { value: 'CUSTOM', label: 'Custom', color: 'default' }
];

export default function CGControlPanel({ 
  visible, 
  onClose, 
  eventId, 
  segmentId, 
  initialTemplate,
  initialFields = {}
}: CGControlPanelProps) {
  const [form] = Form.useForm();
  const [selectedTemplate, setSelectedTemplate] = useState<VizrtTemplate | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isTriggerLoading, setIsTriggerLoading] = useState(false);
  const [lastTriggerResult, setLastTriggerResult] = useState<any>(null);

  const { data: templatesData, loading: templatesLoading } = useQuery(GET_VIZRT_TEMPLATES);
  const [triggerCG] = useMutation(TRIGGER_CG);
  const [previewCG] = useMutation(PREVIEW_CG);

  useEffect(() => {
    if (initialTemplate && templatesData?.vizrtTemplates) {
      const template = templatesData.vizrtTemplates.find((t: VizrtTemplate) => t.id === initialTemplate);
      if (template) {
        setSelectedTemplate(template);
        // Set initial field values
        const fieldValues: Record<string, any> = {};
        template.fields.forEach((field: VizrtTemplateField) => {
          fieldValues[field.key] = initialFields[field.key] || field.defaultValue || '';
        });
        form.setFieldsValue(fieldValues);
      }
    }
  }, [initialTemplate, templatesData, initialFields, form]);

  const handleTemplateChange = (templateId: string) => {
    const template = templatesData?.vizrtTemplates.find((t: VizrtTemplate) => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      setPreviewUrl(null);
      setLastTriggerResult(null);
      
      // Reset form with default values
      const fieldValues: Record<string, any> = {};
      template.fields.forEach((field: VizrtTemplateField) => {
        fieldValues[field.key] = field.defaultValue || '';
      });
      form.setFieldsValue(fieldValues);
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) {
      message.warning('Please select a template first');
      return;
    }

    try {
      setIsPreviewLoading(true);
      const fieldValues = form.getFieldsValue();
      
      const { data } = await previewCG({
        variables: {
          input: {
            templateId: selectedTemplate.id,
            fields: JSON.stringify(fieldValues),
            preview: true,
            eventId,
            segmentId
          }
        }
      });

      if (data.previewCG.success) {
        setPreviewUrl(data.previewCG.previewUrl);
        message.success('Preview generated successfully');
      } else {
        message.error(data.previewCG.message || 'Failed to generate preview');
      }
    } catch (error: any) {
      message.error(`Error generating preview: ${error.message}`);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleTrigger = async () => {
    if (!selectedTemplate) {
      message.warning('Please select a template first');
      return;
    }

    try {
      await form.validateFields();
      setIsTriggerLoading(true);
      const fieldValues = form.getFieldsValue();
      
      const { data } = await triggerCG({
        variables: {
          input: {
            templateId: selectedTemplate.id,
            fields: JSON.stringify(fieldValues),
            preview: false,
            eventId,
            segmentId
          }
        }
      });

      setLastTriggerResult(data.triggerCG);
      
      if (data.triggerCG.success) {
        message.success('CG triggered successfully!');
      } else {
        message.error(data.triggerCG.message || 'Failed to trigger CG');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
      } else {
        message.error(`Error triggering CG: ${error.message}`);
      }
    } finally {
      setIsTriggerLoading(false);
    }
  };

  const renderFieldInput = (field: VizrtTemplateField) => {
    const commonProps = {
      placeholder: field.label,
      disabled: isTriggerLoading
    };

    switch (field.type) {
      case 'NUMBER':
        return <InputNumber {...commonProps} style={{ width: '100%' }} />;
      
      case 'BOOLEAN':
        return <Switch {...commonProps} />;
      
      case 'SELECT':
        return (
          <Select {...commonProps}>
            {field.options?.map(option => (
              <Option key={option} value={option}>{option}</Option>
            ))}
          </Select>
        );
      
      case 'COLOR':
        return <Input {...commonProps} type="color" />;
      
      case 'IMAGE':
      case 'VIDEO':
        return <Input {...commonProps} placeholder={`${field.type.toLowerCase()} URL or path`} />;
      
      default:
        return field.key.toLowerCase().includes('note') || field.key.toLowerCase().includes('description') ?
          <TextArea {...commonProps} rows={2} /> :
          <Input {...commonProps} />;
    }
  };

  const getCategoryColor = (category: string) => {
    return TEMPLATE_CATEGORIES.find(cat => cat.value === category)?.color || 'default';
  };

  const getCategoryLabel = (category: string) => {
    return TEMPLATE_CATEGORIES.find(cat => cat.value === category)?.label || category;
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <ThunderboltOutlined />
          <span>CG Control Panel</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={null}
              destroyOnHidden
    >
      <div className="space-y-4">
        {/* Template Selection */}
        <Card size="small" title="Template Selection">
          <Select
            placeholder="Select CG template"
            style={{ width: '100%' }}
            loading={templatesLoading}
            onChange={handleTemplateChange}
            value={selectedTemplate?.id}
            showSearch
            optionFilterProp="children"
          >
            {templatesData?.vizrtTemplates.map((template: VizrtTemplate) => (
              <Option key={template.id} value={template.id}>
                <div className="flex items-center justify-between">
                  <span>{template.name}</span>
                  <Tag color={getCategoryColor(template.category)}>
                    {getCategoryLabel(template.category)}
                  </Tag>
                </div>
              </Option>
            ))}
          </Select>
          
          {selectedTemplate && (
            <div className="mt-2 text-sm text-gray-600">
              {selectedTemplate.description}
            </div>
          )}
        </Card>

        {/* Template Fields */}
        {selectedTemplate && (
          <Card size="small" title="Template Fields">
            <Form
              form={form}
              layout="vertical"
              size="small"
            >
              <Row gutter={16}>
                {selectedTemplate.fields.map((field, index) => (
                  <Col 
                    key={field.key} 
                    span={field.type === 'BOOLEAN' ? 8 : field.type === 'COLOR' ? 8 : 12}
                  >
                    <Form.Item
                      name={field.key}
                      label={
                        <div className="flex items-center gap-1">
                          <span>{field.label}</span>
                          {field.required && <span className="text-red-500">*</span>}
                          <Tag color="default">{field.type}</Tag>
                        </div>
                      }
                      rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}
                      valuePropName={field.type === 'BOOLEAN' ? 'checked' : 'value'}
                    >
                      {renderFieldInput(field)}
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </Form>
          </Card>
        )}

        {/* Preview Section */}
        {previewUrl && (
          <Card size="small" title="Preview">
            <div className="text-center">
              <Image
                src={previewUrl}
                alt="CG Preview"
                style={{ maxHeight: 200 }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3Ik1RnG4W+FgYxN"
              />
            </div>
          </Card>
        )}

        {/* Status Messages */}
        {lastTriggerResult && (
          <Alert
            type={lastTriggerResult.success ? 'success' : 'error'}
            message={lastTriggerResult.message}
            description={lastTriggerResult.triggerId && `Trigger ID: ${lastTriggerResult.triggerId}`}
            showIcon
            closable
          />
        )}

        {/* Action Buttons */}
        <Card size="small">
          <Row gutter={16}>
            <Col span={12}>
              <Button
                type="default"
                icon={isPreviewLoading ? <LoadingOutlined /> : <EyeOutlined />}
                onClick={handlePreview}
                disabled={!selectedTemplate || isPreviewLoading || isTriggerLoading}
                block
              >
                {isPreviewLoading ? 'Generating Preview...' : 'Preview'}
              </Button>
            </Col>
            <Col span={12}>
              <Button
                type="primary"
                danger
                icon={isTriggerLoading ? <LoadingOutlined /> : <PlayCircleOutlined />}
                onClick={handleTrigger}
                disabled={!selectedTemplate || isPreviewLoading || isTriggerLoading}
                block
              >
                {isTriggerLoading ? 'Triggering...' : 'TRIGGER CG'}
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Context Info */}
        {(eventId || segmentId) && (
          <Card size="small" title="Context">
            <div className="text-sm space-y-1">
              {eventId && <div><strong>Event ID:</strong> {eventId}</div>}
              {segmentId && <div><strong>Segment ID:</strong> {segmentId}</div>}
            </div>
          </Card>
        )}
      </div>
    </Modal>
  );
}
