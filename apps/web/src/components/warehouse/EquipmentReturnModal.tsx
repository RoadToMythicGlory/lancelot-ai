import React, { useState, useMemo } from 'react';
import { Modal, List, Card, Checkbox, Button, Space, Tag, Empty, Spin, Row, Col, Badge, Divider, App, Input, Select, Alert } from 'antd';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  ToolOutlined,
  SwapOutlined,
  SearchOutlined,
  ScanOutlined,
  WarningOutlined,
  SwapRightOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import {
  GET_EVENTS_WITH_ASSIGNED_EQUIPMENT,
  GET_WAREHOUSE_EQUIPMENT,
  GET_WAREHOUSE_EQUIPMENT_FOR_PICKER,
  GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT,
  GET_EQUIPMENT_SET_BY_BARCODE
} from '../../graphql/queries';
import { RETURN_EQUIPMENT_FROM_EVENT, RETURN_EQUIPMENT_SET } from '../../graphql/mutations';
import dayjs from 'dayjs';
import EquipmentTransferModal from './EquipmentTransferModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface BroadcastEvent {
  id: string;
  title: string;
  hebrewTitle?: string;
  startTime: string;
  endTime: string;
  location?: string;
  venue?: string;
  channel: string;
  equipment_list?: string[];
  metadata?: any;
}

interface EquipmentItem {
  id: string;
  name: string;
  barcode: string;
  category: string;
  brand?: string;
  status?: string;
}

interface SetReturnState {
  set: any;
  eventId: string;
  scannedBarcodes: Set<string>;
  missingIds: Set<string>;
  replacements: Map<string, string>;
}

const EquipmentReturnModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [selectedEvent, setSelectedEvent] = useState<BroadcastEvent | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferEvent, setTransferEvent] = useState<BroadcastEvent | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const [setReturnState, setSetReturnState] = useState<SetReturnState | null>(null);
  const [replacementPickerFor, setReplacementPickerFor] = useState<string | null>(null);

  const [returnEquipment] = useMutation(RETURN_EQUIPMENT_FROM_EVENT, {
    refetchQueries: [
      'GetEventsWithAssignedEquipment',
      'GetBroadcastEvents',
      'GetBroadcastEvent',
      'GetWarehouseEquipment',
      'GetWarehouseEquipmentStats',
      'GetEquipmentAssignmentsByEvent',
    ],
    awaitRefetchQueries: true,
  });

  const [returnEquipmentSet] = useMutation(RETURN_EQUIPMENT_SET, {
    refetchQueries: [
      'GetEventsWithAssignedEquipment',
      'GetBroadcastEvents',
      'GetWarehouseEquipment',
      'GetWarehouseEquipmentStats',
    ],
    awaitRefetchQueries: true,
  });

  const [fetchSetByBarcode] = useLazyQuery(GET_EQUIPMENT_SET_BY_BARCODE);

  const { data: eventsData, loading: eventsLoading, refetch: refetchEvents } = useQuery(
    GET_EVENTS_WITH_ASSIGNED_EQUIPMENT,
    {
      skip: !visible,
      fetchPolicy: 'cache-and-network',
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: false,
    },
  );

  const { data: equipmentData, refetch: refetchEquipment } = useQuery(GET_WAREHOUSE_EQUIPMENT, {
    skip: !visible,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  // `warehouseEquipment` is capped at 500 alphabetical rows by design
  // (see queries.ts comment). When a returned event references gear past
  // that page, the lookup map below would miss it and the row would
  // render as a raw ObjectId. The picker projection is uncapped (5000
  // rows) and carries every field this modal renders.
  const { data: pickerEquipmentData } = useQuery(GET_WAREHOUSE_EQUIPMENT_FOR_PICKER, {
    skip: !visible,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const { data: selectedEventAssignmentsData } = useQuery(GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT, {
    variables: { broadcastEventId: selectedEvent?.id || '' },
    skip: !visible || !selectedEvent?.id,
    fetchPolicy: 'cache-and-network',
  });

  const equipmentMap = useMemo(() => {
    const map = new Map<string, EquipmentItem>();
    // Seed with the picker projection first — it has full catalog
    // coverage but lacks fields like `status`/`condition`.
    pickerEquipmentData?.warehouseEquipmentForPicker?.forEach((item: any) => {
      if (!item?.id) return;
      const entry: EquipmentItem = {
        id: item.id,
        name: item.name,
        barcode: item.barcode || '',
        category: item.category || '',
        brand: item.brand || undefined,
      };
      map.set(entry.id, entry);
      if (entry.barcode) map.set(entry.barcode.toLowerCase(), entry);
    });
    // Then overlay the full `warehouseEquipment` rows so any in-modal
    // consumer that needs `status`/extra fields still gets them for the
    // first ~500 alphabetically-sorted docs.
    equipmentData?.warehouseEquipment?.forEach((item: EquipmentItem) => {
      if (!item?.id) return;
      map.set(item.id, item);
      if (item.barcode) map.set(item.barcode.toLowerCase(), item);
    });
    return map;
  }, [equipmentData, pickerEquipmentData]);

  // Only collect equipment that was actually ASSIGNED (scanned out of the
  // warehouse). The `externalBroadcasts.equipmentList` paths hold REQUESTED
  // items from the External Broadcasts department and must not be treated as
  // assignments — otherwise the return modal would offer to "return" gear
  // that was never picked up.
  const collectEquipmentIds = (event: BroadcastEvent | null): string[] => {
    if (!event) return [];
    const ids: string[] = [];

    if (Array.isArray(event.equipment_list)) {
      ids.push(...event.equipment_list.filter((x): x is string => typeof x === 'string'));
    }

    const pushItems = (items: any) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const id = item?.equipmentId || item?.barcode || item?.id;
        if (id) ids.push(String(id));
      }
    };

    const warehouseData = event.metadata?.departments?.warehouse;
    pushItems(warehouseData?.assignedItems);
    pushItems(warehouseData?.customData?.assignedItems);

    const legacyWarehouse = event.metadata?.warehouseData;
    pushItems(legacyWarehouse?.assignedItems);
    pushItems(legacyWarehouse?.customData?.assignedItems);

    return Array.from(new Set(ids));
  };

  const allEvents: BroadcastEvent[] = eventsData?.eventsWithAssignedEquipment || [];

  const filteredEvents = useMemo(() => {
    if (!searchText) return allEvents;
    const q = searchText.toLowerCase();
    return allEvents.filter((ev) => {
      const titleMatch =
        (ev.title || '').toLowerCase().includes(q) ||
        (ev.hebrewTitle || '').toLowerCase().includes(q);
      if (titleMatch) return true;
      const eqIds = collectEquipmentIds(ev);
      return eqIds.some((id) => {
        const eq = equipmentMap.get(id) || equipmentMap.get(id.toLowerCase());
        if (!eq) return id.toLowerCase().includes(q);
        return (
          eq.name.toLowerCase().includes(q) ||
          eq.barcode.toLowerCase().includes(q)
        );
      });
    });
  }, [allEvents, searchText, equipmentMap]);

  const selectedEventEquipmentIds = useMemo(() => {
    const ids = collectEquipmentIds(selectedEvent);
    const assignmentIds = (selectedEventAssignmentsData?.equipmentAssignmentsByEvent || [])
      .map((a: any) => a.equipmentId)
      .filter(Boolean);
    return Array.from(new Set([...ids, ...assignmentIds]));
  }, [selectedEvent, selectedEventAssignmentsData]);

  // Handle scan input: set barcode or individual item barcode
  const handleScan = async () => {
    const barcode = scanInput.trim();
    if (!barcode) return;

    // 1) Check if it's a set barcode
    try {
      const { data: setData } = await fetchSetByBarcode({ variables: { barcode } });
      if (setData?.equipmentSetByBarcode) {
        const eqSet = setData.equipmentSetByBarcode;
        if (!selectedEvent) {
          message.warning('נא לבחור אירוע לפני סריקת סט');
          setScanInput('');
          return;
        }
        setSetReturnState({
          set: eqSet,
          eventId: selectedEvent.id,
          scannedBarcodes: new Set(),
          missingIds: new Set(),
          replacements: new Map(),
        });
        setScanInput('');
        message.info(`מצב החזרת סט: "${eqSet.name}"`);
        return;
      }
    } catch {
      // Not a set
    }

    // 2) If in set-return mode, scan child barcodes
    if (setReturnState) {
      const lower = barcode.toLowerCase();
      const eq = equipmentMap.get(lower);
      if (!eq) {
        message.error(`ברקוד "${barcode}" לא נמצא במערכת`);
        setScanInput('');
        return;
      }
      const isSetMember = setReturnState.set.items.some(
        (i: any) => i.equipmentId === eq.id,
      );
      if (!isSetMember) {
        message.warning(`${eq.name} אינו חלק מסט "${setReturnState.set.name}"`);
        setScanInput('');
        return;
      }
      setSetReturnState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, scannedBarcodes: new Set(prev.scannedBarcodes) };
        next.scannedBarcodes.add(eq.barcode);
        return next;
      });
      message.success(`${eq.name} נסרק`);
      setScanInput('');
      return;
    }

    // 3) Individual equipment barcode — auto-select event and item
    const eq = equipmentMap.get(barcode.toLowerCase());
    if (eq) {
      if (selectedEvent) {
        if (selectedEventEquipmentIds.includes(eq.id)) {
          const newSelected = new Set(selectedEquipment);
          newSelected.add(eq.id);
          setSelectedEquipment(newSelected);
          message.success(`${eq.name} נבחר להחזרה`);
        } else {
          message.warning(`${eq.name} לא מוקצה להפקה זו`);
        }
      } else {
        // Try to find the event for this equipment
        const matchingEvent = allEvents.find((ev) => collectEquipmentIds(ev).includes(eq.id));
        if (matchingEvent) {
          setSelectedEvent(matchingEvent);
          setSelectedEquipment(new Set([eq.id]));
          message.success(`${eq.name} נמצא באירוע "${matchingEvent.hebrewTitle || matchingEvent.title}"`);
        } else {
          message.warning(`${eq.name} לא נמצא בשום הפקה פעילה`);
        }
      }
    } else {
      message.error(`ברקוד "${barcode}" לא נמצא`);
    }
    setScanInput('');
  };

  const handleReturnEquipment = async () => {
    if (selectedEquipment.size === 0) {
      message.warning('בחר ציוד להחזרה');
      return;
    }
    if (!selectedEvent) {
      message.error('לא נבחרה הפקה');
      return;
    }

    setLoading(true);
    try {
      const result = await returnEquipment({
        variables: {
          eventId: selectedEvent.id,
          equipmentIds: Array.from(selectedEquipment),
        },
      });

      if (result.data?.returnEquipmentFromEvent?.success) {
        message.success(result.data.returnEquipmentFromEvent.message || 'הציוד הוחזר בהצלחה');
        await Promise.all([refetchEvents(), refetchEquipment()]);
        setSelectedEvent(null);
        setSelectedEquipment(new Set());
        onSuccess();
        onClose();
      } else {
        message.error(result.data?.returnEquipmentFromEvent?.message || 'שגיאה בהחזרת הציוד');
      }
    } catch (error) {
      message.error('שגיאה בהחזרת הציוד');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnSet = async () => {
    if (!setReturnState) return;
    setLoading(true);
    try {
      const result = await returnEquipmentSet({
        variables: {
          eventId: setReturnState.eventId,
          setId: setReturnState.set.id,
          scannedBarcodes: Array.from(setReturnState.scannedBarcodes),
          missingEquipmentIds: Array.from(setReturnState.missingIds),
          replacements: Array.from(setReturnState.replacements.entries()).map(
            ([originalEquipmentId, replacementEquipmentId]) => ({
              originalEquipmentId,
              replacementEquipmentId,
            }),
          ),
        },
      });

      if (result.data?.returnEquipmentSet?.success) {
        message.success(result.data.returnEquipmentSet.message);
        await Promise.all([refetchEvents(), refetchEquipment()]);
        setSetReturnState(null);
        setSelectedEvent(null);
        onSuccess();
        onClose();
      } else {
        message.error('שגיאה בהחזרת הסט');
      }
    } catch (error: any) {
      message.error(error.message || 'שגיאה בהחזרת הסט');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMissing = (equipmentId: string) => {
    setSetReturnState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, missingIds: new Set(prev.missingIds) };
      if (next.missingIds.has(equipmentId)) {
        next.missingIds.delete(equipmentId);
      } else {
        next.missingIds.add(equipmentId);
      }
      return next;
    });
  };

  const handleSetReplacement = (originalId: string, replacementId: string) => {
    setSetReturnState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, replacements: new Map(prev.replacements) };
      next.replacements.set(originalId, replacementId);
      return next;
    });
    setReplacementPickerFor(null);
  };

  const handleClose = () => {
    setSelectedEvent(null);
    setSelectedEquipment(new Set());
    setSetReturnState(null);
    setScanInput('');
    setSearchText('');
    onClose();
  };

  const handleTransferEquipment = (event: BroadcastEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setTransferEvent(event);
    setTransferModalVisible(true);
  };

  const handleTransferSuccess = async () => {
    await Promise.all([refetchEvents(), refetchEquipment()]);
    setTransferModalVisible(false);
    setTransferEvent(null);
  };

  const getEquipmentDetails = (equipmentId: string): EquipmentItem | null => {
    return equipmentMap.get(equipmentId) || equipmentMap.get(equipmentId.toLowerCase()) || null;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      cameras: 'blue', batteries: 'green', liveu_kits: 'purple',
      unity_kits: 'orange', monitors: 'cyan', headphones: 'magenta',
      stabilizers: 'gold', other: 'default',
    };
    return colors[category] || 'default';
  };

  const getEquipmentCount = (event: BroadcastEvent) => collectEquipmentIds(event).length;

  // Render set-return mode
  const renderSetReturnPane = () => {
    if (!setReturnState) return null;
    const { set, scannedBarcodes, missingIds, replacements } = setReturnState;

    return (
      <Card
        title={`החזרת סט: ${set.name}`}
        size="small"
        extra={
          <Button size="small" onClick={() => setSetReturnState(null)}>
            בטל
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="סרוק כל פריט בסט בנפרד. ניתן לסמן פריטים חסרים או להחליף."
        />

        <List
          dataSource={set.items || []}
          renderItem={(item: any) => {
            const eq = getEquipmentDetails(item.equipmentId);
            const barcode = eq?.barcode || '';
            const isScanned = scannedBarcodes.has(barcode);
            const isMissing = missingIds.has(item.equipmentId);
            const replacementId = replacements.get(item.equipmentId);
            const replacementEq = replacementId ? getEquipmentDetails(replacementId) : null;

            return (
              <List.Item style={{ padding: '8px 0' }}>
                <div className="w-full">
                  <div className="flex justify-between items-center">
                    <Space>
                      {isScanned && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                      {isMissing && <WarningOutlined style={{ color: '#ff4d4f' }} />}
                      {replacementEq && <SwapRightOutlined style={{ color: '#faad14' }} />}
                      <span className={isScanned ? 'text-green-600 font-medium' : ''}>
                        {eq?.name || item.equipmentId}
                      </span>
                      <Tag>{eq?.barcode || '-'}</Tag>
                      <Tag color="blue">x{item.quantity}</Tag>
                      {replacementEq && (
                        <Tag color="gold">הוחלף ב-{replacementEq.name}</Tag>
                      )}
                    </Space>
                    <Space>
                      {!isScanned && !isMissing && !replacementId && (
                        <>
                          <Button
                            size="small"
                            danger
                            onClick={() => handleToggleMissing(item.equipmentId)}
                          >
                            סמן כחסר
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setReplacementPickerFor(item.equipmentId)}
                          >
                            החלף פריט
                          </Button>
                        </>
                      )}
                      {isMissing && (
                        <Button
                          size="small"
                          onClick={() => handleToggleMissing(item.equipmentId)}
                        >
                          בטל חסר
                        </Button>
                      )}
                    </Space>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />

        {replacementPickerFor && (
          <div className="mt-3 p-3 bg-gray-50 rounded">
            <div className="mb-2 font-medium">בחר פריט חלופי:</div>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="חפש ציוד חלופי..."
              onChange={(val: string) => handleSetReplacement(replacementPickerFor, val)}
              options={(equipmentData?.warehouseEquipment || [])
                .filter((eq: any) => eq.quantityAvailable > 0 && eq.id !== replacementPickerFor)
                .map((eq: any) => ({
                  value: eq.id,
                  label: `${eq.name} (${eq.barcode}) — ${eq.quantityAvailable} זמין`,
                }))}
            />
            <Button
              size="small"
              className="mt-2"
              onClick={() => setReplacementPickerFor(null)}
            >
              ביטול
            </Button>
          </div>
        )}

        <Divider />
        <div className="flex justify-between items-center">
          <Space>
            <Tag color="green">
              נסרקו: {scannedBarcodes.size}/{(set.items || []).length}
            </Tag>
            {missingIds.size > 0 && <Tag color="red">חסרים: {missingIds.size}</Tag>}
            {replacements.size > 0 && <Tag color="gold">הוחלפו: {replacements.size}</Tag>}
          </Space>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={handleReturnSet}
            loading={loading}
          >
            סיים החזרת סט
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <>
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ToolOutlined />
            <span>החזרת ציוד למחסן</span>
          </div>
        }
        open={visible}
        onCancel={handleClose}
        width={1100}
        footer={null}
        style={{ direction: 'rtl' }}
      >
        {/* Scan & search bar */}
        <div className="mb-4 flex gap-3">
          <Input
            placeholder="סרוק ברקוד (ציוד או סט)"
            prefix={<ScanOutlined />}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onPressEnter={handleScan}
            style={{ flex: 1 }}
            allowClear
          />
          <Button type="primary" onClick={handleScan}>
            סרוק
          </Button>
          <Input
            placeholder="חיפוש חופשי (שם אירוע / ציוד / ברקוד)"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ flex: 1 }}
            allowClear
          />
        </div>

        {eventsLoading ? (
          <div className="text-center py-8">
            <Spin size="large" />
            <p className="mt-4 text-gray-500">טוען אירועים...</p>
          </div>
        ) : (
          <Row gutter={16}>
            {/* Events list */}
            <Col span={setReturnState ? 8 : selectedEvent ? 12 : 24}>
              <Card
                title="בחר הפקה להחזרת ציוד"
                size="small"
                extra={<Badge count={filteredEvents.length} style={{ backgroundColor: '#1890ff' }} />}
              >
                {filteredEvents.length === 0 ? (
                  <Empty description="לא נמצאו הפקות עם ציוד מוקצה" />
                ) : (
                  <List
                    dataSource={filteredEvents}
                    style={{ maxHeight: 500, overflowY: 'auto' }}
                    renderItem={(event: BroadcastEvent) => {
                      const isSelected = selectedEvent?.id === event.id;
                      const isToday = dayjs(event.startTime).isSame(dayjs(), 'day');
                      const isPast = dayjs(event.startTime).isBefore(dayjs());

                      return (
                        <List.Item
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            setSelectedEvent(event);
                            setSetReturnState(null);
                          }}
                          style={{ borderRadius: 4, marginBottom: 8, padding: '12px 16px' }}
                        >
                          <div className="w-full">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <strong className="text-base">
                                  {event.hebrewTitle || event.title}
                                </strong>
                                <div className="mt-1">
                                  <Tag color="blue">{event.channel}</Tag>
                                  {isToday && <Tag color="gold">היום</Tag>}
                                  {isPast && <Tag color="default">הסתיים</Tag>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  count={getEquipmentCount(event)}
                                  style={{ backgroundColor: '#52c41a' }}
                                  title="כמות ציוד"
                                />
                                <Button
                                  size="small"
                                  icon={<SwapOutlined />}
                                  onClick={(e) => handleTransferEquipment(event, e)}
                                  title="העבר ציוד"
                                >
                                  העבר
                                </Button>
                              </div>
                            </div>
                            <Space className="text-sm text-gray-500" wrap>
                              <span>
                                <CalendarOutlined className="ml-1" />
                                {dayjs(event.startTime).format('DD/MM/YYYY HH:mm')}
                              </span>
                              {event.location && (
                                <span>
                                  <EnvironmentOutlined className="ml-1" />
                                  {event.venue || event.location}
                                </span>
                              )}
                            </Space>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                )}
              </Card>
            </Col>

            {/* Equipment pane or set-return pane */}
            {selectedEvent && !setReturnState && (
              <Col span={12}>
                <Card
                  title={
                    <div className="flex justify-between items-center">
                      <span>ציוד מוקצה להפקה</span>
                      <Space>
                        <Button
                          size="small"
                          onClick={() =>
                            setSelectedEquipment(new Set(selectedEventEquipmentIds))
                          }
                          disabled={selectedEventEquipmentIds.length === 0}
                        >
                          בחר הכל
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setSelectedEquipment(new Set())}
                          disabled={selectedEquipment.size === 0}
                        >
                          בטל בחירה
                        </Button>
                      </Space>
                    </div>
                  }
                  size="small"
                >
                  <div className="mb-3 p-3 bg-gray-50 rounded">
                    <h4 className="font-semibold mb-1">
                      {selectedEvent.hebrewTitle || selectedEvent.title}
                    </h4>
                    <Space className="text-sm text-gray-600">
                      <span>{dayjs(selectedEvent.startTime).format('DD/MM/YYYY HH:mm')}</span>
                      {selectedEvent.venue && <span>• {selectedEvent.venue}</span>}
                    </Space>
                  </div>

                  {selectedEventEquipmentIds.length > 0 ? (
                    <>
                      <List
                        dataSource={selectedEventEquipmentIds}
                        renderItem={(equipmentId: string) => {
                          const equipment = getEquipmentDetails(equipmentId);
                          return (
                            <List.Item style={{ padding: '8px 0' }}>
                              <Checkbox
                                checked={selectedEquipment.has(equipmentId)}
                                onChange={() => {
                                  const newSelected = new Set(selectedEquipment);
                                  if (newSelected.has(equipmentId)) {
                                    newSelected.delete(equipmentId);
                                  } else {
                                    newSelected.add(equipmentId);
                                  }
                                  setSelectedEquipment(newSelected);
                                }}
                                style={{ width: '100%' }}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <Space>
                                    <InboxOutlined />
                                    {equipment ? (
                                      <>
                                        <span className="font-medium">{equipment.name}</span>
                                        <Tag color={getCategoryColor(equipment.category)}>
                                          {equipment.category}
                                        </Tag>
                                        {equipment.brand && (
                                          <span className="text-gray-500">{equipment.brand}</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-gray-500">{equipmentId}</span>
                                    )}
                                  </Space>
                                  {equipment && (
                                    <Space className="text-sm text-gray-500">
                                      <BarcodeOutlined />
                                      <code>{equipment.barcode}</code>
                                    </Space>
                                  )}
                                </div>
                              </Checkbox>
                            </List.Item>
                          );
                        }}
                      />
                      <Divider />
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">
                          נבחרו {selectedEquipment.size} מתוך{' '}
                          {selectedEventEquipmentIds.length} פריטים
                        </span>
                        <Button
                          type="primary"
                          icon={<CheckCircleOutlined />}
                          onClick={handleReturnEquipment}
                          loading={loading}
                          disabled={selectedEquipment.size === 0}
                        >
                          החזר ציוד למחסן
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Empty description="אין ציוד מוקצה להפקה זו" />
                  )}
                </Card>
              </Col>
            )}

            {/* Set return pane */}
            {setReturnState && (
              <Col span={16}>{renderSetReturnPane()}</Col>
            )}
          </Row>
        )}
      </Modal>

      {transferEvent && (
        <EquipmentTransferModal
          visible={transferModalVisible}
          onClose={() => {
            setTransferModalVisible(false);
            setTransferEvent(null);
          }}
          sourceEvent={transferEvent}
          equipmentList={collectEquipmentIds(transferEvent)}
          equipmentMap={equipmentMap}
          onSuccess={handleTransferSuccess}
        />
      )}
    </>
  );
};

export default EquipmentReturnModal;
