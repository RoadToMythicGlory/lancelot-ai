'use client';

import React from 'react';
import { Button, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { FlightBoard } from '../types';

interface Props {
  boards: FlightBoard[];
  canManage: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export const BoardGallery: React.FC<Props> = ({ boards, canManage, onSelect, onCreate }) => {
  if (boards.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: 16,
          border: '1px solid rgba(148, 163, 184, 0.2)',
          textAlign: 'center',
        }}
      >
        <Empty
          description={<span style={{ color: '#cbd5e1' }}>אין לוחות עדיין</span>}
        />
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onCreate}
            style={{ marginTop: 16 }}
          >
            צור לוח ראשון
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flight-board-gallery">
      {boards.map((b) => (
        <div
          key={b.id}
          role="button"
          tabIndex={0}
          className="flight-board-card"
          onClick={() => onSelect(b.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onSelect(b.id);
            }
          }}
        >
          <div className="flight-board-card-title">
            <span>{b.title}</span>
            {b.isDefault && <span className="flight-board-default-pill">ברירת מחדל</span>}
          </div>
          {b.description && (
            <span style={{ color: '#94a3b8' }}>{b.description}</span>
          )}
          <div className="flight-board-card-meta">
            <span>{b.panels.length} פאנלים</span>
            <span>· רענון כל {b.refreshIntervalSec} שניות</span>
            <span>· {b.visibility === 'ADMINS_ONLY' ? 'מנהלים בלבד' : 'גלוי לכולם'}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
