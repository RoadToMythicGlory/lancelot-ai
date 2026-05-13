'use client';

import React, { useState } from 'react';
import { Card, Button, Form, Input, InputNumber, Modal, Table, Tag, Space, Empty, App, Popconfirm, Select, Descriptions } from 'antd';
import {
  PlusOutlined,
  EnvironmentOutlined,
  WifiOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_TRACKER_SITES, GET_TRACKER_GATEWAYS } from '../../../graphql/queries';
import { CREATE_TRACKER_SITE, UPDATE_TRACKER_SITE, CREATE_TRACKER_GATEWAY, UPDATE_TRACKER_GATEWAY_POSITION } from '../../../graphql/mutations';

const TrackerSiteAdmin: React.FC = () => {
  const { message } = App.useApp();
  const [isSiteModalVisible, setIsSiteModalVisible] = useState(false);
  const [isGatewayModalVisible, setIsGatewayModalVisible] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteForm] = Form.useForm();
  const [gatewayForm] = Form.useForm();

  const { data: sitesData, loading: sitesLoading, refetch: refetchSites } = useQuery(GET_TRACKER_SITES);
  const sites = sitesData?.trackerSites || [];

  const { data: gatewaysData, refetch: refetchGateways } = useQuery(GET_TRACKER_GATEWAYS, {
    variables: { siteId: selectedSiteId },
    skip: !selectedSiteId,
  });
  const gateways = gatewaysData?.trackerGateways || [];

  const [createSite, { loading: createSiteLoading }] = useMutation(CREATE_TRACKER_SITE);
  const [updateSite, { loading: updateSiteLoading }] = useMutation(UPDATE_TRACKER_SITE);
  const [createGateway, { loading: createGatewayLoading }] = useMutation(CREATE_TRACKER_GATEWAY);
  const [updateGatewayPosition] = useMutation(UPDATE_TRACKER_GATEWAY_POSITION);

  const handleCreateSite = async () => {
    try {
      const values = await siteForm.validateFields();
      const input: any = {
        name: values.name,
        widthMeters: values.widthMeters || 50,
        heightMeters: values.heightMeters || 30,
      };
      if (values.floorPlanImageUrl) input.floorPlanImageUrl = values.floorPlanImageUrl;
      if (values.geoAnchorLat != null) {
        input.geoAnchorLat = values.geoAnchorLat;
        input.geoAnchorLng = values.geoAnchorLng;
        input.geoAnchorRotationDeg = values.geoAnchorRotationDeg || 0;
      }

      if (editingSiteId) {
        await updateSite({ variables: { id: editingSiteId, input } });
        message.success('האתר עודכן');
      } else {
        await createSite({ variables: { input } });
        message.success('האתר נוצר');
      }
      siteForm.resetFields();
      setIsSiteModalVisible(false);
      setEditingSiteId(null);
      refetchSites();
    } catch (err: any) {
      message.error(err.message || 'שגיאה');
    }
  };

  const handleCreateGateway = async () => {
    try {
      const values = await gatewayForm.validateFields();
      const input: any = {
        gatewayKey: values.gatewayKey,
        name: values.name,
        kind: values.kind,
        siteId: values.kind === 'fixed' ? selectedSiteId : undefined,
        zoneName: values.zoneName || undefined,
        vehicleLabel: values.vehicleLabel || undefined,
      };
      if (values.positionX != null && values.positionY != null) {
        input.positionX = values.positionX;
        input.positionY = values.positionY;
      }
      await createGateway({ variables: { input } });
      message.success('הגייטוויי נוסף');
      gatewayForm.resetFields();
      setIsGatewayModalVisible(false);
      refetchGateways();
    } catch (err: any) {
      message.error(err.message || 'שגיאה');
    }
  };

  const siteColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'גודל (מ׳)',
      key: 'size',
      render: (_: any, r: any) => `${r.widthMeters} × ${r.heightMeters}`,
    },
    {
      title: 'גייטוויים',
      key: 'gateways',
      render: (_: any, r: any) => <Tag>{r.gateways?.length || 0}</Tag>,
    },
    {
      title: 'תמונת מפה',
      key: 'floorPlan',
      render: (_: any, r: any) => r.floorPlanImageUrl
        ? <Tag color="green">יש</Tag>
        : <Tag color="default">אין</Tag>,
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingSiteId(record.id);
              siteForm.setFieldsValue({
                name: record.name,
                widthMeters: record.widthMeters,
                heightMeters: record.heightMeters,
                floorPlanImageUrl: record.floorPlanImageUrl,
                geoAnchorLat: record.geoAnchor?.lat,
                geoAnchorLng: record.geoAnchor?.lng,
                geoAnchorRotationDeg: record.geoAnchor?.rotationDeg,
              });
              setIsSiteModalVisible(true);
            }}
          >
            ערוך
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => setSelectedSiteId(record.id)}
          >
            גייטוויים
          </Button>
        </Space>
      ),
    },
  ];

  const gatewayColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'סוג',
      dataIndex: 'kind',
      key: 'kind',
      render: (kind: string) => (
        <Tag color={kind === 'fixed' ? 'blue' : 'orange'}>
          {kind === 'fixed' ? 'קבוע' : 'נייד'}
        </Tag>
      ),
    },
    { title: 'אזור', dataIndex: 'zoneName', key: 'zoneName', render: (v: string) => v || '—' },
    { title: 'רכב', dataIndex: 'vehicleLabel', key: 'vehicleLabel', render: (v: string) => v || '—' },
    {
      title: 'מיקום (x, y)',
      key: 'position',
      render: (_: any, r: any) => r.position ? `${r.position.x}, ${r.position.y}` : '—',
    },
    {
      title: 'מקוון',
      key: 'online',
      render: (_: any, r: any) => (
        <Tag color={r.online ? 'green' : 'default'}>
          {r.online ? 'מחובר' : 'לא מחובר'}
        </Tag>
      ),
    },
    {
      title: 'מפתח',
      dataIndex: 'gatewayKey',
      key: 'gatewayKey',
      render: (v: string) => <code style={{ fontSize: 10 }}>{v}</code>,
    },
  ];

  return (
    <div>
      {/* Sites section */}
      <Card
        title={
          <Space>
            <EnvironmentOutlined />
            אתרים (מחסנים / סטודיות)
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingSiteId(null);
              siteForm.resetFields();
              setIsSiteModalVisible(true);
            }}
          >
            הוסף אתר
          </Button>
        }
        className="mb-4"
      >
        {sites.length === 0 ? (
          <Empty description="לא הוגדרו אתרים. הוסף אתר כדי להתחיל מעקב מקורות." />
        ) : (
          <Table
            dataSource={sites}
            columns={siteColumns}
            rowKey="id"
            loading={sitesLoading}
            pagination={false}
            size="small"
          />
        )}
      </Card>

      {/* Gateways section (visible after selecting a site) */}
      {selectedSiteId && (
        <Card
          title={
            <Space>
              <WifiOutlined />
              גייטוויים — {sites.find((s: any) => s.id === selectedSiteId)?.name || ''}
            </Space>
          }
          extra={
            <Space>
              <Button onClick={() => setSelectedSiteId(null)}>חזור</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  gatewayForm.resetFields();
                  gatewayForm.setFieldsValue({ kind: 'fixed' });
                  setIsGatewayModalVisible(true);
                }}
              >
                הוסף גייטוויי
              </Button>
            </Space>
          }
        >
          {gateways.length === 0 ? (
            <Empty description="אין גייטוויים רשומים לאתר זה." />
          ) : (
            <Table
              dataSource={gateways}
              columns={gatewayColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          )}
        </Card>
      )}

      {/* Site create/edit modal */}
      <Modal
        title={editingSiteId ? 'עריכת אתר' : 'הוספת אתר חדש'}
        open={isSiteModalVisible}
        onCancel={() => { setIsSiteModalVisible(false); setEditingSiteId(null); }}
        onOk={handleCreateSite}
        confirmLoading={createSiteLoading || updateSiteLoading}
        okText={editingSiteId ? 'עדכן' : 'צור'}
      >
        <Form form={siteForm} layout="vertical">
          <Form.Item name="name" label="שם האתר" rules={[{ required: true, message: 'שדה חובה' }]}>
            <Input placeholder="מחסן ראשי / סטודיו A" />
          </Form.Item>
          <Form.Item name="floorPlanImageUrl" label="URL תמונת מפת קומה">
            <Input placeholder="https://..." />
          </Form.Item>
          <Space>
            <Form.Item name="widthMeters" label="רוחב (מטרים)" initialValue={50}>
              <InputNumber min={1} max={500} />
            </Form.Item>
            <Form.Item name="heightMeters" label="אורך (מטרים)" initialValue={30}>
              <InputNumber min={1} max={500} />
            </Form.Item>
          </Space>
          <div className="text-sm text-gray-500 mb-2">עוגן גאוגרפי (אופציונלי — לשיכוב על מפה)</div>
          <Space>
            <Form.Item name="geoAnchorLat" label="Lat">
              <InputNumber step={0.0001} style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="geoAnchorLng" label="Lng">
              <InputNumber step={0.0001} style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="geoAnchorRotationDeg" label="סיבוב (°)">
              <InputNumber min={0} max={360} style={{ width: 90 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Gateway create modal */}
      <Modal
        title="הוספת גייטוויי"
        open={isGatewayModalVisible}
        onCancel={() => setIsGatewayModalVisible(false)}
        onOk={handleCreateGateway}
        confirmLoading={createGatewayLoading}
        okText="צור"
      >
        <Form form={gatewayForm} layout="vertical">
          <Form.Item name="gatewayKey" label="מפתח גייטוויי (API Key)" rules={[{ required: true }]}
            extra="מזהה ייחודי שישמש לאימות מול ה-MQTT broker / HTTP endpoint"
          >
            <Input placeholder="gw-warehouse-01" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="name" label="שם" rules={[{ required: true }]}>
            <Input placeholder="גייטוויי מחסן - כניסה" />
          </Form.Item>
          <Form.Item name="kind" label="סוג" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'קבוע (Fixed)', value: 'fixed' },
                { label: 'נייד (Mobile)', value: 'mobile' },
              ]}
            />
          </Form.Item>
          <Form.Item name="zoneName" label="שם אזור">
            <Input placeholder="כניסה / מדף A / סטודיו 2" />
          </Form.Item>
          <Form.Item name="vehicleLabel" label="תווית רכב (לנייד בלבד)">
            <Input placeholder="LM-7423" />
          </Form.Item>
          <div className="text-sm text-gray-500 mb-2">מיקום על המפה (מטרים)</div>
          <Space>
            <Form.Item name="positionX" label="X">
              <InputNumber min={0} step={0.5} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="positionY" label="Y">
              <InputNumber min={0} step={0.5} style={{ width: 100 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default TrackerSiteAdmin;
