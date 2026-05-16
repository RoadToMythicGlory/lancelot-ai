'use client';

import React from 'react';
import { Button, Select, Space } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { FlightBoard } from '../types';

interface Props {
  boards: FlightBoard[];
  selectedId: string | null;
  canManage: boolean;
  onSelect: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreate: () => void;
}

export const BoardSelector: React.FC<Props> = ({
  boards,
  selectedId,
  canManage,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}) => {
  return (
    <Space wrap size="small">
      <Select
        style={{ minWidth: 240 }}
        size="middle"
        value={selectedId || undefined}
        onChange={(v) => onSelect(v || null)}
        placeholder="בחר לוח"
        options={boards.map((b) => ({
          value: b.id,
          label: b.isDefault ? `${b.title} (ברירת מחדל)` : b.title,
        }))}
        allowClear
      />
      {canManage && selectedId && (
        <>
          <Button icon={<EditOutlined />} onClick={onEdit}>
            ערוך
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
            מחק
          </Button>
        </>
      )}
      {canManage && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          לוח חדש
        </Button>
      )}
    </Space>
  );
};
