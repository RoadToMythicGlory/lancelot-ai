'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Modal, Tag, Tooltip, Card, Space, App } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { normalizeChannelToHebrew } from '../../config/channels';

// Excel-like cell interface
interface ExcelCell {
  value: any;
  formula?: string;
  type: 'text' | 'number' | 'date' | 'time' | 'datetime' | 'select' | 'boolean';
  options?: string[]; // For select type
  editable: boolean;
}

// Row data structure based on create event form
interface EventRow {
  id: string;
  startDate: ExcelCell;
  startTime: ExcelCell;
  endDate: ExcelCell;
  endTime: ExcelCell;
  koDate: ExcelCell;
  koTime: ExcelCell;
  sport: ExcelCell;
  league: ExcelCell;
  stage: ExcelCell;
  homeTeam: ExcelCell;
  awayTeam: ExcelCell;
  channel: ExcelCell;
  parallelChannel: ExcelCell;
  channel1_4k: ExcelCell;
  live: ExcelCell;
  subtitles: ExcelCell;
  notes: ExcelCell;
}

// Column definitions matching the create event form
const COLUMNS = [
  { key: 'startDate', label: 'תאריך התחלה', width: 120, type: 'date' as const, required: true },
  { key: 'startTime', label: 'שעת התחלה', width: 100, type: 'time' as const, required: true },
  { key: 'endDate', label: 'תאריך סיום', width: 120, type: 'date' as const },
  { key: 'endTime', label: 'שעת סיום', width: 100, type: 'time' as const },
  { key: 'koDate', label: 'תאריך KO/TO', width: 120, type: 'date' as const },
  { key: 'koTime', label: 'שעת KO/TO', width: 100, type: 'time' as const },
  { key: 'sport', label: 'ענף', width: 100, type: 'text' as const },
  { key: 'league', label: 'ליגה/ענף', width: 120, type: 'text' as const },
  { key: 'stage', label: 'שלב', width: 100, type: 'text' as const },
  { key: 'homeTeam', label: 'מארחת', width: 120, type: 'text' as const },
  { key: 'awayTeam', label: 'אורחת', width: 120, type: 'text' as const },
  { 
    key: 'channel', 
    label: 'ערוץ', 
    width: 140, 
    type: 'select' as const, 
    options: ['5 SPORT', '5 LIVE', '5 PLUS', '5 GOLD', '5 STARS', '5 SPORT 4K']
  },
  { 
    key: 'parallelChannel', 
    label: 'ערוץ מקביל', 
    width: 140, 
    type: 'select' as const, 
    options: ['', '5 SPORT', '5 LIVE', '5 PLUS', '5 GOLD', '5 STARS', '5 SPORT 4K']
  },
  { key: 'channel1_4k', label: 'CHANNEL 1 4K', width: 100, type: 'boolean' as const },
  { key: 'live', label: 'שידור חי', width: 100, type: 'boolean' as const },
  { 
    key: 'subtitles', 
    label: 'כתוביות', 
    width: 100, 
    type: 'select' as const, 
    options: ['', 'CC', 'Sign Language', 'None'] 
  },
  { key: 'notes', label: 'הערות', width: 200, type: 'text' as const }
];

interface BatchEventCreatorProps {
  visible: boolean;
  onClose: () => void;
  onSave: (events: any[]) => Promise<void>;
}

