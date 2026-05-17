'use client';

import React, { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tooltip, Typography } from 'antd';
import {
  CloseOutlined,
  HolderOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import {
  ALL_COLUMNS_BY_KEY,
  COLUMN_GROUPS,
  compareColumnKeys,
} from '../constants';

const { Text } = Typography;

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

function columnLabel(key: string): string {
  return ALL_COLUMNS_BY_KEY[key]?.label || (key.startsWith('raw.') ? key.slice(4) : key);
}

function groupForKey(key: string): string {
  for (const g of COLUMN_GROUPS) {
    if (g.columns.some((c) => c.key === key)) return g.label;
  }
  return '';
}

const SortableColumnChip: React.FC<{
  id: string;
  label: string;
  group: string;
  onRemove: () => void;
}> = ({ id, label, group, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : 'auto',
  };

  // The whole chip is the drag handle so users can grab from anywhere on it.
  // The grip icon is just a visual hint. The remove button stops pointer
  // events so clicking it doesn't initiate a drag.
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flight-board-column-chip"
      {...attributes}
      {...listeners}
    >
      <span className="flight-board-column-chip-handle" aria-hidden="true">
        <HolderOutlined />
      </span>
      <span className="flight-board-column-chip-label">
        {label}
        {group ? (
          <span
            className="flight-board-column-chip-group"
            style={{ fontSize: 11, marginInlineStart: 6, color: '#94a3b8' }}
          >
            · {group}
          </span>
        ) : null}
      </span>
      <Button
        type="text"
        size="small"
        icon={<CloseOutlined />}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="הסר עמודה"
      />
    </div>
  );
};

export const ColumnOrderEditor: React.FC<Props> = ({ selected, onChange }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => selected.slice(), [selected]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(ids, oldIndex, newIndex));
  };

  if (selected.length === 0) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        עוד לא נבחרו עמודות. סמן עמודות בקבוצות שלמעלה כדי להוסיף אותן.
      </Text>
    );
  }

  const removeAt = (index: number) => {
    const next = selected.slice();
    next.splice(index, 1);
    onChange(next);
  };

  const sortByCatalog = () => {
    const next = selected.slice().sort(compareColumnKeys);
    onChange(next);
  };

  const reverse = () => {
    onChange(selected.slice().reverse());
  };

  return (
    <div className="flight-board-column-order">
      <div className="flight-board-column-order-toolbar">
        <Text type="secondary" style={{ fontSize: 12 }}>
          גרור כל עמודה למיקום חדש כדי לשנות את הסדר. הסדר נשמר עם הלוח.
        </Text>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <Tooltip title="מיון אוטומטי לפי הקבוצות">
            <Button size="small" icon={<ArrowDownOutlined />} onClick={sortByCatalog}>
              סדר אוטומטי
            </Button>
          </Tooltip>
          <Tooltip title="היפוך סדר">
            <Button size="small" icon={<ArrowUpOutlined />} onClick={reverse}>
              הפוך
            </Button>
          </Tooltip>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="flight-board-column-chip-list">
            {ids.map((key, idx) => (
              <SortableColumnChip
                key={key}
                id={key}
                label={columnLabel(key)}
                group={groupForKey(key)}
                onRemove={() => removeAt(idx)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
