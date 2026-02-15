'use client';

import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import CGControlPanel from './CGControlPanel';
import VizrtDashboard from './VizrtDashboard';

interface VizrtIntegrationButtonProps {
  eventId?: string;
  segmentId?: string;
  templateId?: string;
  initialFields?: Record<string, any>;
  size?: 'small' | 'middle' | 'large';
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  variant?: 'trigger' | 'dashboard';
  children?: React.ReactNode;
}

/**
 * Simple integration button that can be dropped anywhere in the app
 * to provide Vizrt CG control capabilities without touching existing code
 */
export default function VizrtIntegrationButton({
  eventId,
  segmentId,
  templateId,
  initialFields,
  size = 'small',
  type = 'default',
  variant = 'trigger',
  children
}: VizrtIntegrationButtonProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const buttonProps = {
    size,
    type,
    icon: variant === 'trigger' ? <ThunderboltOutlined /> : <SettingOutlined />,
    onClick: () => setModalVisible(true)
  };

  return (
    <>
      {children ? (
        <div onClick={() => setModalVisible(true)} style={{ cursor: 'pointer' }}>
          {children}
        </div>
      ) : (
        <Tooltip title={variant === 'trigger' ? 'Trigger CG Graphics' : 'Open Vizrt Dashboard'}>
          <Button {...buttonProps}>
            {variant === 'trigger' ? 'CG' : 'Vizrt'}
          </Button>
        </Tooltip>
      )}

      {variant === 'trigger' ? (
        <CGControlPanel
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          eventId={eventId}
          segmentId={segmentId}
          initialTemplate={templateId}
          initialFields={initialFields}
        />
      ) : (
        <div 
          className={`fixed inset-0 z-[9999] ${modalVisible ? 'block' : 'hidden'}`}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div 
            className="absolute inset-4 bg-white rounded-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full overflow-auto">
              <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Vizrt Dashboard</h2>
                <Button onClick={() => setModalVisible(false)}>Close</Button>
              </div>
              <VizrtDashboard eventId={eventId} segmentId={segmentId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
