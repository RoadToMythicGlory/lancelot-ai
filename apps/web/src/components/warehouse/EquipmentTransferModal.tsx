import React, { useState } from 'react';
import { Modal, DatePicker, List, Card, Button, Space, Tag, Empty, Spin, Badge, App, Typography } from 'antd';
import { 
  CalendarOutlined, 
  EnvironmentOutlined, 
  SwapOutlined,
  InboxOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_BROADCAST_EVENTS } from '../../graphql/queries';
import { TRANSFER_EQUIPMENT_BETWEEN_EVENTS } from '../../graphql/mutations';
import dayjs from 'dayjs';

interface Props {
  visible: boolean;
  onClose: () => void;
  sourceEvent: BroadcastEvent | null;
  equipmentList: string[];
  equipmentMap: Map<string, EquipmentItem>;
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

const { Text } = Typography;

const EquipmentTransferModal: React.FC<Props> = ({ 
  visible, 
  onClose, 
  sourceEvent, 
  equipmentList, 
  equipmentMap,
  onSuccess 
}) => {
  const { message, modal } = App.useApp();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [targetEvent, setTargetEvent] = useState<BroadcastEvent | null>(null);
  const [loading, setLoading] = useState(false);

  // Query for events on selected date
  const { data: eventsData, loading: eventsLoading } = useQuery(GET_BROADCAST_EVENTS, {
    variables: { 
      startDate: selectedDate ? dayjs(selectedDate).startOf('day').toISOString() : null,
      endDate: selectedDate ? dayjs(selectedDate).endOf('day').toISOString() : null
    },
    skip: !selectedDate || !visible,
    fetchPolicy: 'network-only'
  });

  // Mutation for transferring equipment
  const [transferEquipment] = useMutation(TRANSFER_EQUIPMENT_BETWEEN_EVENTS);

  const handleDateChange = (date: any) => {
    setSelectedDate(date ? date.toISOString() : null);
    setTargetEvent(null);
  };

  const handleTransfer = async () => {
    if (!targetEvent || !sourceEvent) {
      message.warning('בחר אירוע יעד');
      return;
    }

    modal.confirm({
      title: 'אישור העברת ציוד',
      content: (
        <div style={{ direction: 'rtl' }}>
          <p>האם ברצונך להעביר ציוד מ<strong>{sourceEvent.hebrewTitle || sourceEvent.title}</strong> אל <strong>{targetEvent.hebrewTitle || targetEvent.title}</strong>?</p>
          <p className="text-sm text-gray-600 mt-2">
            {equipmentList.length} פריטים יועברו
          </p>
        </div>
      ),
      okText: 'העבר',
      cancelText: 'ביטול',
      onOk: async () => {
        setLoading(true);
        try {
          const result = await transferEquipment({
            variables: {
              sourceEventId: sourceEvent.id,
              targetEventId: targetEvent.id,
              equipmentIds: equipmentList
            }
          });
          
          if (result.data?.transferEquipmentBetweenEvents?.success) {
            message.success('הציוד הועבר בהצלחה');
            onSuccess();
            onClose();
          } else {
            message.error(result.data?.transferEquipmentBetweenEvents?.message || 'שגיאה בהעברת הציוד');
          }
        } catch (error) {
          message.error('שגיאה בהעברת הציוד');
          console.error('Error transferring equipment:', error);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleClose = () => {
    setSelectedDate(null);
    setTargetEvent(null);
    onClose();
  };

  // Filter out the source event from available targets
  const availableEvents = eventsData?.broadcastEvents?.filter(
    (event: BroadcastEvent) => event.id !== sourceEvent?.id
  ) || [];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <SwapOutlined />
          <span>העברת ציוד בין אירועים</span>
        </div>
      }
      open={visible}
      onCancel={handleClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          ביטול
        </Button>,
        <Button
          key="transfer"
          type="primary"
          icon={<SwapOutlined />}
          onClick={handleTransfer}
          loading={loading}
          disabled={!targetEvent}
        >
          העבר ציוד
        </Button>
      ]}
      style={{ direction: 'rtl' }}
    >
      {sourceEvent && (
        <>
          {/* Source Event Info */}
          <Card size="small" className="mb-4">
            <div className="flex justify-between items-start">
              <div>
                <Text strong>מאירוע:</Text>
                <h4 className="font-semibold mt-1">
                  {sourceEvent.hebrewTitle || sourceEvent.title}
                </h4>
                <Space className="text-sm text-gray-600 mt-1">
                  <span>{dayjs(sourceEvent.startTime).format('DD/MM/YYYY HH:mm')}</span>
                  {sourceEvent.venue && <span>• {sourceEvent.venue}</span>}
                </Space>
              </div>
              <Badge count={equipmentList.length} style={{ backgroundColor: '#52c41a' }} />
            </div>
          </Card>

          {/* Equipment to Transfer */}
          <Card size="small" className="mb-4" title="ציוד להעברה">
            <List
              size="small"
              dataSource={equipmentList}
              renderItem={(equipmentId: string) => {
                const equipment = equipmentMap.get(equipmentId);
                return (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space>
                      <InboxOutlined />
                      {equipment ? (
                        <>
                          <span>{equipment.name}</span>
                          <Tag>{equipment.category}</Tag>
                        </>
                      ) : (
                        <span className="text-gray-500">{equipmentId}</span>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Card>

          {/* Date Selection */}
          <div className="mb-4">
            <Text strong>בחר תאריך יעד:</Text>
            <DatePicker
              className="w-full mt-2"
              format="DD/MM/YYYY"
              onChange={handleDateChange}
              placeholder="בחר תאריך"
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </div>

          {/* Target Event Selection */}
          {selectedDate && (
            <Card 
              title="בחר אירוע יעד" 
              size="small"
              extra={
                <Badge count={availableEvents.length} style={{ backgroundColor: '#1890ff' }} />
              }
            >
              {eventsLoading ? (
                <div className="text-center py-4">
                  <Spin size="small" />
                  <p className="mt-2 text-gray-500">טוען אירועים...</p>
                </div>
              ) : availableEvents.length === 0 ? (
                <Empty description="לא נמצאו אירועים בתאריך זה" />
              ) : (
                <List
                  dataSource={availableEvents}
                  renderItem={(event: BroadcastEvent) => {
                    const isSelected = targetEvent?.id === event.id;
                    
                    return (
                      <List.Item
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setTargetEvent(event)}
                        style={{ borderRadius: 4, marginBottom: 8, padding: '8px 12px' }}
                      >
                        <div className="w-full">
                          <div className="flex justify-between items-start">
                            <div>
                              <strong>
                                {event.hebrewTitle || event.title}
                              </strong>
                              <div className="mt-1">
                                <Tag color="blue">{event.channel}</Tag>
                              </div>
                            </div>
                            {event.equipment_list && event.equipment_list.length > 0 && (
                              <Badge 
                                count={event.equipment_list.length} 
                                style={{ backgroundColor: '#faad14' }}
                                title="ציוד קיים"
                              />
                            )}
                          </div>
                          <Space className="text-sm text-gray-500 mt-1" wrap>
                            <span>
                              <CalendarOutlined className="ml-1" />
                              {dayjs(event.startTime).format('HH:mm')} - {dayjs(event.endTime).format('HH:mm')}
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
          )}
        </>
      )}
    </Modal>
  );
};

export default EquipmentTransferModal; 