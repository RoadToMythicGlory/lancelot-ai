'use client';

import React from 'react';
import { Button, Space, Tag, Tooltip, Typography, Popconfirm } from 'antd';
import {
  DownOutlined, RightOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDroppable } from '@dnd-kit/core';
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TAG_COLOR,
  getAssignmentStatus,
  getAssignmentStatusRowBackground,
  getExternalBroadcastCompletionStatus,
  readExternalBroadcastData,
  COMPLETION_STATUS_COLORS,
  COMPLETION_STATUS_LABEL,
} from '@/utils/externalBroadcastDomain';
import { EventEditorPanel, EditorApi, Preset } from './EventEditorPanel';

const { Text } = Typography;

export interface BroadcastEventRowProps {
  event: any;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUnimport: (eventId: string) => void;
  canManage: boolean;
  // EventEditorPanel passthrough
  presets: Preset[];
  venues: any[];
  pickerEquipment: any[];
  pickerEquipmentById: Map<string, any>;
  groupedPickerOptions: any[];
  pickerLoading: boolean;
  refetchPicker: () => Promise<any>;
  employeesByRole: Record<string, any[]>;
  allEmployees: any[];
  getEmployeesForRole: (roleKey: string) => any[];
  categoryLabelOf: (slug: string) => string;
  equipmentCategoryOptions: any[];
  onSaved: () => void;
  onPresetsChanged: () => void;
  registerEditor: (eventId: string, api: EditorApi | null) => void;
}

export const BroadcastEventRow: React.FC<BroadcastEventRowProps> = (props) => {
  const { event: ev, index, expanded, onToggle, onUnimport, canManage } = props;

  // Each row is a drop target for crew chips dragged from other events.
  const { setNodeRef, isOver, active } = useDroppable({
    id: `row:${ev.id}`,
    data: { type: 'event-row', eventId: ev.id },
  });

  const status = getAssignmentStatus(ev);
  const bg = getAssignmentStatusRowBackground(status);
  const completion = getExternalBroadcastCompletionStatus(ev);
  const cd = readExternalBroadcastData(ev);

  // Highlight the row when a crew chip from a DIFFERENT event hovers over it.
  const draggedFromOther =
    active?.data?.current?.type === 'crew' &&
    active?.data?.current?.eventId !== ev.id;
  const dropActive = isOver && draggedFromOther;

  return (
    <div
      ref={setNodeRef}
      style={{
        borderBottom: '1px solid #f0f0f0',
        background: dropActive
          ? '#bae7ff'
          : bg || (index % 2 === 0 ? '#fafafa' : '#ffffff'),
        outline: dropActive ? '2px dashed #1890ff' : undefined,
        transition: 'background 0.15s ease',
      }}
    >
      {/* Summary row (click to expand/collapse) */}
      <div
        onClick={onToggle}
        style={{
          padding: '14px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: '#999' }}>
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <div style={{ minWidth: 70 }}>
          <Text strong style={{ fontSize: 18 }}>{dayjs(ev.startTime).format('HH:mm')}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{dayjs(ev.startTime).format('DD/MM')}</div>
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {ev.homeTeam && ev.awayTeam ? `${ev.homeTeam} נגד ${ev.awayTeam}` : ev.title || 'ללא כותרת'}
          </div>
          {ev.league && (
            <Text type="secondary" style={{ fontSize: 12 }}>{ev.league}{ev.stage ? ` • ${ev.stage}` : ''}</Text>
          )}
        </div>
        {ev.channel && <Tag color="blue" style={{ marginInlineEnd: 0 }}>{ev.channel}</Tag>}
        <Tag color={ASSIGNMENT_STATUS_TAG_COLOR[status]}>{ASSIGNMENT_STATUS_LABEL[status]}</Tag>
        <Tooltip title={COMPLETION_STATUS_LABEL[completion]}>
          <Tag style={{ backgroundColor: COMPLETION_STATUS_COLORS[completion].bg, color: COMPLETION_STATUS_COLORS[completion].text, borderColor: COMPLETION_STATUS_COLORS[completion].border }}>
            {COMPLETION_STATUS_LABEL[completion]}
          </Tag>
        </Tooltip>
        {cd.isDoubleBroadcast && <Tag color="purple">שידור כפול</Tag>}
        {cd.nevionRequest?.unresolved && <Tag color="red">NEVION חסר</Tag>}
        {(cd.controlCheck?.required || cd.offtube?.required) && <Tag color="cyan">בקרה</Tag>}
        {canManage && (
          <Popconfirm
            title="להסיר את האירוע מרשימת שידורי חוץ?"
            description="הנתונים התפעוליים יישמרו ותוכל לייבא את האירוע שוב בעתיד."
            okText="הסר" cancelText="ביטול"
            onConfirm={(e) => { e?.stopPropagation(); onUnimport(ev.id); }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <Button type="text" size="small" icon={<MinusCircleOutlined />} title="הסר משידורי חוץ" onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        )}
      </div>

      {/* Inline editor */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
          <EventEditorPanel
            event={ev}
            canManage={canManage}
            presets={props.presets}
            venues={props.venues}
            pickerEquipment={props.pickerEquipment}
            pickerEquipmentById={props.pickerEquipmentById}
            groupedPickerOptions={props.groupedPickerOptions}
            pickerLoading={props.pickerLoading}
            refetchPicker={props.refetchPicker}
            employeesByRole={props.employeesByRole}
            allEmployees={props.allEmployees}
            getEmployeesForRole={props.getEmployeesForRole}
            categoryLabelOf={props.categoryLabelOf}
            equipmentCategoryOptions={props.equipmentCategoryOptions}
            onSaved={props.onSaved}
            onPresetsChanged={props.onPresetsChanged}
            registerEditor={props.registerEditor}
          />
        </div>
      )}
    </div>
  );
};
