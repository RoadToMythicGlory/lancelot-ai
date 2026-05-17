import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Modal, Alert, List, Card, Input, Button, Space, Tag, Row, Col, Badge, Empty, App } from 'antd';
import { 
  BarcodeOutlined, 
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ScanOutlined,
  SwapRightOutlined,
  FilePdfOutlined
} from '@ant-design/icons';
import WarehousePdfImportModal from '../warehouse/WarehousePdfImportModal';
import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT, GET_BROADCAST_EVENT, GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT, GET_EQUIPMENT_SET_BY_BARCODE } from '../../graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, CREATE_EQUIPMENT_ASSIGNMENT, UPDATE_EQUIPMENT_ASSIGNMENT, UPDATE_WAREHOUSE_EQUIPMENT_QUANTITY, ASSIGN_EQUIPMENT_SET_TO_EVENT } from '../../graphql/mutations';

interface BroadcastEvent {
  id: string;
  title: string;
  metadata?: any;
  [key: string]: any;
}

interface WarehouseModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onDataSaved?: () => void;
  /** When false, hides save / not-applicable buttons and disables interactive controls. */
  canEdit?: boolean;
}

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand: string;
  barcode: string;
  status: 'available' | 'assigned' | 'maintenance';
  quantityAvailable: number;
  quantityTotal: number;
}

interface RequestedEquipment {
  equipmentId: string;
  quantity: number;
  name: string;
  category: string;
}

interface ScannedItem {
  equipmentId: string;
  barcode: string;
  scannedAt: string;
  name: string;
  category: string;
}