const BatchEventCreator: React.FC<BatchEventCreatorProps> = ({ visible, onClose, onSave }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; column: string } | null>(null);
  const [dragSelection, setDragSelection] = useState<{ start: { rowId: string; column: string } | null; end: { rowId: string; column: string } | null }>({ start: null, end: null });
  const [isDragging, setIsDragging] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Create initial empty row
  const createEmptyRow = (id?: string): EventRow => {
    const rowId = id || `row-${Date.now()}-${Math.random()}`;
    return {
      id: rowId,
      startDate: { value: '', type: 'date', editable: true },
      startTime: { value: '', type: 'time', editable: true },
      endDate: { value: '', type: 'date', editable: true },
      endTime: { value: '', type: 'time', editable: true },
      koDate: { value: '', type: 'date', editable: true },
      koTime: { value: '', type: 'time', editable: true },
      sport: { value: '', type: 'text', editable: true },
      league: { value: '', type: 'text', editable: true },
      stage: { value: '', type: 'text', editable: true },
      homeTeam: { value: '', type: 'text', editable: true },
      awayTeam: { value: '', type: 'text', editable: true },
      channel: { value: '5 SPORT', type: 'select', options: COLUMNS.find(c => c.key === 'channel')?.options, editable: true },
      parallelChannel: { value: '', type: 'select', options: COLUMNS.find(c => c.key === 'parallelChannel')?.options, editable: true },
      channel1_4k: { value: false, type: 'boolean', editable: true },
      live: { value: false, type: 'boolean', editable: true },
      subtitles: { value: '', type: 'select', options: COLUMNS.find(c => c.key === 'subtitles')?.options, editable: true },
      notes: { value: '', type: 'text', editable: true }
    };
  };

  // Initialize with 5 empty rows
  useEffect(() => {
    if (visible && rows.length === 0) {
      const initialRows = Array.from({ length: 5 }, () => createEmptyRow());
      setRows(initialRows);
    }
  }, [visible]);

  // Add new row
  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  // Delete row
  const deleteRow = (rowId: string) => {
    setRows(prev => prev.filter(row => row.id !== rowId));
  };

  // Update cell value
  const updateCell = (rowId: string, column: string, value: any) => {
    setRows(prev => prev.map(row => {
      if (row.id === rowId) {
        const currentCell = row[column as keyof EventRow] as ExcelCell;
        return {
          ...row,
          [column]: {
            ...currentCell,
            value
          }
        };
      }
      return row;
    }));
  };

  // Calculate formula (basic implementation)
  const calculateFormula = (formula: string, rowIndex: number): any => {
    // Simple formula support:
    // =ROW() - returns row number
    // =A1+1 - adds 1 day to start date
    // =B1+60 - adds 60 minutes to start time
    
    if (formula === '=ROW()') {
      return rowIndex + 1;
    }
    
    // Date calculations (A column = startDate)
    if (formula.startsWith('=A') && formula.includes('+')) {
      const row = rows[rowIndex];
      if (row?.startDate?.value) {
        const days = parseInt(formula.split('+')[1]);
        const startDate = dayjs(row.startDate.value);
        return startDate.add(days, 'day').format('YYYY-MM-DD');
      }
    }
    
    // Time calculations (B column = startTime)
    if (formula.startsWith('=B') && formula.includes('+')) {
      const row = rows[rowIndex];
      if (row?.startTime?.value) {
        const minutes = parseInt(formula.split('+')[1]);
        const startTime = dayjs(`2000-01-01T${row.startTime.value}`);
        return startTime.add(minutes, 'minute').format('HH:mm');
      }
    }
    
    return formula;
  };

  // Handle cell input change
  const handleCellChange = (rowId: string, column: string, value: any) => {
    updateCell(rowId, column, value);
  };

  // Handle drag selection
  const handleMouseDown = (rowId: string, column: string) => {
    setSelectedCell({ rowId, column });
    setDragSelection({ start: { rowId, column }, end: null });
    setIsDragging(true);
  };

  const handleMouseEnter = (rowId: string, column: string) => {
    if (isDragging && dragSelection.start) {
      setDragSelection(prev => ({ ...prev, end: { rowId, column } }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    
    // If we have a drag selection, apply fill down logic
    if (dragSelection.start && dragSelection.end) {
      fillSelection();
    }
    
    setDragSelection({ start: null, end: null });
  };

  // Fill selection with pattern
  const fillSelection = () => {
    if (!dragSelection.start || !dragSelection.end) return;

    const startRowIndex = rows.findIndex(r => r.id === dragSelection.start!.rowId);
    const endRowIndex = rows.findIndex(r => r.id === dragSelection.end!.rowId);
    const column = dragSelection.start.column;

    if (startRowIndex === -1 || endRowIndex === -1) return;

    const sourceCell = rows[startRowIndex][column as keyof EventRow] as ExcelCell;
    const sourceValue = sourceCell.value;
    
    // Fill down logic
    for (let i = startRowIndex + 1; i <= endRowIndex; i++) {
      let newValue = sourceValue;
      
      // Smart fill for dates - copy the same date
      if (column.includes('Date') && sourceValue) {
        newValue = sourceValue; // Copy same date
      }
      
      // Smart fill for time - copy the same time
      if (column.includes('Time') && sourceValue) {
        newValue = sourceValue; // Keep same time
      }
      
      // Smart fill for numbers
      if (typeof sourceValue === 'number') {
        newValue = sourceValue + (i - startRowIndex);
      }
      
      updateCell(rows[i].id, column, newValue);
    }
  };

  // Check if cell is in selection
  const isCellInSelection = (rowId: string, column: string): boolean => {
    if (!dragSelection.start || !dragSelection.end) return false;
    
    const startRowIndex = rows.findIndex(r => r.id === dragSelection.start!.rowId);
    const endRowIndex = rows.findIndex(r => r.id === dragSelection.end!.rowId);
    const currentRowIndex = rows.findIndex(r => r.id === rowId);
    
    return column === dragSelection.start.column && 
           currentRowIndex >= Math.min(startRowIndex, endRowIndex) && 
           currentRowIndex <= Math.max(startRowIndex, endRowIndex);
  };

  // Render cell based on type
  const renderCell = (row: EventRow, columnKey: string) => {
    const cell = row[columnKey as keyof EventRow] as ExcelCell;
    const column = COLUMNS.find(c => c.key === columnKey);
    const isSelected = selectedCell?.rowId === row.id && selectedCell?.column === columnKey;
    const isInSelection = isCellInSelection(row.id, columnKey);

    const cellStyle: React.CSSProperties = {
      width: column?.width || 100,
      minWidth: column?.width || 100,
      maxWidth: column?.width || 100,
      height: 32,
      border: '1px solid #d9d9d9',
      padding: '4px 8px',
      backgroundColor: isSelected ? '#e6f7ff' : isInSelection ? '#f0f8ff' : 'white',
      cursor: 'cell',
      outline: 'none',
      fontSize: '12px',
      boxSizing: 'border-box'
    };

    const commonProps = {
      style: cellStyle,
      onMouseDown: () => handleMouseDown(row.id, columnKey),
      onMouseEnter: () => handleMouseEnter(row.id, columnKey),
      onChange: (e: any) => {
        const value = e.target ? e.target.value : e;
        handleCellChange(row.id, columnKey, value);
      }
    };

    switch (cell.type) {
      case 'date':
        return (
          <input
            type="date"
            value={cell.value}
            {...commonProps}
          />
        );
      case 'time':
        return (
          <input
            type="time"
            value={cell.value}
            {...commonProps}
          />
        );
      case 'datetime':
        return (
          <input
            type="datetime-local"
            value={cell.value}
            {...commonProps}
          />
        );
      case 'select':
        return (
          <select
            value={cell.value}
            {...commonProps}
          >
            {cell.options?.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={cell.value}
            {...commonProps}
            style={{ ...cellStyle, width: 'auto' }}
          />
        );
      default:
        return (
          <input
            type="text"
            value={cell.value}
            {...commonProps}
          />
        );
    }
  };

  // Convert rows to event format for saving
  const convertToEvents = (): any[] => {
    return rows
      .filter(row => row.startDate.value && row.startTime.value) // Only rows with both start date and time
      .map(row => {
        // Combine date and time fields into datetime strings
        const startDateTime = row.startDate.value && row.startTime.value 
          ? `${row.startDate.value}T${row.startTime.value}` 
          : null;
        
        const endDateTime = row.endDate.value && row.endTime.value 
          ? `${row.endDate.value}T${row.endTime.value}` 
          : row.endTime.value && row.startDate.value // Use start date if only end time is provided
          ? `${row.startDate.value}T${row.endTime.value}`
          : null;
        
        const koDateTime = row.koDate.value && row.koTime.value 
          ? `${row.koDate.value}T${row.koTime.value}` 
          : row.koTime.value && row.startDate.value // Use start date if only ko time is provided
          ? `${row.startDate.value}T${row.koTime.value}`
          : null;

        return {
          startTime: startDateTime,
          endTime: endDateTime,
          koTime: koDateTime,
          sport: row.sport.value || null,
          league: row.league.value || null,
          stage: row.stage.value || null,
          homeTeam: row.homeTeam.value || null,
          awayTeam: row.awayTeam.value || null,
          channel: normalizeChannelToHebrew(row.channel.value) || normalizeChannelToHebrew('5 SPORT'),
          parallelChannel: normalizeChannelToHebrew(row.parallelChannel.value) || null,
          channel1_4k: row.channel1_4k.value || false,
          live: row.live.value || false,
          subtitles: row.subtitles.value || null,
          notes: row.notes.value || null
        };
      });
  };

  // Handle save
  const handleSave = async () => {
    try {
      const events = convertToEvents();
      if (events.length === 0) {
        message.warning('אנא הזן לפחות אירוע אחד עם תאריך ושעת התחלה');
        return;
      }
      
      await onSave(events);
      message.success(`נוצרו בהצלחה ${events.length} אירועים`);
      onClose();
    } catch (error) {
      console.error('Error saving events:', error);
      message.error('שגיאה בשמירת האירועים');
    }
  };

  return (
    <Modal
      title="יצירה בקבצים - Excel UI"
      open={visible}
      onCancel={onClose}
      width={1400}
      footer={[
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button key="add" icon={<PlusOutlined />} onClick={addRow}>
          הוסף שורה
        </Button>,
        <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleSave}>
          שמור אירועים
        </Button>
      ]}
    >
      <div className="mb-4">
        <Card size="small">
          <Space wrap>
            <Tag color="blue">גרור תאים כדי למלא בתבנית</Tag>
            <Tag color="green">Ctrl+Click לבחירת תאים מרובים</Tag>
            <Tag color="orange">תמיכה בנוסחאות בסיסיות: =ROW(), =A1+1 (תאריכים), =B1+60 (זמן)</Tag>
          </Space>
        </Card>
      </div>

      <div 
        ref={tableRef}
        className="excel-table-container"
        style={{ 
          overflow: 'auto', 
          maxHeight: '60vh',
          border: '1px solid #d9d9d9'
        }}
        onMouseUp={handleMouseUp}
      >
        {/* Headers */}
        <div style={{ display: 'flex', backgroundColor: '#f5f5f5', borderBottom: '2px solid #d9d9d9' }}>
          <div style={{ 
            width: 40, 
            minWidth: 40,
            maxWidth: 40,
            height: 32, 
            border: '1px solid #d9d9d9', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontWeight: 'bold',
            boxSizing: 'border-box'
          }}>
            #
          </div>
          {COLUMNS.map(column => (
            <div
              key={column.key}
              style={{
                width: column.width,
                minWidth: column.width,
                maxWidth: column.width,
                height: 32,
                border: '1px solid #d9d9d9',
                padding: '4px 8px',
                fontWeight: 'bold',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#fafafa',
                boxSizing: 'border-box'
              }}
            >
              {column.label}
              {column.required && <span style={{ color: 'red', marginLeft: 4 }}>*</span>}
            </div>
          ))}
          <div style={{ 
            width: 60, 
            minWidth: 60,
            maxWidth: 60,
            height: 32, 
            border: '1px solid #d9d9d9', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontWeight: 'bold',
            boxSizing: 'border-box'
          }}>
            פעולות
          </div>
        </div>

        {/* Rows */}
        {rows.map((row, index) => (
          <div key={row.id} style={{ display: 'flex', borderBottom: '1px solid #e8e8e8' }}>
            {/* Row number */}
            <div style={{ 
              width: 40,
              minWidth: 40,
              maxWidth: 40,
              height: 32, 
              border: '1px solid #d9d9d9', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: '#f8f8f8',
              fontSize: '12px',
              fontWeight: 'bold',
              boxSizing: 'border-box'
            }}>
              {index + 1}
            </div>
            
            {/* Data cells */}
            {COLUMNS.map(column => (
              <div key={column.key}>
                {renderCell(row, column.key)}
              </div>
            ))}
            
            {/* Actions */}
            <div style={{ 
              width: 60, 
              minWidth: 60,
              maxWidth: 60,
              height: 32, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: 4,
              boxSizing: 'border-box'
            }}>
              <Tooltip title="מחק שורה">
                <Button 
                  type="text" 
                  size="small" 
                  icon={<DeleteOutlined />} 
                  onClick={() => deleteRow(row.id)}
                  danger
                />
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Space>
          <Button icon={<PlusOutlined />} onClick={addRow} size="small">
            הוסף שורה
          </Button>
          <Button icon={<CopyOutlined />} size="small" disabled>
            העתק שורה (בפיתוח)
          </Button>
          <span style={{ fontSize: '12px', color: '#666' }}>
            שורות עם תוכן: {rows.filter(row => row.startDate.value && row.startTime.value).length} / {rows.length}
          </span>
        </Space>
      </div>
    </Modal>
  );
};

export default BatchEventCreator; 