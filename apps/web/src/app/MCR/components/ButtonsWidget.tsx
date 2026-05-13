'use client';

import React from 'react';
import { Button, App, Space } from 'antd';
import { EyeOutlined, EditOutlined, EnvironmentOutlined } from '@ant-design/icons';

export default function ButtonsWidget() {
  const { message } = App.useApp();

  const handleOpenViewBoard = () => {
    window.open('/MCR/view-board', '_blank');
  };

  const handleOpenEditBoard = () => {
    window.open('/MCR/edit-board', '_blank');
  };

  const handleOpenMCRMap = () => {
    message.info('MCR MAP - יבוצע בהמשך');
  };

  return (
    <div className="h-full bg-white rounded-lg shadow-lg p-4 flex items-center justify-center">
      <Space size="middle">
        <Button
          type="primary"
          size="large"
          icon={<EyeOutlined />}
          onClick={handleOpenViewBoard}
        >
          לוח פעילויות צפייה
        </Button>
        <Button
          type="primary"
          size="large"
          icon={<EditOutlined />}
          onClick={handleOpenEditBoard}
          style={{ backgroundColor: '#22c55e', borderColor: '#22c55e' }}
        >
          לוח פעילויות עריכה
        </Button>
        <Button
          size="large"
          icon={<EnvironmentOutlined />}
          onClick={handleOpenMCRMap}
          style={{ backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', color: 'white' }}
        >
          MCR MAP
        </Button>
      </Space>
    </div>
  );
}
