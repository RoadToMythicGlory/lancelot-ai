'use client';

import React, { useState } from 'react';
import { 
  Modal, 
  Button, 
  Form, 
  Input, 
  Select, 
  Switch, 
  Table, 
  Space, 
  message, 
  Popconfirm, 
  Tag,
  Card,
  Divider,
  Row,
  Col
} from 'antd';
import { useMutation, useQuery } from '@apollo/client';
import { 
  GET_VIZRT_TEMPLATES, 
  CREATE_VIZRT_TEMPLATE, 
  UPDATE_VIZRT_TEMPLATE, 
  DELETE_VIZRT_TEMPLATE 
} from '../../graphql/vizrt-queries';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  EyeOutlined,
  SettingOutlined,
  MinusCircleOutlined
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
  createdAt: string;
  updatedAt: string;
}

interface CGTemplateManagerProps {
  visible: boolean;
  onClose: () => void;
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

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'BOOLEAN', label: 'Boolean' },
  { value: 'SELECT', label: 'Select (Dropdown)' },
  { value: 'COLOR', label: 'Color' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' }
];

export default function CGTemplateManager({ visible, onClose }: CGTemplateManagerProps) {
  const [form] = Form.useForm();
  const [editingTemplate, setEditingTemplate] = useState<VizrtTemplate | null>(null);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();

  const { data, loading, refetch } = useQuery(GET_VIZRT_TEMPLATES, {
    variables: { category: selectedCategory }
  });
  
  const [createTemplate] = useMutation(CREATE_VIZRT_TEMPLATE);
  const [updateTemplate] = useMutation(UPDATE_VIZRT_TEMPLATE);
  const [deleteTemplate] = useMutation(DELETE_VIZRT_TEMPLATE);

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({
      fields: [{ key: '', label: '', type: 'TEXT', required: false }]
    });
    setTemplateModalVisible(true);
  };

  const handleEditTemplate = (template: VizrtTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      description: template.description,
      category: template.category,
      fields: template.fields
    });
    setTemplateModalVisible(true);
  };

  const handleSaveTemplate = async (values: any) => {
    try {
      const input = {
        ...values,
        fields: values.fields.filter((field: any) => field.key && field.label)
      };

      if (editingTemplate) {
        await updateTemplate({
          variables: {
            id: editingTemplate.id,
            input
          }
        });
        message.success('CG template updated successfully');
      } else {
        await createTemplate({
          variables: {
            input
          }
        });
        message.success('CG template created successfully');
      }
      
      setTemplateModalVisible(false);
      refetch();
    } catch (error) {
      message.error(`Error saving template: ${error.message}`);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate({
        variables: { id }
      });
      message.success('CG template deleted successfully');
      refetch();
    } catch (error) {
      message.error(`Error deleting template: ${error.message}`);
    }
  };

  const getCategoryColor = (category: string) => {
    return TEMPLATE_CATEGORIES.find(cat => cat.value === category)?.color || 'default';
  };

  const getCategoryLabel = (category: string) => {
    return TEMPLATE_CATEGORIES.find(cat => cat.value === category)?.label || category;
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => (
        <Tag color={getCategoryColor(category)}>
          {getCategoryLabel(category)}
        </Tag>
      )
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Fields',
      dataIndex: 'fields',
      key: 'fields',
      render: (fields: VizrtTemplateField[]) => (
        <span>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: VizrtTemplate) => (
        <Space>
          {record.previewUrl && (
            <Button 
              type="link" 
              icon={<EyeOutlined />}
              onClick={() => window.open(record.previewUrl, '_blank')}
            >
              Preview
            </Button>
          )}
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEditTemplate(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this template?"
            onConfirm={() => handleDeleteTemplate(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button 
              type="link" 
              danger
              icon={<DeleteOutlined />}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <div className="flex items-center gap-2">
            <SettingOutlined />
            <span>CG Template Manager</span>
          </div>
        }
        open={visible}
        onCancel={onClose}
        width={1000}
        footer={null}
        destroyOnHidden
      >
        <Row gutter={16} className="mb-4">
          <Col span={12}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateTemplate}
            >
              Create Template
            </Button>
          </Col>
          <Col span={12}>
            <Select
              placeholder="Filter by category"
              allowClear
              style={{ width: '100%' }}
              onChange={setSelectedCategory}
            >
              {TEMPLATE_CATEGORIES.map(cat => (
                <Option key={cat.value} value={cat.value}>
                  {cat.label}
                </Option>
              ))}
            </Select>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={data?.vizrtTemplates || []}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>

      <Modal
        title={editingTemplate ? 'Edit CG Template' : 'Create CG Template'}
        open={templateModalVisible}
        onCancel={() => setTemplateModalVisible(false)}
        width={800}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveTemplate}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Template Name"
                rules={[{ required: true, message: 'Please enter template name' }]}
              >
                <Input placeholder="e.g., News Lower Third" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label="Category"
                rules={[{ required: true, message: 'Please select category' }]}
              >
                <Select placeholder="Select category">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <Option key={cat.value} value={cat.value}>
                      {cat.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea 
              placeholder="Template description..."
              rows={2}
            />
          </Form.Item>

          <Divider>Template Fields</Divider>

          <Form.List name="fields">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card key={key} size="small" className="mb-2">
                    <Row gutter={8} align="middle">
                      <Col span={5}>
                        <Form.Item
                          {...restField}
                          name={[name, 'key']}
                          rules={[{ required: true, message: 'Key required' }]}
                        >
                          <Input placeholder="Field key" />
                        </Form.Item>
                      </Col>
                      <Col span={5}>
                        <Form.Item
                          {...restField}
                          name={[name, 'label']}
                          rules={[{ required: true, message: 'Label required' }]}
                        >
                          <Input placeholder="Display label" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'type']}
                          rules={[{ required: true, message: 'Type required' }]}
                        >
                          <Select placeholder="Type">
                            {FIELD_TYPES.map(type => (
                              <Option key={type.value} value={type.value}>
                                {type.label}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'defaultValue']}
                        >
                          <Input placeholder="Default value" />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Form.Item
                          {...restField}
                          name={[name, 'required']}
                          valuePropName="checked"
                        >
                          <Switch size="small" />
                        </Form.Item>
                        <div className="text-xs text-gray-500">Required</div>
                      </Col>
                      <Col span={3}>
                        <Button
                          type="link"
                          danger
                          icon={<MinusCircleOutlined />}
                          onClick={() => remove(name)}
                        />
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add({ key: '', label: '', type: 'TEXT', required: false })}
                    block
                    icon={<PlusOutlined />}
                  >
                    Add Field
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={() => setTemplateModalVisible(false)}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit">
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
