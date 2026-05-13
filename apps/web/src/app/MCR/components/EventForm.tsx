'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Select, Button, Upload, DatePicker, InputNumber, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { MCREvent, BroadcastType } from '../types';
import RichTextEditor from './RichTextEditor';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface EventFormProps {
  event: MCREvent;
  onClose: () => void;
  onSave: (event: MCREvent) => void;
}

const broadcastTypes: BroadcastType[] = [
  'SRT_CALLER', 'SRT_LISTENER', 'DVBS2', 'DVBS2X', 'NS4', 'NS3',
  'RTMP', 'ZIXI', 'PRT', 'LIVEU', 'KLITA_MOU', 'OTHER',
];

const broadcastTypeLabels: Record<BroadcastType, string> = {
  'SRT_CALLER': 'SRT CALLER', 'SRT_LISTENER': 'SRT LISTENER',
  'DVBS2': 'DVBS2', 'DVBS2X': 'DVBS2X', 'NS4': 'NS4', 'NS3': 'NS3',
  'RTMP': 'RTMP', 'ZIXI': 'ZIXI', 'PRT': 'PRT', 'LIVEU': 'LIVEU',
  'KLITA_MOU': 'קליטה מOU', 'OTHER': 'OTHER',
};

const broadcastTypeColors: Record<string, string> = {
  'SRT_CALLER': '#7ca13d', 'SRT_LISTENER': '#a8cc6a', 'DVBS2': '#ed80e8',
  'DVBS2X': '#54b0c7', 'NS3': '#1b943b', 'NS4': '#1b943b', 'RTMP': '#d46eab',
  'ZIXI': '#ff6b6b', 'LIVEU': '#e8ca92', 'PRT': '#c2e8ed', 'KLITA_MOU': '#b135de',
  'OTHER': '#e31464',
};

export default function EventForm({ event, onClose, onSave }: EventFormProps) {
  const [formData, setFormData] = useState<MCREvent>(event);

  const handleSubmit = () => {
    onSave(formData);
  };

  const handleFileUpload = (file: File) => {
    setFormData({
      ...formData,
      details: { ...formData.details, fileContent: file.name },
    });
    return false;
  };

  const bgColor = formData.broadcastType
    ? `${broadcastTypeColors[formData.broadcastType]}20`
    : undefined;

  const renderBroadcastTypeForm = () => {
    switch (formData.broadcastType) {
      case 'SRT_CALLER':
      case 'SRT_LISTENER': {
        const label = formData.broadcastType === 'SRT_CALLER' ? 'CALLER' : 'LISTENER';
        return (
          <div className="space-y-3 p-4 rounded" style={{ backgroundColor: bgColor }}>
            <Input
              placeholder={`${label} IP *`}
              value={formData.details?.ip || ''}
              onChange={(e) => setFormData({ ...formData, details: { ...formData.details, ip: e.target.value } })}
            />
            <Input
              placeholder={`${label} PORT *`}
              value={formData.details?.port || ''}
              onChange={(e) => setFormData({ ...formData, details: { ...formData.details, port: e.target.value } })}
            />
            <Input
              placeholder="PASSPHRASE"
              value={formData.details?.passphrase || ''}
              onChange={(e) => setFormData({ ...formData, details: { ...formData.details, passphrase: e.target.value } })}
            />
            <Input
              placeholder="איש קשר *"
              value={formData.details?.contact || ''}
              onChange={(e) => setFormData({ ...formData, details: { ...formData.details, contact: e.target.value } })}
            />
            <TextArea
              placeholder="הערות"
              rows={3}
              value={formData.details?.notes || ''}
              onChange={(e) => setFormData({ ...formData, details: { ...formData.details, notes: e.target.value } })}
            />
          </div>
        );
      }

      case 'DVBS2':
      case 'DVBS2X':
      case 'NS3':
      case 'NS4':
      case 'KLITA_MOU':
        return (
          <div className="space-y-3 p-4 rounded" style={{ backgroundColor: bgColor }}>
            <Upload beforeUpload={handleFileUpload} maxCount={1} accept="*">
              <Button icon={<UploadOutlined />}>העלה מערך לוויני</Button>
            </Upload>
            <RichTextEditor
              value={formData.details?.satelliteConfig || ''}
              onChange={(value) => setFormData({ ...formData, details: { ...formData.details, satelliteConfig: value } })}
              placeholder="הזן פרטים או גרור קובץ לכאן..."
            />
          </div>
        );

      case 'RTMP':
      case 'OTHER':
        return (
          <div className="p-4 rounded" style={{ backgroundColor: bgColor }}>
            <RichTextEditor
              value={formData.details?.fileContent || ''}
              onChange={(value) => setFormData({ ...formData, details: { ...formData.details, fileContent: value } })}
              placeholder="הזן פרטים או גרור קובץ לכאן..."
            />
          </div>
        );

      case 'LIVEU':
        return (
          <div className="p-4 rounded" style={{ backgroundColor: bgColor }}>
            <Form.Item label="כמות מצלמות">
              <InputNumber
                min={1}
                value={formData.details?.cameraCount || 1}
                onChange={(val) => setFormData({ ...formData, details: { ...formData.details, cameraCount: val || 1 } })}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>
        );

      case 'ZIXI':
      case 'PRT':
        return (
          <div className="p-4 rounded text-gray-500" style={{ backgroundColor: bgColor }}>
            אין צורך בטופס נוסף
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      title="עריכת אירוע"
      open={true}
      onCancel={onClose}
      width={700}
      footer={[
        <Button key="cancel" onClick={onClose}>ביטול</Button>,
        <Button key="save" type="primary" onClick={handleSubmit}>שמור</Button>,
      ]}
    >
      <Form layout="vertical" dir="rtl">
        <Form.Item label="שם האירוע" required>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="שם האירוע"
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item label="תאריך התחלה" required>
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              value={formData.start ? dayjs(formData.start) : undefined}
              onChange={(d) => setFormData({ ...formData, start: d ? d.toDate() : formData.start })}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="תאריך סיום" required>
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              value={formData.end ? dayjs(formData.end) : undefined}
              onChange={(d) => setFormData({ ...formData, end: d ? d.toDate() : formData.end })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>

        <Form.Item label="סוג שידור">
          <Select
            value={formData.broadcastType || undefined}
            onChange={(val) => setFormData({ ...formData, broadcastType: val as BroadcastType })}
            placeholder="בחר סוג שידור"
            allowClear
            options={broadcastTypes.map(t => ({ value: t, label: broadcastTypeLabels[t] }))}
          />
        </Form.Item>

        {formData.broadcastType && renderBroadcastTypeForm()}
      </Form>
    </Modal>
  );
}
