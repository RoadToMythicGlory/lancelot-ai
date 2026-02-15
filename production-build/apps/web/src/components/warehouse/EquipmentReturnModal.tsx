import React, { useState, useMemo } from 'react';
import { Modal, List, Card, Checkbox, Button, Space, Tag, Empty, Spin, Row, Col, Badge, Divider, App } from 'antd';
import { 
  CalendarOutlined, 
  EnvironmentOutlined, 
  VideoCameraOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  ToolOutlined,
  SwapOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_BROADCAST_EVENTS, GET_WAREHOUSE_EQUIPMENT } from '../../graphql/queries';
import { RETURN_EQUIPMENT_FROM_EVENT } from '../../graphql/mutations';
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

const EquipmentReturnModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [selectedEvent, setSelectedEvent] = useState<BroadcastEvent | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferEvent, setTransferEvent] = useState<BroadcastEvent | null>(null);

  // Memoize date calculations to prevent re-renders
  const { startDate, endDate } = useMemo(() => ({
    startDate: dayjs().subtract(30, 'days').toISOString(),
    endDate: dayjs().add(365, 'days').toISOString() // Include future events up to 1 year
  }), [visible]); // Only recalculate when modal visibility changes

  // Mutation for returning equipment
  const [returnEquipment] = useMutation(RETURN_EQUIPMENT_FROM_EVENT, {
    refetchQueries: [
      'GetBroadcastEvents',
      'GetBroadcastEvent',
      'GetWarehouseEquipment',
      'GetEquipmentAssignmentsByEvent'
    ],
    awaitRefetchQueries: true,
    onCompleted: (data) => {
      console.log('✅ Equipment return completed:', data);
    },
    onError: (error) => {
      console.error('❌ Equipment return error:', error);
    }
  });

  const { data: eventsData, loading: eventsLoading, refetch: refetchEvents } = useQuery(GET_BROADCAST_EVENTS, {
    variables: { startDate, endDate },
    skip: !visible,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first', // Prevent repeated fetches
    notifyOnNetworkStatusChange: false // Prevent re-renders on network status changes
  });

  // Get all warehouse equipment to match with IDs
  const { data: equipmentData, refetch: refetchEquipment } = useQuery(GET_WAREHOUSE_EQUIPMENT, {
    skip: !visible,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first'
  });

  const equipmentMap = new Map<string, EquipmentItem>();
  equipmentData?.warehouseEquipment?.forEach((item: EquipmentItem) => {
    equipmentMap.set(item.id, item);
    equipmentMap.set(item.barcode, item); // Also map by barcode
  });

  // Filter events that have equipment assigned
  const eventsWithEquipment = eventsData?.broadcastEvents?.filter(
    (event: BroadcastEvent) => {
      // Check multiple locations where equipment might be stored
      if (event.equipment_list && event.equipment_list.length > 0) {
        return true;
      }
      
      // Check in metadata.departments.warehouse.assignedItems (both with and without customData wrapper)
      const warehouseData = event.metadata?.departments?.warehouse;
      if (warehouseData?.assignedItems && warehouseData.assignedItems.length > 0) {
        return true;
      }
      if (warehouseData?.customData?.assignedItems && warehouseData.customData.assignedItems.length > 0) {
        return true;
      }
      
      // Check in metadata.departments.externalBroadcasts.equipmentList (both with and without customData wrapper)
      const externalData = event.metadata?.departments?.externalBroadcasts;
      if (externalData?.equipmentList && externalData.equipmentList.length > 0) {
        return true;
      }
      if (externalData?.customData?.equipmentList && externalData.customData.equipmentList.length > 0) {
        return true;
      }
      
      return false;
    }
  ) || [];

  // Sort events by date (most recent first)
  eventsWithEquipment.sort((a: BroadcastEvent, b: BroadcastEvent) => 
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const handleSelectAll = () => {
    if (selectedEvent) {
      const allEquipment: string[] = [];
      
      // From equipment_list
      if (selectedEvent.equipment_list && selectedEvent.equipment_list.length > 0) {
        allEquipment.push(...selectedEvent.equipment_list);
      }
      
      // From warehouse assignedItems
      const warehouseData = selectedEvent.metadata?.departments?.warehouse;
      if (warehouseData?.assignedItems) {
        const warehouseEquipmentIds = warehouseData.assignedItems.map((item: any) => 
          item.equipmentId || item.barcode || item.id
        ).filter(Boolean);
        allEquipment.push(...warehouseEquipmentIds);
      }
      if (warehouseData?.customData?.assignedItems) {
        const warehouseEquipmentIds = warehouseData.customData.assignedItems.map((item: any) => 
          item.equipmentId || item.barcode || item.id
        ).filter(Boolean);
        allEquipment.push(...warehouseEquipmentIds);
      }
      
      // From external broadcasts equipmentList
      const externalData = selectedEvent.metadata?.departments?.externalBroadcasts;
      if (externalData?.equipmentList) {
        const externalEquipmentIds = externalData.equipmentList.map((item: any) => 
          item.equipmentId || item.id
        ).filter(Boolean);
        allEquipment.push(...externalEquipmentIds);
      }
      if (externalData?.customData?.equipmentList) {
        const externalEquipmentIds = externalData.customData.equipmentList.map((item: any) => 
          item.equipmentId || item.id
        ).filter(Boolean);
        allEquipment.push(...externalEquipmentIds);
      }
      
      // Remove duplicates and set
      const uniqueEquipment = Array.from(new Set(allEquipment));
      setSelectedEquipment(new Set(uniqueEquipment));
    }
  };

  const handleDeselectAll = () => {
    setSelectedEquipment(new Set());
  };

  const handleEquipmentToggle = (equipmentId: string) => {
    const newSelected = new Set(selectedEquipment);
    if (newSelected.has(equipmentId)) {
      newSelected.delete(equipmentId);
    } else {
      newSelected.add(equipmentId);
    }
    setSelectedEquipment(newSelected);
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

    // Debug logging - check current state before returning
    console.log('🔍 DEBUG - Before returning equipment:', {
      eventId: selectedEvent.id,
      eventTitle: selectedEvent.title,
      selectedEquipmentIds: Array.from(selectedEquipment),
      equipmentList: selectedEvent.equipment_list,
      metadata: selectedEvent.metadata,
      warehouseData: selectedEvent.metadata?.departments?.warehouse,
      externalBroadcastsData: selectedEvent.metadata?.departments?.externalBroadcasts,
      metadataWarehouseData: selectedEvent.metadata?.warehouseData
    });

    setLoading(true);
    try {
      const result = await returnEquipment({
        variables: {
          eventId: selectedEvent.id,
          equipmentIds: Array.from(selectedEquipment)
        }
      });
      
      if (result.data?.returnEquipmentFromEvent?.success) {
        const equipmentNames = Array.from(selectedEquipment).map(id => {
          const equipment = equipmentMap.get(id);
          return equipment?.name || id;
        }).join(', ');
        
        message.success({
          content: result.data.returnEquipmentFromEvent.message || `הציוד הוחזר בהצלחה: ${equipmentNames}`,
          duration: 4
        });
        
        // Manually refetch after successful return
        await Promise.all([
          refetchEvents(),
          refetchEquipment()
        ]);
        
        // Reset state
        setSelectedEvent(null);
        setSelectedEquipment(new Set());
        onSuccess();
        onClose();
      } else {
        message.error(result.data?.returnEquipmentFromEvent?.message || 'שגיאה בהחזרת הציוד');
      }
    } catch (error) {
      message.error('שגיאה בהחזרת הציוד');
      console.error('Error returning equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedEvent(null);
    setSelectedEquipment(new Set());
    onClose();
  };

  const handleTransferEquipment = (event: BroadcastEvent, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the event
    setTransferEvent(event);
    setTransferModalVisible(true);
  };

  const handleTransferSuccess = async () => {
    // Refetch data after successful transfer
    await Promise.all([
      refetchEvents(),
      refetchEquipment()
    ]);
    setTransferModalVisible(false);
    setTransferEvent(null);
  };

  const getEquipmentDetails = (equipmentId: string): EquipmentItem | null => {
    return equipmentMap.get(equipmentId) || null;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      cameras: 'blue',
      batteries: 'green',
      liveu_kits: 'purple',
      unity_kits: 'orange',
      monitors: 'cyan',
      headphones: 'magenta',
      stabilizers: 'gold',
      other: 'default'
    };
    return colors[category] || 'default';
  };

  const getEquipmentCount = (event: BroadcastEvent) => {
    let count = 0;
    if (event.equipment_list && event.equipment_list.length > 0) {
      count += event.equipment_list.length;
    }
    const warehouseData = event.metadata?.departments?.warehouse;
    if (warehouseData?.assignedItems && warehouseData.assignedItems.length > 0) {
      count += warehouseData.assignedItems.length;
    }
    if (warehouseData?.customData?.assignedItems && warehouseData.customData.assignedItems.length > 0) {
      count += warehouseData.customData.assignedItems.length;
    }
    const externalData = event.metadata?.departments?.externalBroadcasts;
    if (externalData?.equipmentList && externalData.equipmentList.length > 0) {
      count += externalData.equipmentList.length;
    }
    if (externalData?.customData?.equipmentList && externalData.customData.equipmentList.length > 0) {
      count += externalData.customData.equipmentList.length;
    }
    return count;
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
        width={1000}
        footer={null}
        style={{ direction: 'rtl' }}
      >
      {eventsLoading ? (
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="mt-4 text-gray-500">טוען אירועים...</p>
        </div>
      ) : (
        <Row gutter={16}>
          {/* Events List */}
          <Col span={selectedEvent ? 12 : 24}>
            <Card 
              title="בחר הפקה להחזרת ציוד" 
              size="small"
              extra={
                <Badge count={eventsWithEquipment.length} style={{ backgroundColor: '#1890ff' }} />
              }
            >
              {eventsWithEquipment.length === 0 ? (
                <Empty description="לא נמצאו הפקות עם ציוד מוקצה" />
              ) : (
                <List
                  dataSource={eventsWithEquipment}
                  renderItem={(event: BroadcastEvent) => {
                    const isSelected = selectedEvent?.id === event.id;
                    const isToday = dayjs(event.startTime).isSame(dayjs(), 'day');
                    const isPast = dayjs(event.startTime).isBefore(dayjs());
                    
                    return (
                      <List.Item
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedEvent(event)}
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
                                העבר ציוד
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

          {/* Equipment List */}
          {selectedEvent && (
            <Col span={12}>
              <Card 
                title={
                  <div className="flex justify-between items-center">
                    <span>ציוד מוקצה להפקה</span>
                    <Space>
                      <Button 
                        size="small" 
                        onClick={handleSelectAll}
                        disabled={!selectedEvent.equipment_list?.length}
                      >
                        בחר הכל
                      </Button>
                      <Button 
                        size="small" 
                        onClick={handleDeselectAll}
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
                
                {(() => {
                  // Collect all equipment from different sources
                  const allEquipment: string[] = [];
                  
                  // From equipment_list
                  if (selectedEvent.equipment_list && selectedEvent.equipment_list.length > 0) {
                    allEquipment.push(...selectedEvent.equipment_list);
                  }
                  
                  // From warehouse assignedItems
                  const warehouseData = selectedEvent.metadata?.departments?.warehouse;
                  if (warehouseData?.assignedItems) {
                    const warehouseEquipmentIds = warehouseData.assignedItems.map((item: any) => 
                      item.equipmentId || item.barcode || item.id
                    ).filter(Boolean);
                    allEquipment.push(...warehouseEquipmentIds);
                  }
                  if (warehouseData?.customData?.assignedItems) {
                    const warehouseEquipmentIds = warehouseData.customData.assignedItems.map((item: any) => 
                      item.equipmentId || item.barcode || item.id
                    ).filter(Boolean);
                    allEquipment.push(...warehouseEquipmentIds);
                  }
                  
                  // From external broadcasts equipmentList
                  const externalData = selectedEvent.metadata?.departments?.externalBroadcasts;
                  if (externalData?.equipmentList) {
                    const externalEquipmentIds = externalData.equipmentList.map((item: any) => 
                      item.equipmentId || item.id
                    ).filter(Boolean);
                    allEquipment.push(...externalEquipmentIds);
                  }
                  if (externalData?.customData?.equipmentList) {
                    const externalEquipmentIds = externalData.customData.equipmentList.map((item: any) => 
                      item.equipmentId || item.id
                    ).filter(Boolean);
                    allEquipment.push(...externalEquipmentIds);
                  }
                  
                  // Remove duplicates
                  const uniqueEquipment = Array.from(new Set(allEquipment));
                  
                  return uniqueEquipment.length > 0 ? (
                    <>
                      <List
                        dataSource={uniqueEquipment}
                        renderItem={(equipmentId: string) => {
                          const equipment = getEquipmentDetails(equipmentId);
                          
                          return (
                            <List.Item style={{ padding: '8px 0' }}>
                              <Checkbox
                                checked={selectedEquipment.has(equipmentId)}
                                onChange={() => handleEquipmentToggle(equipmentId)}
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
                                          <span className="text-gray-500">
                                            {equipment.brand}
                                          </span>
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
                          נבחרו {selectedEquipment.size} מתוך {uniqueEquipment.length} פריטים
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
                  );
                })()}
              </Card>
            </Col>
          )}
        </Row>
      )}
    </Modal>

    {/* Transfer Equipment Modal */}
    {transferEvent && (
      <EquipmentTransferModal
        visible={transferModalVisible}
        onClose={() => {
          setTransferModalVisible(false);
          setTransferEvent(null);
        }}
        sourceEvent={transferEvent}
        equipmentList={(() => {
          // Collect all equipment from the transfer event
          const allEquipment: string[] = [];
          
          // From equipment_list
          if (transferEvent.equipment_list && transferEvent.equipment_list.length > 0) {
            allEquipment.push(...transferEvent.equipment_list);
          }
          
          // From warehouse assignedItems
          const warehouseData = transferEvent.metadata?.departments?.warehouse;
          if (warehouseData?.assignedItems) {
            const warehouseEquipmentIds = warehouseData.assignedItems.map((item: any) => 
              item.equipmentId || item.barcode || item.id
            ).filter(Boolean);
            allEquipment.push(...warehouseEquipmentIds);
          }
          if (warehouseData?.customData?.assignedItems) {
            const warehouseEquipmentIds = warehouseData.customData.assignedItems.map((item: any) => 
              item.equipmentId || item.barcode || item.id
            ).filter(Boolean);
            allEquipment.push(...warehouseEquipmentIds);
          }
          
          // From external broadcasts equipmentList
          const externalData = transferEvent.metadata?.departments?.externalBroadcasts;
          if (externalData?.equipmentList) {
            const externalEquipmentIds = externalData.equipmentList.map((item: any) => 
              item.equipmentId || item.id
            ).filter(Boolean);
            allEquipment.push(...externalEquipmentIds);
          }
          if (externalData?.customData?.equipmentList) {
            const externalEquipmentIds = externalData.customData.equipmentList.map((item: any) => 
              item.equipmentId || item.id
            ).filter(Boolean);
            allEquipment.push(...externalEquipmentIds);
          }
          
          // Remove duplicates
          return Array.from(new Set(allEquipment));
        })()}
        equipmentMap={equipmentMap}
        onSuccess={handleTransferSuccess}
      />
    )}
    </>
  );
};

export default EquipmentReturnModal; 