const WarehouseModal: React.FC<WarehouseModalProps> = ({ visible, event, onClose, onDataSaved, canEdit = true }) => {
  const { message } = App.useApp();
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [requestedItems, setRequestedItems] = useState<RequestedEquipment[]>([]);
  const [assignedItems, setAssignedItems] = useState<ScannedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPdfImportVisible, setIsPdfImportVisible] = useState(false);

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    refetchQueries: ['GetBroadcastEvents', 'GetBroadcastEvent'],
    awaitRefetchQueries: true,
    onCompleted: () => {
      if (onDataSaved) {
        onDataSaved();
      }
    },
    onError: (error) => {
      console.error('❌ Error saving Warehouse data:', error);
    }
  });

  // Equipment assignment mutation to sync with PostgreSQL
  const [createEquipmentAssignment] = useMutation(CREATE_EQUIPMENT_ASSIGNMENT, {
    refetchQueries: ['GetWarehouseEquipment', 'GetEquipmentAssignmentsByEvent'],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('❌ Error creating equipment assignment:', error);
    }
  });

  // Update equipment assignment mutation
  const [updateEquipmentAssignment] = useMutation(UPDATE_EQUIPMENT_ASSIGNMENT, {
    refetchQueries: ['GetWarehouseEquipment', 'GetEquipmentAssignmentsByEvent'],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('❌ Error updating equipment assignment:', error);
    }
  });

  // Update warehouse equipment quantity mutation
  const [updateEquipmentQuantity] = useMutation(UPDATE_WAREHOUSE_EQUIPMENT_QUANTITY, {
    refetchQueries: ['GetWarehouseEquipment'],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('❌ Error updating equipment quantity:', error);
    }
  });

  // Lazy query to check if a scanned barcode is an equipment set
  const [fetchSetByBarcode] = useLazyQuery(GET_EQUIPMENT_SET_BY_BARCODE);
  const [lookupEquipmentByBarcode, { loading: equipmentLookupLoading }] = useLazyQuery(GET_WAREHOUSE_EQUIPMENT, {
    fetchPolicy: 'network-only',
  });

  // Mutation to assign an entire set to an event
  const [assignSetToEvent] = useMutation(ASSIGN_EQUIPMENT_SET_TO_EVENT, {
    refetchQueries: ['GetWarehouseEquipment', 'GetEquipmentAssignmentsByEvent', 'GetBroadcastEvent'],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('Error assigning equipment set:', error);
    },
  });

  // Query for existing equipment assignments
  const { data: assignmentsData } = useQuery(GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT, {
    variables: { broadcastEventId: event?.id },
    skip: !event?.id || !visible
  });

  // Query for warehouse equipment
  const { data: equipmentData, loading: equipmentLoading, error: equipmentError } = useQuery(GET_WAREHOUSE_EQUIPMENT, { skip: !visible });
  const equipment: Equipment[] = equipmentData?.warehouseEquipment || [];

  // Query for broadcast event details
  const { data: eventData } = useQuery(GET_BROADCAST_EVENT, {
    variables: { id: event?.id },
    skip: !event?.id || !visible
  });

  // Extract requested equipment from External Broadcasts department data
  useEffect(() => {
    if (visible && eventData?.broadcastEvent) {
      const metadata = eventData.broadcastEvent.metadata || {};
      
      const externalBroadcastsDept = metadata.departments?.externalBroadcasts || {};
      const cd = externalBroadcastsDept.customData || {};

      // Support both old format (equipmentList) and new format (equipmentRequests)
      const equipmentList: RequestedEquipment[] = cd.equipmentList || externalBroadcastsDept.equipmentList || [];
      const equipmentRequests: any[] = cd.equipmentRequests || externalBroadcastsDept.equipmentRequests || [];

      let finalRequested = equipmentList;
      if (finalRequested.length === 0 && equipmentRequests.length > 0) {
        finalRequested = equipmentRequests.map((req: any) => ({
          equipmentId: req.equipmentId || req.id || '',
          quantity: req.count || 0,
          name: req.categoryLabel || req.category || '',
          category: req.category || '',
        }));
      }
      
      const warehouseDept = metadata.departments?.warehouse || {};
      const existingAssigned = warehouseDept.customData?.assignedItems || 
                              warehouseDept.assignedItems || [];
      
      setRequestedItems(finalRequested);
      setAssignedItems(existingAssigned);
    }
  }, [eventData, visible]);

  const handleBarcodeScan = async () => {
    if (!canEdit) {
      message.error('אין לך הרשאת עריכה');
      return;
    }
    const trimmedBarcode = scannedBarcode.trim();
    
    if (!trimmedBarcode) {
      message.warning('אנא הזן ברקוד');
      return;
    }

    // Check if barcode belongs to an equipment set first
    try {
      const { data: setData } = await fetchSetByBarcode({ variables: { barcode: trimmedBarcode } });
      if (setData?.equipmentSetByBarcode) {
        const eqSet = setData.equipmentSetByBarcode;
        setScannedBarcode('');
        Modal.confirm({
          title: `סט ציוד: ${eqSet.name}`,
          width: 600,
          okText: 'הקצה סט',
          cancelText: 'ביטול',
          content: (
            <div style={{ direction: 'rtl' }}>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="נא לוודא שהסט מכיל את הציוד הבא:"
              />
              <ul style={{ paddingInlineStart: 20 }}>
                {(eqSet.items || []).map((item: any, idx: number) => (
                  <li key={idx} style={{ marginBottom: 4 }}>
                    <strong>{item.equipment?.name || item.equipmentId}</strong>
                    {' — '}
                    כמות: {item.quantity}
                    {item.required ? ' (חובה)' : ' (אופציונלי)'}
                  </li>
                ))}
              </ul>
              {eqSet.description && <p style={{ marginTop: 8, color: '#666' }}>{eqSet.description}</p>}
            </div>
          ),
          onOk: async () => {
            try {
              const result = await assignSetToEvent({
                variables: { eventId: event.id, setId: eqSet.id },
              });
              if (result.data?.assignEquipmentSetToEvent?.success) {
                message.success(result.data.assignEquipmentSetToEvent.message);
              } else {
                message.error('שגיאה בהקצאת הסט');
              }
            } catch (err: any) {
              message.error(err.message || 'שגיאה בהקצאת הסט');
            }
          },
        });
        return;
      }
    } catch {
      // Not a set barcode, continue to individual equipment lookup
    }

    // Find equipment by barcode (case-insensitive). The modal's initial
    // equipment list is capped, so always ask the backend before declaring a
    // barcode missing.
    let scannedEquipment = equipment.find(e =>
      e.barcode.toLowerCase() === trimmedBarcode.toLowerCase()
    );

    if (!scannedEquipment) {
      try {
        const { data } = await lookupEquipmentByBarcode({
          variables: {
            filter: { searchText: trimmedBarcode },
            limit: 20,
            offset: 0,
          },
        });
        scannedEquipment = (data?.warehouseEquipment || []).find((e: Equipment) =>
          e.barcode.toLowerCase() === trimmedBarcode.toLowerCase()
        );
      } catch (error) {
        console.error('Equipment barcode lookup error:', error);
      }
    }
    
    if (!scannedEquipment) {
      message.error(`ברקוד "${trimmedBarcode}" לא נמצא במערכת`);
      
      // Show helpful message with available barcodes
      if (equipment.length > 0) {
        message.info('נסה את אחד הברקודים הבאים: ' + equipment.slice(0, 3).map(e => e.barcode).join(', '));
      }
      
      setScannedBarcode('');
      return;
    }

    // Check if this equipment was requested (allow scanning any equipment)
    const requestedItem = requestedItems.find(item => item.equipmentId === scannedEquipment.id);

    // Check quantity limit - count how many times this equipment has been scanned
    const alreadyScannedCount = assignedItems.filter(item => item.equipmentId === scannedEquipment.id).length;
    
    // Check if we're exceeding available quantity
    if (alreadyScannedCount >= scannedEquipment.quantityAvailable) {
      message.error(
        `לא ניתן להוסיף עוד ${scannedEquipment.name}. ` +
        `כבר סרקת ${alreadyScannedCount} מתוך ${scannedEquipment.quantityAvailable} הזמינים`
      );
      setScannedBarcode('');
      return;
    }

    // Add to assigned items
    const newAssignedItem: ScannedItem = {
      equipmentId: scannedEquipment.id,
      barcode: trimmedBarcode,
      scannedAt: new Date().toISOString(),
      name: scannedEquipment.name,
      category: scannedEquipment.category || 'general'
    };

    setAssignedItems(prev => [...prev, newAssignedItem]);
    setScannedBarcode('');
    message.success(`${scannedEquipment.name} נסרק בהצלחה (${alreadyScannedCount + 1}/${scannedEquipment.quantityAvailable})`);
  };

  const handleSave = async () => {
    if (!canEdit) {
      message.error('אין לך הרשאת עריכה');
      return;
    }
    setLoading(true);
    try {
      // Get existing warehouse data to preserve history
      const existingData = eventData?.broadcastEvent?.metadata?.departments?.warehouse || {};
      const existingHistory = existingData.customData?.equipmentHistory || existingData.equipmentHistory || [];
      
      // Create history entries for newly assigned items
      const newHistoryEntries = assignedItems.map(item => ({
        ...item,
        assignedAt: item.scannedAt || new Date().toISOString(),
        action: 'assigned'
      }));
      
      // Merge with existing history (avoid duplicates)
      const existingBarcodes = new Set(existingHistory.map((h: any) => h.barcode));
      const seenInBatch = new Set<string>();
      const uniqueNewEntries = newHistoryEntries.filter(entry => {
        if (existingBarcodes.has(entry.barcode) || seenInBatch.has(entry.barcode)) return false;
        seenInBatch.add(entry.barcode);
        return true;
      });
      const completeHistory = [...existingHistory, ...uniqueNewEntries];
      
      // Prepare the data for saving
      const departmentData = {
        customData: {
          assignedItems: assignedItems,
          equipmentHistory: completeHistory, // Permanent history that never gets deleted
          totalRequested: requestedItems.reduce((sum, item) => sum + item.quantity, 0),
          totalAssigned: assignedItems.length,
          lastScanned: new Date().toISOString(),
          notApplicable: false
        }
      };

      // Save to MongoDB
      await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'warehouse',
          data: departmentData
        },
        refetchQueries: [
          { 
            query: GET_BROADCAST_EVENT,
            variables: { id: event.id }
          }
        ]
      });
      
      // Sync equipment assignments with PostgreSQL
      // Get existing assignments
      const existingAssignments = assignmentsData?.equipmentAssignmentsByEvent || [];
      
      // Group assigned items by equipment ID to create assignment records
      const equipmentGroups = assignedItems.reduce((acc, item) => {
        if (!acc[item.equipmentId]) {
          acc[item.equipmentId] = [];
        }
        acc[item.equipmentId].push(item);
        return acc;
      }, {} as Record<string, ScannedItem[]>);

      // Create or update assignment for each equipment type
      let failureCount = 0;
      for (const [equipmentId, items] of Object.entries(equipmentGroups)) {
        const existingAssignment = existingAssignments.find(
          (assignment: any) => assignment.equipmentId === equipmentId
        );
        
        try {
          if (existingAssignment) {
            const quantityDifference = items.length - existingAssignment.quantityAssigned;
            
            await updateEquipmentAssignment({
              variables: {
                id: existingAssignment.id,
                input: {
                  quantityAssigned: items.length,
                  assignmentStatus: 'assigned',
                  returnNotes: `Updated assignment for broadcast event: ${event.title}`
                }
              }
            });
            
            if (quantityDifference !== 0) {
              await updateEquipmentQuantity({
                variables: {
                  id: equipmentId,
                  quantityChange: quantityDifference
                }
              });
            }
          } else {
            await createEquipmentAssignment({
              variables: {
                input: {
                  equipmentId: equipmentId,
                  broadcastEventId: event.id,
                  quantityAssigned: items.length,
                  assignmentStatus: 'assigned',
                  assignmentNotes: `Assigned to broadcast event: ${event.title}`,
                  scheduledPickupAt: event.startTime,
                  scheduledReturnAt: event.endTime
                }
              }
            });
            
            await updateEquipmentQuantity({
              variables: {
                id: equipmentId,
                quantityChange: items.length
              }
            });
          }
        } catch (error) {
          console.error(`Error assigning equipment:`, error);
          failureCount++;
        }
      }
      
      if (failureCount > 0) {
        message.warning(`הנתונים נשמרו, אך ${failureCount} שיוכי ציוד נכשלו`);
      } else {
        message.success('הנתונים נשמרו בהצלחה');
      }
      onClose();
    } catch (error) {
      console.error('Error saving warehouse data:', error);
      message.error('שגיאה בשמירת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  // Calculate remaining items for each equipment type
  const getRemainingQuantity = (equipmentId: string) => {
    const requested = requestedItems.find(item => item.equipmentId === equipmentId);
    if (!requested) return 0;
    
    const assignedCount = assignedItems.filter(item => item.equipmentId === equipmentId).length;
    return requested.quantity - assignedCount;
  };

  // Group assigned items by equipment ID for display
  const getAssignedByEquipment = (equipmentId: string) => {
    return assignedItems.filter(item => item.equipmentId === equipmentId);
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <InboxOutlined />
          <span>מחסן - סריקת ציוד</span>
          {!canEdit && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: '#fff7e6',
              color: '#ad6800',
              border: '1px solid #ffd591',
              fontSize: 12,
              fontWeight: 500,
            }}>
              לקריאה בלבד
            </span>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={canEdit ? [
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button 
          key="not-for-us" 
          type="default"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              // Save only the not applicable flag
              const departmentData = {
                customData: {
                  notApplicable: true
                }
              };
              
              await updateDepartmentData({
                variables: {
                  eventId: event.id,
                  department: 'warehouse',
                  data: departmentData
                }
              });
              
              if (onDataSaved) {
                onDataSaved();
              }
              onClose();
            } catch (error) {
              console.error('Error marking as not applicable:', error);
            } finally {
              setLoading(false);
            }
          }}
        >
          לא עבורנו
        </Button>,
        <Button 
          key="save" 
          type="primary" 
          loading={loading}
          onClick={handleSave}
          disabled={assignedItems.length === 0}
        >
          שמור ({assignedItems.length} פריטים נסרקו)
        </Button>
      ] : [
        <Button key="close" onClick={onClose}>
          סגור
        </Button>
      ]}
    >
      <div className="mb-4">
        <Card size="small" className="bg-pink-50">
          <Row>
            <Col span={12}>
              <strong>אירוע:</strong> {event.title}
            </Col>
            <Col span={12}>
              <strong>זמן:</strong> {event.startTime ? dayjs(event.startTime).format('DD/MM/YYYY HH:mm') : '-'}
            </Col>
          </Row>
        </Card>
      </div>

      <Alert
        message="סריקת ציוד מבוקש"
        description="סרוק את הברקודים של הציוד המבוקש עבור האירוע. הציוד יעבור אוטומטית מרשימת הבקשות לרשימת הציוד המוקצה."
        type="info"
        showIcon
        className="mb-4"
      />

      {canEdit && (
        <div className="mb-4 text-center">
          <Button
            icon={<FilePdfOutlined />}
            onClick={() => setIsPdfImportVisible(true)}
          >
            ייבוא ציוד מ-PDF
          </Button>
        </div>
      )}

      {/* Barcode Scanner Input */}
      <div className="mb-6 text-center">
        <ScanOutlined style={{ fontSize: 48, color: '#eb2f96' }} />
        <h3 className="mt-4 text-lg font-semibold">סריקת ברקוד</h3>
        
        {equipmentLoading ? (
          <div className="mt-4">
            <Alert message="טוען נתוני ציוד..." type="info" showIcon />
          </div>
        ) : equipmentError ? (
          <div className="mt-4">
            <Alert message="שגיאה בטעינת נתוני ציוד" type="error" showIcon />
          </div>
        ) : (
          <>
            <Space.Compact style={{ maxWidth: 400, margin: '20px auto' }}>
              <Input
                placeholder="הזן או סרוק ברקוד"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                onPressEnter={handleBarcodeScan}
                prefix={<BarcodeOutlined />}
                size="large"
                style={{ flex: 1 }}
                disabled={!canEdit}
              />
              <Button 
                type="primary" 
                onClick={handleBarcodeScan}
                size="large"
                loading={equipmentLookupLoading}
                disabled={!canEdit || !scannedBarcode || equipmentLoading || equipmentLookupLoading}
              >
                סרוק
              </Button>
            </Space.Compact>
            
          </>
        )}
      </div>

      <Row gutter={16}>
        {/* Requested Equipment List */}
        <Col span={12}>
          <Card 
            title={
              <span>
                <CloseCircleOutlined className="ml-2" style={{ color: '#ff4d4f' }} />
                ציוד מבוקש
              </span>
            }
            className="h-full"
          >
            {requestedItems.length === 0 ? (
              <Empty description="אין ציוד מבוקש עבור אירוע זה" />
            ) : (
              <List
                dataSource={requestedItems}
                renderItem={(item) => {
                  const remaining = getRemainingQuantity(item.equipmentId);
                  const assigned = getAssignedByEquipment(item.equipmentId);
                  
                  return (
                    <List.Item>
                      <div className="w-full">
                        <div className="flex justify-between items-center mb-2">
                          <Space>
                            <strong>{item.name}</strong>
                            <Tag color="blue">{item.category}</Tag>
                          </Space>
                          <Badge 
                            count={remaining} 
                            showZero 
                            color={remaining === 0 ? '#52c41a' : '#faad14'}
                            overflowCount={99}
                          />
                        </div>
                        <div className="text-sm text-gray-500">
                          נדרש: {item.quantity} | נסרק: {assigned.length} | נותר: {remaining}
                        </div>
                        {assigned.length > 0 && (
                          <div className="mt-2">
                            {assigned.map((a, idx) => (
                              <Tag key={idx} color="green" className="mt-1 text-xs">
                                {a.barcode}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* Assigned Equipment List */}
        <Col span={12}>
          <Card 
            title={
              <span>
                <CheckCircleOutlined className="ml-2" style={{ color: '#52c41a' }} />
                ציוד מוקצה
              </span>
            }
            className="h-full"
          >
            {assignedItems.length === 0 ? (
              <Empty description="טרם נסרק ציוד" />
            ) : (
              <List
                dataSource={assignedItems}
                renderItem={(item) => (
                  <List.Item>
                    <div className="w-full">
                      <div className="flex justify-between items-center">
                        <Space>
                          <strong>{item.name}</strong>
                          <Tag color="green">{item.category}</Tag>
                        </Space>
                        <code className="text-sm">{item.barcode}</code>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        נסרק: {new Date(item.scannedAt).toLocaleString('he-IL')}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Summary */}
      <Card className="mt-4" size="small">
        <Row>
          <Col span={8} className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {requestedItems.reduce((sum, item) => sum + item.quantity, 0)}
            </div>
            <div className="text-sm text-gray-500">סה"כ מבוקש</div>
          </Col>
          <Col span={8} className="text-center">
            <SwapRightOutlined style={{ fontSize: 32, color: '#8c8c8c' }} />
          </Col>
          <Col span={8} className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {assignedItems.length}
            </div>
            <div className="text-sm text-gray-500">סה"כ נסרק</div>
          </Col>
        </Row>
      </Card>

      {/* PDF Import Modal */}
      <WarehousePdfImportModal
        visible={isPdfImportVisible}
        onClose={() => setIsPdfImportVisible(false)}
        eventId={event.id}
        eventTitle={event.title}
        onSuccess={() => {
          if (onDataSaved) onDataSaved();
        }}
      />
    </Modal>
  );
};

export default WarehouseModal; 