'use client';

import React, { useState } from 'react';
import { Modal, Button, Form, Input, Select, Switch, Table, Space, message, Popconfirm, Tag } from 'antd';
import { useMutation, useQuery } from '@apollo/client';
import { 
  GET_VIZRT_CONFIGS, 
  CREATE_VIZRT_CONFIG, 
  UPDATE_VIZRT_CONFIG, 
  DELETE_VIZRT_CONFIG 
} from '../../graphql/vizrt-queries';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';

const { Option } = Select;

interface VizrtConfig {
  id: string;
  name: string;
  mode: 'ARC' | 'PDS' | 'ENGINE';
  baseUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VizrtConfigPanelProps {
  visible: boolean;
  onClose: () => void;
}

export default function VizrtConfigPanel({ visible, onClose }: VizrtConfigPanelProps) {
  const [form] = Form.useForm();
  const [editingConfig, setEditingConfig] = useState<VizrtConfig | null>(null);
  const [configModalVisible, setConfigModalVisible] = useState(false);

  const { data, loading, refetch } = useQuery(GET_VIZRT_CONFIGS);
  const [createConfig] = useMutation(CREATE_VIZRT_CONFIG);
  const [updateConfig] = useMutation(UPDATE_VIZRT_CONFIG);
  const [deleteConfig] = useMutation(DELETE_VIZRT_CONFIG);

  const handleCreateConfig = () => {
    setEditingConfig(null);
    form.resetFields();
    setConfigModalVisible(true);
  };

  const handleEditConfig = (config: VizrtConfig) => {
    setEditingConfig(config);
    form.setFieldsValue({
      name: config.name,
      mode: config.mode,
      baseUrl: config.baseUrl
    });
    setConfigModalVisible(true);
  };

  const handleSaveConfig = async (values: any) => {
    try {
      if (editingConfig) {
        await updateConfig({
          variables: {
            id: editingConfig.id,
            input: values
          }
        });
        message.success('Vizrt configuration updated successfully');
      } else {
        await createConfig({
          variables: {
            input: values
          }
        });
        message.success('Vizrt configuration created successfully');
      }
      
      setConfigModalVisible(false);
      refetch();
    } catch (error: any) {
      message.error(`Error saving configuration: ${error.message}`);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    try {
      await deleteConfig({
        variables: { id }
      });
      message.success('Vizrt configuration deleted successfully');
      refetch();
    } catch (error: any) {
      message.error(`Error deleting configuration: ${error.message}`);
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'ARC': return 'blue';
      case 'PDS': return 'green';
      case 'ENGINE': return 'orange';
      default: return 'default';
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Mode',
      dataIndex: 'mode',
      key: 'mode',
      render: (mode: string) => <Tag color={getModeColor(mode)}>{mode}</Tag>
    },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? 'Active' : 'Inactive'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: VizrtConfig) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEditConfig(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this configuration?"
            onConfirm={() => handleDeleteConfig(record.id)}
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
            <span>Vizrt Configuration</span>
          </div>
        }
        open={visible}
        onCancel={onClose}
        width={800}
        footer={null}
        destroyOnHidden
      >
        <div className="mb-4">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateConfig}
          >
            Add Configuration
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={data?.vizrtConfigs || []}
          loading={loading}
          rowKey="id"
          pagination={false}
        />
      </Modal>

      <Modal
        title={editingConfig ? 'Edit Configuration' : 'Create Configuration'}
        open={configModalVisible}
        onCancel={() => setConfigModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveConfig}
        >
          <Form.Item
            name="name"
            label="Configuration Name"
            rules={[{ required: true, message: 'Please enter configuration name' }]}
          >
            <Input placeholder="e.g., Main Studio Vizrt" />
          </Form.Item>

          <Form.Item
            name="mode"
            label="Vizrt Mode"
            rules={[{ required: true, message: 'Please select Vizrt mode' }]}
          >
            <Select placeholder="Select mode">
              <Option value="ARC">Viz Arc (Actions)</Option>
              <Option value="PDS">Pilot Data Server (Templates)</Option>
              <Option value="ENGINE">Viz Engine (Direct)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[
              { required: true, message: 'Please enter base URL' },
              { type: 'url', message: 'Please enter a valid URL' }
            ]}
          >
            <Input placeholder="http://vizrt-server:port" />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key (Optional)"
          >
            <Input.Password placeholder="Bearer token or API key" />
          </Form.Item>

          <Form.Item
            name="headers"
            label="Additional Headers (Optional)"
          >
            <Input.TextArea 
              placeholder='{"Custom-Header": "value"}'
              rows={3}
            />
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfigModalVisible(false)}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit">
              {editingConfig ? 'Update' : 'Create'}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
