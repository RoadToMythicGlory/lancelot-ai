'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal, Upload, Button, Table, Tag, Space, Select, Alert, Card, Row, Col,
  Steps, Collapse, Spin, Segmented, Empty, Typography, App, DatePicker,
} from 'antd';
import {
  UploadOutlined, InboxOutlined, FilePdfOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, InfoCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { useQuery } from '@apollo/client';
import { GET_BROADCAST_EVENTS, GET_WAREHOUSE_EQUIPMENT } from '@/graphql/queries';
import dayjs from 'dayjs';

const { Dragger } = Upload;
const { Text } = Typography;
const { RangePicker } = DatePicker;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type ImportAction = 'merge' | 'replace' | 'skip';

interface ParsedItem {
  rawName: string;
  rawNames: string[];
  normalizedName: string;
  quantity: number;
  matchedItemId: string;
  matchedName: string;
  confidence: number;
  status: 'matched' | 'low_confidence' | 'duplicate_merged' | 'unmatched';
  warnings: string[];
  // Local UI state
  action: ImportAction;
  overrideItemId?: string;
  overrideItemName?: string;
}

interface ParseResult {
  importId: string;
  broadcastDetails: {
    date: string;
    city: string;
    venue: string;
    broadcastTime: string;
    gameTime: string;
    league: string;
    broadcastName: string;
    broadcastType: string;
  };
  crew: {
    technicians: string[];
    producers: string[];
    cameraOperators: string[];
    assistants: string[];
    other: Array<{ role: string; name: string }>;
  };
  notes: string;
  equipmentItems: ParsedItem[];
  warnings: string[];
  parserVersion: string;
  parserProfile?: string;
  documentConfidence?: number;
  importContentHash?: string;
}

interface BroadcastEvent {
  id: string;
  title: string;
  hebrewTitle?: string;
  startTime: string;
  channel?: string;
}

interface WarehousePdfImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  eventId?: string;
  eventTitle?: string;
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  matched: { color: 'green', label: 'תואם', icon: <CheckCircleOutlined /> },
  low_confidence: { color: 'gold', label: 'ביטחון נמוך', icon: <WarningOutlined /> },
  duplicate_merged: { color: 'blue', label: 'מוזג', icon: <InfoCircleOutlined /> },
  unmatched: { color: 'red', label: 'לא תואם', icon: <CloseCircleOutlined /> },
};

