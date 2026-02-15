import React, { useState, useEffect } from 'react';
import { Modal, Alert, List, Card, Input, Button, Space, Tag, Row, Col, Badge, Empty, App } from 'antd';
import { 
  BarcodeOutlined, 
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ScanOutlined,
  SwapRightOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT, GET_BROADCAST_EVENT, GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT } from '../../graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, CREATE_EQUIPMENT_ASSIGNMENT, UPDATE_EQUIPMENT_ASSIGNMENT, UPDATE_WAREHOUSE_EQUIPMENT_QUANTITY } from '../../graphql/mutations';

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

const WarehouseModal: React.FC<WarehouseModalProps> = ({ visible, event, onClose, onDataSaved }) => {
  const { message } = App.useApp();
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [requestedItems, setRequestedItems] = useState<RequestedEquipment[]>([]);
  const [assignedItems, setAssignedItems] = useState<ScannedItem[]>([]);
  const [loading, setLoading] = useState(false);

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    refetchQueries: ['GetBroadcastEvents', 'GetBroadcastEvent'],
    awaitRefetchQueries: true,
    onCompleted: () => {
      // console.log('✅ Warehouse data saved successfully');
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

  // Query for existing equipment assignments
  const { data: assignmentsData } = useQuery(GET_EQUIPMENT_ASSIGNMENTS_BY_EVENT, {
    variables: { broadcastEventId: event?.id },
    skip: !event?.id || !visible
  });

  // Query for warehouse equipment
  const { data: equipmentData, loading: equipmentLoading, error: equipmentError } = useQuery(GET_WAREHOUSE_EQUIPMENT);
  const equipment: Equipment[] = equipmentData?.warehouseEquipment || [];
  
  // console.log('🔧 Warehouse equipment data:', equipment);
  // console.log('🔍 Equipment count:', equipment.length);
  // console.log('📊 Equipment barcodes:', equipment.map(e => e.barcode));
  // console.log('⏳ Equipment loading:', equipmentLoading);
  // console.log('❌ Equipment error:', equipmentError);

  // Query for broadcast event details
  const { data: eventData } = useQuery(GET_BROADCAST_EVENT, {
    variables: { id: event?.id },
    skip: !event?.id || !visible
  });

  // Extract requested equipment from External Broadcasts department data
  useEffect(() => {
    if (visible && eventData?.broadcastEvent) {
      // Always use fresh data from the query when available
      const metadata = eventData.broadcastEvent.metadata || {};
      
      // Check both in customData and directly in department data for external broadcasts
      const externalBroadcastsDept = metadata.departments?.externalBroadcasts || {};
      const equipmentList = externalBroadcastsDept.customData?.equipmentList || 
                           externalBroadcastsDept.equipmentList || [];
      
      // Get existing warehouse data - check both customData and direct fields
      const warehouseDept = metadata.departments?.warehouse || {};
      const existingAssigned = warehouseDept.customData?.assignedItems || 
                              warehouseDept.assignedItems || [];
      
      console.log('📦 Loading equipment data:', {
        eventId: eventData.broadcastEvent.id,
        hasMetadata: !!metadata,
        departments: Object.keys(metadata.departments || {}),
        warehouseDept,
        existingAssignedCount: existingAssigned.length,
        existingAssigned
      });
      
      setRequestedItems(equipmentList);
      setAssignedItems(existingAssigned);
    }
  }, [eventData, visible]);

  const handleBarcodeScan = () => {
    const trimmedBarcode = scannedBarcode.trim();
    
    if (!trimmedBarcode) {
      message.warning('אנא הזן ברקוד');
      return;
    }

    if (equipmentLoading) {
      message.warning('מערכת טוענת נתוני ציוד, אנא המתן...');
      return;
    }

    if (equipmentError) {
      message.error('שגיאה בטעינת נתוני ציוד');
      console.error('Equipment query error:', equipmentError);
      return;
    }

    // console.log('🔍 Scanning barcode:', trimmedBarcode);
    // console.log('📦 Available equipment:', equipment.length);
    // console.log('🔍 Looking for barcode:', `"${trimmedBarcode}"`);
    // console.log('📊 First 5 equipment items:', equipment.slice(0, 5).map(e => ({
    //   id: e.id,
    //   barcode: e.barcode,
    //   name: e.name
    // })));
    
    // Find equipment by barcode (case-insensitive)
    const scannedEquipment = equipment.find(e => 
      e.barcode.toLowerCase() === trimmedBarcode.toLowerCase()
    );
    
    // console.log('✅ Found equipment:', scannedEquipment);
    
    if (!scannedEquipment) {
      // Show similar barcodes for debugging
      const similarBarcodes = equipment
        .filter(e => e.barcode.toLowerCase().includes(trimmedBarcode.toLowerCase()))
        .slice(0, 5);
      
      // console.log('❌ Barcode not found. Similar barcodes:', similarBarcodes.map(e => ({
      //   barcode: e.barcode,
      //   name: e.name
      // })));
      
      // Also check if the barcode exists but with different case
      const caseInsensitiveMatch = equipment.find(e => 
        e.barcode.toLowerCase() === trimmedBarcode.toLowerCase()
      );
      
      if (caseInsensitiveMatch) {
        // console.log('🔍 Found case-insensitive match:', caseInsensitiveMatch);
      }
      
      message.error(`ברקוד "${trimmedBarcode}" לא נמצא במערכת`);
      
      // Show helpful message with available barcodes
      if (equipment.length > 0) {
        message.info('נסה את אחד הברקודים הבאים: ' + equipment.slice(0, 3).map(e => e.barcode).join(', '));
      }
      
      setScannedBarcode('');
      return;
    }

    // Check if this equipment was requested
    const requestedItem = requestedItems.find(item => item.equipmentId === scannedEquipment.id);
    
    if (!requestedItem) {
      // For now, allow scanning any equipment even if not requested
      // console.log('⚠️ Equipment not in requested list, but allowing scan');
      
      // Don't add to requested items - just continue with scanning
      // Continue with scanning
    }

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
      barcode: scannedBarcode,
      scannedAt: new Date().toISOString(),
      name: scannedEquipment.name,
      category: scannedEquipment.category || 'general'
    };

    setAssignedItems(prev => [...prev, newAssignedItem]);
    setScannedBarcode('');
    message.success(`${scannedEquipment.name} נסרק בהצלחה (${alreadyScannedCount + 1}/${scannedEquipment.quantityAvailable})`);
  };

  const handleSave = async () => {
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
      const uniqueNewEntries = newHistoryEntries.filter(entry => !existingBarcodes.has(entry.barcode));
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

      // console.log('📤 Warehouse - Saving data:', departmentData);

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
      for (const [equipmentId, items] of Object.entries(equipmentGroups)) {
        const equipment = items[0]; // Get equipment info from first item
        
        // Check if assignment already exists
        const existingAssignment = existingAssignments.find(
          (assignment: any) => assignment.equipmentId === equipmentId
        );
        
        try {
          if (existingAssignment) {
            // Calculate quantity difference
            const quantityDifference = items.length - existingAssignment.quantityAssigned;
            
            // Update existing assignment
            await updateEquipmentAssignment({
              variables: {
                id: existingAssignment.id,
                input: {
                  quantityAssigned: items.length,
                  assignmentStatus: 'assigned',
                  assignedToName: event.title,
                  returnNotes: `Updated assignment for broadcast event: ${event.title}`
                }
              }
            });
            
            // Update equipment quantity if there's a difference
            if (quantityDifference !== 0) {
              await updateEquipmentQuantity({
                variables: {
                  id: equipmentId,
                  quantityChange: quantityDifference
                }
              });
            }
          } else {
            // Create new assignment
            await createEquipmentAssignment({
              variables: {
                input: {
                  equipmentId: equipmentId,
                  broadcastEventId: event.id,
                  quantityAssigned: items.length,
                  assignmentStatus: 'assigned',
                  assignedToName: event.title,
                  assignmentNotes: `Assigned to broadcast event: ${event.title}`,
                  scheduledPickupAt: event.startTime,
                  scheduledReturnAt: event.endTime
                }
              }
            });
            
            // Update equipment quantity (decrease available)
            await updateEquipmentQuantity({
              variables: {
                id: equipmentId,
                quantityChange: items.length
              }
            });
          }
        } catch (error) {
          console.error(`Error assigning equipment ${equipment.name}:`, error);
          // Continue with other assignments even if one fails
        }
      }
      
      message.success('הנתונים נשמרו בהצלחה');
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
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={[
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
      ]}
    >
      <div className="mb-4">
        <Card size="small" className="bg-pink-50">
          <Row>
            <Col span={12}>
              <strong>אירוע:</strong> {event.title}
            </Col>
            <Col span={12}>
              <strong>זמן:</strong> {event.תאריך} | {event.שעה}
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
              />
              <Button 
                type="primary" 
                onClick={handleBarcodeScan}
                size="large"
                disabled={!scannedBarcode || equipmentLoading}
              >
                סרוק
              </Button>
            </Space.Compact>
            
            {/* Example barcodes for testing */}
            {equipment.length > 0 && (
              <div className="mt-4 text-sm text-gray-500">
                <div>דוגמאות ברקודים לבדיקה:</div>
                <div className="mt-1">
                  {equipment.slice(0, 5).map((eq, idx) => (
                    <Tag 
                      key={idx} 
                      className="cursor-pointer mt-1"
                      onClick={() => setScannedBarcode(eq.barcode)}
                    >
                      {eq.barcode} - {eq.name}
                    </Tag>
                  ))}
                </div>
                
                {/* Quick test section */}
                <div className="mt-4 p-3 bg-gray-100 rounded">
                  <div className="font-semibold mb-2">בדיקה מהירה:</div>
                  <Space wrap>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setScannedBarcode('CAM-000001');
                        setTimeout(handleBarcodeScan, 100);
                      }}
                    >
                      סרוק CAM-000001
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setScannedBarcode('AUD-000426');
                        setTimeout(handleBarcodeScan, 100);
                      }}
                    >
                      סרוק AUD-000426
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setScannedBarcode('INVALID-123');
                        setTimeout(handleBarcodeScan, 100);
                      }}
                    >
                      סרוק ברקוד לא קיים
                    </Button>
                  </Space>
                </div>
              </div>
            )}
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
    </Modal>
  );
};

export default WarehouseModal; 