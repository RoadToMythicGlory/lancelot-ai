'use client';

import React, { useState } from 'react';
import { 
  Card, 
  Button, 
  Space, 
  Tabs, 
  Row, 
  Col, 
  Statistic, 
  List, 
  Tag,
  Avatar,
  Alert
} from 'antd';
import { useQuery } from '@apollo/client';
import { GET_VIZRT_CONFIGS, GET_VIZRT_TEMPLATES } from '../../graphql/vizrt-queries';
import VizrtConfigPanel from './VizrtConfigPanel';
import CGTemplateManager from './CGTemplateManager';
import CGControlPanel from './CGControlPanel';
import {
  SettingOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';



interface VizrtDashboardProps {
  eventId?: string;
  segmentId?: string;
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

export default function VizrtDashboard({ eventId, segmentId }: VizrtDashboardProps) {
  const [configPanelVisible, setConfigPanelVisible] = useState(false);
  const [templateManagerVisible, setTemplateManagerVisible] = useState(false);
  const [cgControlVisible, setCgControlVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>();

  const { data: configsData, loading: configsLoading, error: configsError } = useQuery(GET_VIZRT_CONFIGS, {
    errorPolicy: 'all'
  });
  const { data: templatesData, loading: templatesLoading, error: templatesError } = useQuery(GET_VIZRT_TEMPLATES, {
    errorPolicy: 'all'
  });

  const activeConfigs = configsData?.vizrtConfigs?.filter((config: any) => config.isActive) || [];
  const templates = templatesData?.vizrtTemplates || [];

  const getTemplateCounts = () => {
    const counts: Record<string, number> = {};
    TEMPLATE_CATEGORIES.forEach(cat => {
      counts[cat.value] = templates.filter((t: any) => t.category === cat.value).length;
    });
    return counts;
  };

  const getCategoryColor = (category: string) => {
    return TEMPLATE_CATEGORIES.find(cat => cat.value === category)?.color || 'default';
  };

  const getCategoryLabel = (category: string) => {
    return TEMPLATE_CATEGORIES.find(cat => cat.value === category)?.label || category;
  };

  const handleQuickTrigger = (templateId: string) => {
    setSelectedTemplate(templateId);
    setCgControlVisible(true);
  };

  const templateCounts = getTemplateCounts();

  // Show setup message if backend isn't ready
  if (configsError || templatesError) {
    return (
      <div className="p-6">
        <Alert
          message="Vizrt Integration Setup Required"
          description={
            <div className="space-y-2">
              <p>The Vizrt graphics integration backend needs to be set up. Please ensure:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Backend GraphQL schema includes Vizrt types</li>
                <li>Vizrt resolvers are registered</li>
                <li>MongoDB models are imported</li>
                <li>Backend server is running</li>
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Error: {configsError?.message || templatesError?.message}
              </p>
            </div>
          }
          type="warning"
          showIcon
          closable
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vizrt Graphics Control</h1>
          <p className="text-gray-600">Manage configurations, templates, and trigger graphics</p>
        </div>
        <Space>
          <Button 
            icon={<SettingOutlined />}
            onClick={() => setConfigPanelVisible(true)}
          >
            Configurations
          </Button>
          <Button 
            icon={<DatabaseOutlined />}
            onClick={() => setTemplateManagerVisible(true)}
          >
            Templates
          </Button>
          <Button 
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => setCgControlVisible(true)}
          >
            Trigger CG
          </Button>
        </Space>
      </div>

      {/* Status Overview */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Configurations"
              value={activeConfigs.length}
              prefix={<SettingOutlined />}
              valueStyle={{ color: activeConfigs.length > 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Templates"
              value={templates.length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Ready to Trigger"
              value={activeConfigs.length > 0 && templates.length > 0 ? 'YES' : 'NO'}
              prefix={
                activeConfigs.length > 0 && templates.length > 0 ? 
                <CheckCircleOutlined /> : 
                <ExclamationCircleOutlined />
              }
              valueStyle={{ 
                color: activeConfigs.length > 0 && templates.length > 0 ? '#3f8600' : '#cf1322' 
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Most Used Category"
              value={
                Object.entries(templateCounts).reduce((a, b) => 
                  templateCounts[a[0]] > templateCounts[b[0]] ? a : b
                )?.[0] ? getCategoryLabel(Object.entries(templateCounts).reduce((a, b) => 
                  templateCounts[a[0]] > templateCounts[b[0]] ? a : b
                )[0]) : 'None'
              }
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Content Tabs */}
      <Card>
        <Tabs 
          defaultActiveKey="overview"
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <Row gutter={16}>
                  {/* Active Configurations */}
                  <Col span={12}>
                    <Card 
                      title="Active Configurations" 
                      size="small"
                      extra={
                        <Button 
                          size="small" 
                          icon={<SettingOutlined />}
                          onClick={() => setConfigPanelVisible(true)}
                        >
                          Manage
                        </Button>
                      }
                    >
                      {configsLoading ? (
                        <div>Loading...</div>
                      ) : activeConfigs.length > 0 ? (
                        <List
                          size="small"
                          dataSource={activeConfigs}
                          renderItem={(config: any) => (
                            <List.Item>
                              <List.Item.Meta
                                avatar={<Avatar icon={<SettingOutlined />} />}
                                title={config.name}
                                description={
                                  <div>
                                    <Tag color="blue">{config.mode}</Tag>
                                    <span className="text-xs text-gray-500">{config.baseUrl}</span>
                                  </div>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Alert
                          message="No active configurations"
                          description="Create a Vizrt configuration to start triggering graphics"
                          type="warning"
                          showIcon
                        />
                      )}
                    </Card>
                  </Col>

                  {/* Template Categories */}
                  <Col span={12}>
                    <Card 
                      title="Template Categories" 
                      size="small"
                      extra={
                        <Button 
                          size="small" 
                          icon={<DatabaseOutlined />}
                          onClick={() => setTemplateManagerVisible(true)}
                        >
                          Manage
                        </Button>
                      }
                    >
                      <Row gutter={[8, 8]}>
                        {TEMPLATE_CATEGORIES.map(category => (
                          <Col span={8} key={category.value}>
                            <Card size="small" className="text-center">
                              <div className="text-lg font-bold">
                                {templateCounts[category.value] || 0}
                              </div>
                              <Tag color={category.color} size="small">
                                {category.label}
                              </Tag>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                    </Card>
                  </Col>
                </Row>
              )
            },
            {
              key: 'templates',
              label: 'Quick Templates',
              children: (
                <Row gutter={16}>
                  {templatesLoading ? (
                    <Col span={24}>
                      <div className="text-center py-8">Loading templates...</div>
                    </Col>
                  ) : templates.length > 0 ? (
                    templates.slice(0, 12).map((template: any) => (
                      <Col span={6} key={template.id} className="mb-4">
                        <Card 
                          size="small"
                          title={template.name}
                          extra={
                            <Tag color={getCategoryColor(template.category)} size="small">
                              {getCategoryLabel(template.category)}
                            </Tag>
                          }
                          actions={[
                            <Button 
                              key="preview"
                              type="link" 
                              icon={<EyeOutlined />} 
                              size="small"
                              disabled={!template.previewUrl}
                              onClick={() => template.previewUrl && window.open(template.previewUrl, '_blank')}
                            >
                              Preview
                            </Button>,
                            <Button 
                              key="trigger"
                              type="link" 
                              icon={<PlayCircleOutlined />} 
                              size="small"
                              onClick={() => handleQuickTrigger(template.id)}
                            >
                              Trigger
                            </Button>
                          ]}
                        >
                          <div className="text-sm text-gray-600 mb-2">
                            {template.description || 'No description'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {template.fields.length} field{template.fields.length !== 1 ? 's' : ''}
                          </div>
                        </Card>
                      </Col>
                    ))
                  ) : (
                    <Col span={24}>
                      <Alert
                        message="No templates available"
                        description="Create CG templates to enable graphics triggering"
                        type="info"
                        showIcon
                      />
                    </Col>
                  )}
                </Row>
              )
            }
          ]}
        />
      </Card>

      {/* Modals */}
      <VizrtConfigPanel
        visible={configPanelVisible}
        onClose={() => setConfigPanelVisible(false)}
      />

      <CGTemplateManager
        visible={templateManagerVisible}
        onClose={() => setTemplateManagerVisible(false)}
      />

      <CGControlPanel
        visible={cgControlVisible}
        onClose={() => {
          setCgControlVisible(false);
          setSelectedTemplate(undefined);
        }}
        eventId={eventId}
        segmentId={segmentId}
        initialTemplate={selectedTemplate}
      />
    </div>
  );
}
