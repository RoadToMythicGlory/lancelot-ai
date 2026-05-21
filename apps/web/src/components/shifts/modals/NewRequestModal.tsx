'use client';

import React, { useState } from 'react';
import { Modal, Tabs } from 'antd';
import VacationRequest from '@/components/shifts/VacationRequest';
import ShiftSwap from '@/components/shifts/ShiftSwap';

interface NewRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** Which tab to show first. Defaults to 'vacation'. */
  defaultTab?: 'vacation' | 'swap';
}

/**
 * Lightweight wrapper that lets the user start either a vacation request or a
 * shift swap request from anywhere in the shifts sub-app (Dashboard,
 * My Shifts, My Requests). Wraps the existing fully-featured Hebrew forms.
 */
export default function NewRequestModal({
  open,
  onClose,
  defaultTab = 'vacation',
}: NewRequestModalProps) {
  const [tab, setTab] = useState<'vacation' | 'swap'>(defaultTab);

  return (
    <Modal
      title="בקשה חדשה"
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as any)}
        items={[
          { key: 'vacation', label: 'בקשת חופשה', children: <VacationRequest /> },
          { key: 'swap', label: 'החלפת משמרת', children: <ShiftSwap /> },
        ]}
      />
    </Modal>
  );
}