const WarehousePdfImportModal: React.FC<WarehousePdfImportModalProps> = ({
  visible,
  onClose,
  onSuccess,
  eventId: propEventId,
  eventTitle: propEventTitle,
}) => {
  const { message } = App.useApp();

  // Step management
  const hasPreselectedEvent = Boolean(propEventId);
  const [currentStep, setCurrentStep] = useState(hasPreselectedEvent ? 1 : 0);

  // Step 0: Event selection
  const [selectedEventId, setSelectedEventId] = useState<string>(propEventId || '');
  const [selectedEventTitle, setSelectedEventTitle] = useState<string>(propEventTitle || '');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs().add(30, 'days'),
  ]);

  // Step 1: Upload
  const [uploading, setUploading] = useState(false);

  // Step 2: Preview
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);

  // Step 3: Commit
  const [committing, setCommitting] = useState(false);

  // Duplicate detection
  const [duplicateInfo, setDuplicateInfo] = useState<{
    existingItemCount: number;
    overlappingItems?: number;
    duplicateImportWarning?: string | null;
  } | null>(null);

  const effectiveEventId = propEventId || selectedEventId;

  // Events query for step 0
  const { data: eventsData, loading: eventsLoading } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: dateRange[0].toISOString(),
      endDate: dateRange[1].toISOString(),
    },
    skip: hasPreselectedEvent || currentStep !== 0,
  });
  const events: BroadcastEvent[] = eventsData?.broadcastEvents || [];

  // Inventory query for manual override selects
  const { data: equipmentData } = useQuery(GET_WAREHOUSE_EQUIPMENT);
  const allEquipment = equipmentData?.warehouseEquipment || [];

  const getAuthToken = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('token') || '';
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/warehouse/import-equipment-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        message.error(data.error || 'שגיאה בניתוח ה-PDF');
        return;
      }

      // Attach default action to each item
      const itemsWithAction: ParsedItem[] = (data.equipmentItems || []).map((item: any) => ({
        ...item,
        action: 'merge' as ImportAction,
      }));

      setParseResult(data);
      setItems(itemsWithAction);
      setCurrentStep(2);

      // Run duplicate check against the target event
      if (effectiveEventId && data.importContentHash) {
        try {
          const dupRes = await fetch(`${API_BASE}/api/warehouse/import-equipment-pdf/check-duplicates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              eventId: effectiveEventId,
              importContentHash: data.importContentHash,
            }),
          });
          const dupData = await dupRes.json();
          if (dupData.success && (dupData.existingItemCount > 0 || dupData.duplicateImportWarning)) {
            setDuplicateInfo({
              existingItemCount: dupData.existingItemCount,
              duplicateImportWarning: dupData.duplicateImportWarning,
            });
          }
        } catch {
          // Non-blocking: duplicate check failure shouldn't prevent the import flow
        }
      }
    } catch (err: any) {
      message.error(`שגיאה: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [getAuthToken, message, effectiveEventId]);

  const handleCommit = useCallback(async () => {
    if (!effectiveEventId || !parseResult) return;
    setCommitting(true);
    try {
      const body = {
        importId: parseResult.importId,
        eventId: effectiveEventId,
        items: items.map(item => ({
          rawName: item.rawName,
          normalizedName: item.normalizedName,
          quantity: item.quantity,
          matchedItemId: item.overrideItemId || item.matchedItemId,
          category: '',
          action: item.action,
        })),
        broadcastDetails: parseResult.broadcastDetails,
        crew: parseResult.crew,
        notes: parseResult.notes,
      };

      const res = await fetch(`${API_BASE}/api/warehouse/import-equipment-pdf/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.success) {
        message.error(data.error || 'שגיאה בייבוא');
        return;
      }

      message.success(`ייבוא הצליח — ${data.itemsImported} פריטים יובאו`);
      onSuccess?.();
      handleReset();
      onClose();
    } catch (err: any) {
      message.error(`שגיאה: ${err.message}`);
    } finally {
      setCommitting(false);
    }
  }, [effectiveEventId, parseResult, items, getAuthToken, message, onSuccess, onClose]);

  const handleReset = () => {
    setCurrentStep(hasPreselectedEvent ? 1 : 0);
    setParseResult(null);
    setItems([]);
    setDuplicateInfo(null);
    if (!hasPreselectedEvent) {
      setSelectedEventId('');
      setSelectedEventTitle('');
    }
  };

  const updateItemAction = (index: number, action: ImportAction) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, action } : item)));
  };

  const updateItemOverride = (index: number, equipmentId: string) => {
    const eq = allEquipment.find((e: any) => e.id === equipmentId);
    setItems(prev =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              overrideItemId: equipmentId,
              overrideItemName: eq?.name || '',
              status: 'matched' as const,
              confidence: 1.0,
            }
          : item
      )
    );
  };

  const columns = [
    {
      title: 'שם מקורי (PDF)',
      dataIndex: 'rawName',
      key: 'rawName',
      width: 200,
      render: (text: string, record: ParsedItem) => (
        <div>
          <Text>{text}</Text>
          {record.rawNames && record.rawNames.length > 1 && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                +{record.rawNames.length - 1} שורות מוזגו
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'כמות',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      render: (qty: number) => <Tag color={qty === 0 ? 'orange' : 'blue'}>{qty}</Tag>,
    },
    {
      title: 'פריט מתואם',
      key: 'matchedItem',
      width: 250,
      render: (_: any, record: ParsedItem, index: number) => (
        <Select
          style={{ width: '100%' }}
          value={record.overrideItemId || record.matchedItemId || undefined}
          onChange={(val: string) => updateItemOverride(index, val)}
          placeholder="בחר פריט ממלאי"
          allowClear
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }
          size="small"
        >
          {allEquipment.map((eq: any) => (
            <Select.Option key={eq.id} value={eq.id}>
              {eq.name} ({eq.category})
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: 'ביטחון',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 80,
      render: (conf: number) => {
        const pct = Math.round(conf * 100);
        const color = pct >= 95 ? 'green' : pct >= 82 ? 'gold' : 'red';
        return <Tag color={color}>{pct}%</Tag>;
      },
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const cfg = statusConfig[status] || { color: 'default', label: status, icon: null };
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: 'פעולה',
      key: 'action',
      width: 190,
      render: (_: any, record: ParsedItem, index: number) => (
        <Segmented
          size="small"
          value={record.action}
          onChange={(val) => updateItemAction(index, val as ImportAction)}
          options={[
            { value: 'merge', label: 'מזג' },
            { value: 'replace', label: 'החלף' },
            { value: 'skip', label: 'דלג' },
          ]}
        />
      ),
    },
  ];

  const summary = useMemo(() => {
    if (!items.length) return null;
    return {
      total: items.length,
      matched: items.filter(i => i.status === 'matched' || i.overrideItemId).length,
      lowConf: items.filter(i => i.status === 'low_confidence' && !i.overrideItemId).length,
      unmatched: items.filter(i => i.status === 'unmatched' && !i.overrideItemId).length,
      skipped: items.filter(i => i.action === 'skip').length,
      totalQuantity: items.filter(i => i.action !== 'skip').reduce((s, i) => s + i.quantity, 0),
    };
  }, [items]);

  const steps = [
    ...(hasPreselectedEvent
      ? []
      : [{ title: 'בחר אירוע' }]),
    { title: 'העלאת PDF' },
    { title: 'תצוגה מקדימה' },
    { title: 'אישור' },
  ];

  const renderEventSelection = () => (
    <div>
      <Alert
        message="בחר את האירוע אליו יש לייבא את רשימת הציוד מה-PDF"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Space style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setDateRange([dates[0], dates[1]]);
            }
          }}
          format="DD/MM/YYYY"
        />
      </Space>
      {eventsLoading ? (
        <Spin style={{ display: 'block', textAlign: 'center', padding: 40 }} />
      ) : events.length === 0 ? (
        <Empty description="לא נמצאו אירועים בטווח התאריכים" />
      ) : (
        <Select
          style={{ width: '100%' }}
          placeholder="בחר אירוע"
          value={selectedEventId || undefined}
          onChange={(val: string) => {
            const ev = events.find(e => e.id === val);
            setSelectedEventId(val);
            setSelectedEventTitle(ev?.title || ev?.hebrewTitle || '');
          }}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }
          size="large"
        >
          {events.map(ev => (
            <Select.Option key={ev.id} value={ev.id}>
              {ev.title || ev.hebrewTitle} — {dayjs(ev.startTime).format('DD/MM HH:mm')} {ev.channel ? `(${ev.channel})` : ''}
            </Select.Option>
          ))}
        </Select>
      )}
    </div>
  );

  const renderUpload = () => (
    <div>
      {effectiveEventId && (
        <Alert
          message={`אירוע: ${propEventTitle || selectedEventTitle}`}
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Dragger
        accept=".pdf"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          handleUpload(file);
          return false;
        }}
        disabled={uploading}
      >
        {uploading ? (
          <div style={{ padding: 40 }}>
            <Spin size="large" />
            <p style={{ marginTop: 16 }}>מנתח את ה-PDF...</p>
          </div>
        ) : (
          <div style={{ padding: 40 }}>
            <p className="ant-upload-drag-icon">
              <FilePdfOutlined style={{ fontSize: 48, color: '#eb2f96' }} />
            </p>
            <p className="ant-upload-text">לחץ או גרור קובץ PDF לכאן</p>
            <p className="ant-upload-hint">
              קובץ PDF של טופס בקשת ציוד לשידורי חוץ
            </p>
          </div>
        )}
      </Dragger>
    </div>
  );

  const renderPreview = () => {
    if (!parseResult) return null;

    const docConf = parseResult.documentConfidence ?? 1;
    const confPct = Math.round(docConf * 100);

    return (
      <div>
        {docConf < 0.70 && (
          <Alert
            message="ביטחון מסמך נמוך — מומלץ מאוד לבצע בדיקה ידנית"
            description={`ציון ביטחון המסמך: ${confPct}%. ייתכנו שגיאות OCR או פורמט PDF לא תקין.`}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {duplicateInfo?.duplicateImportWarning && (
          <Alert
            message="אזהרת ייבוא כפול"
            description={duplicateInfo.duplicateImportWarning}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {duplicateInfo && duplicateInfo.existingItemCount > 0 && !duplicateInfo.duplicateImportWarning && (
          <Alert
            message={`לאירוע זה כבר יש ${duplicateInfo.existingItemCount} פריטי ציוד קיימים`}
            description="שימו לב — ייבוא זה ימזג או יחליף פריטים קיימים בהתאם לבחירה שלכם."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {parseResult.warnings.length > 0 && (
          <Alert
            message="אזהרות"
            description={
              <ul style={{ margin: 0, paddingRight: 20 }}>
                {parseResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          {parseResult.parserProfile && (
            <Tag color="purple">{parseResult.parserProfile}</Tag>
          )}
          <Tag color={confPct >= 90 ? 'green' : confPct >= 70 ? 'gold' : 'red'}>
            ביטחון: {confPct}%
          </Tag>
          <Tag>{parseResult.parserVersion}</Tag>
        </div>

        <Collapse
          ghost
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'details',
              label: 'פרטי שידור',
              children: (
                <Card size="small">
                  <Row gutter={[16, 8]}>
                    {parseResult.broadcastDetails.broadcastName && (
                      <Col span={12}><Text type="secondary">שם:</Text> {parseResult.broadcastDetails.broadcastName}</Col>
                    )}
                    {parseResult.broadcastDetails.date && (
                      <Col span={12}><Text type="secondary">תאריך:</Text> {parseResult.broadcastDetails.date}</Col>
                    )}
                    {parseResult.broadcastDetails.venue && (
                      <Col span={12}><Text type="secondary">מקום:</Text> {parseResult.broadcastDetails.venue}</Col>
                    )}
                    {parseResult.broadcastDetails.city && (
                      <Col span={12}><Text type="secondary">עיר:</Text> {parseResult.broadcastDetails.city}</Col>
                    )}
                    {parseResult.broadcastDetails.broadcastTime && (
                      <Col span={12}><Text type="secondary">שעת שידור:</Text> {parseResult.broadcastDetails.broadcastTime}</Col>
                    )}
                    {parseResult.broadcastDetails.gameTime && (
                      <Col span={12}><Text type="secondary">שעת משחק:</Text> {parseResult.broadcastDetails.gameTime}</Col>
                    )}
                    {parseResult.broadcastDetails.league && (
                      <Col span={12}><Text type="secondary">ליגה:</Text> {parseResult.broadcastDetails.league}</Col>
                    )}
                    {parseResult.broadcastDetails.broadcastType && (
                      <Col span={12}><Text type="secondary">סוג:</Text> {parseResult.broadcastDetails.broadcastType}</Col>
                    )}
                  </Row>
                </Card>
              ),
            },
            {
              key: 'crew',
              label: `צוות (${
                parseResult.crew.technicians.length +
                parseResult.crew.producers.length +
                parseResult.crew.cameraOperators.length +
                parseResult.crew.assistants.length +
                parseResult.crew.other.length
              })`,
              children: (
                <Card size="small">
                  {parseResult.crew.technicians.length > 0 && (
                    <div><Text strong>טכנאים:</Text> {parseResult.crew.technicians.join(', ')}</div>
                  )}
                  {parseResult.crew.producers.length > 0 && (
                    <div><Text strong>מפיקים:</Text> {parseResult.crew.producers.join(', ')}</div>
                  )}
                  {parseResult.crew.cameraOperators.length > 0 && (
                    <div><Text strong>צלמים:</Text> {parseResult.crew.cameraOperators.join(', ')}</div>
                  )}
                  {parseResult.crew.assistants.length > 0 && (
                    <div><Text strong>עוזרים:</Text> {parseResult.crew.assistants.join(', ')}</div>
                  )}
                  {parseResult.crew.other.map((o, i) => (
                    <div key={i}><Text strong>{o.role}:</Text> {o.name}</div>
                  ))}
                </Card>
              ),
            },
            ...(parseResult.notes
              ? [{
                  key: 'notes',
                  label: 'הערות',
                  children: (
                    <Card size="small">
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                        {parseResult.notes}
                      </pre>
                    </Card>
                  ),
                }]
              : []),
          ]}
        />

        {summary && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold' }}>{summary.total}</div>
                  <Text type="secondary">סה"כ פריטים</Text>
                </div>
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>{summary.matched}</div>
                  <Text type="secondary">תואמים</Text>
                </div>
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#faad14' }}>{summary.lowConf}</div>
                  <Text type="secondary">ביטחון נמוך</Text>
                </div>
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ff4d4f' }}>{summary.unmatched}</div>
                  <Text type="secondary">לא תואמים</Text>
                </div>
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#8c8c8c' }}>{summary.skipped}</div>
                  <Text type="secondary">דולגו</Text>
                </div>
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold' }}>{summary.totalQuantity}</div>
                  <Text type="secondary">סה"כ כמות</Text>
                </div>
              </Card>
            </Col>
          </Row>
        )}

        <Table
          columns={columns}
          dataSource={items}
          rowKey={(_, idx) => String(idx)}
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
          rowClassName={(record) =>
            record.action === 'skip' ? 'opacity-50' : ''
          }
        />
      </div>
    );
  };

  const adjustedStep = hasPreselectedEvent ? currentStep - 1 : currentStep;

  return (
    <Modal
      title={
        <Space>
          <FilePdfOutlined />
          <span>ייבוא ציוד מ-PDF</span>
        </Space>
      }
      open={visible}
      onCancel={() => {
        handleReset();
        onClose();
      }}
      width={1200}
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {currentStep > (hasPreselectedEvent ? 1 : 0) && currentStep < 3 && (
              <Button onClick={() => setCurrentStep(prev => prev - 1)}>חזרה</Button>
            )}
          </div>
          <Space>
            <Button onClick={() => { handleReset(); onClose(); }}>ביטול</Button>
            {currentStep === 0 && !hasPreselectedEvent && (
              <Button
                type="primary"
                disabled={!selectedEventId}
                onClick={() => setCurrentStep(1)}
              >
                הבא
              </Button>
            )}
            {currentStep === 2 && (
              <Button
                type="primary"
                loading={committing}
                onClick={() => {
                  setCurrentStep(3);
                  handleCommit();
                }}
                disabled={items.filter(i => i.action !== 'skip').length === 0}
              >
                אשר ייבוא ({items.filter(i => i.action !== 'skip').length} פריטים)
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <Steps
        current={adjustedStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={steps}
      />

      {currentStep === 0 && !hasPreselectedEvent && renderEventSelection()}
      {currentStep === 1 && renderUpload()}
      {currentStep === 2 && renderPreview()}
      {currentStep === 3 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          {committing ? (
            <>
              <Spin size="large" />
              <p style={{ marginTop: 16 }}>מייבא ציוד...</p>
            </>
          ) : (
            <>
              <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
              <p style={{ marginTop: 16, fontSize: 18 }}>הייבוא הושלם בהצלחה!</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default WarehousePdfImportModal;
