import React, { useState, useRef } from 'react';
import { Modal, Tabs, Descriptions, Tag, Table, Empty, Badge, Spin, Alert, Image, Button, App } from 'antd';
import { CalendarOutlined, HistoryOutlined, InfoCircleOutlined, EnvironmentOutlined, PrinterOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_EQUIPMENT_ASSIGNMENTS, GET_EQUIPMENT_HISTORY } from '../../graphql/queries';
import { UNDO_EQUIPMENT_TRANSFER } from '../../graphql/mutations';
import dayjs from 'dayjs';
import JsBarcode from 'jsbarcode';
import { useReactToPrint } from 'react-to-print';

interface EquipmentDetailsModalProps {
  visible: boolean;
  equipment: any;
  onClose: () => void;
}

// Equipment categories mapping
const EQUIPMENT_CATEGORIES = {
  cameras: 'מצלמות',
  batteries: 'סוללות',
  liveu_kits: 'ערכות LIVEU',
  unity_kits: 'ערכות UNITY',
  monitors: 'מוניטורים',
  headphones: 'אוזניות',
  stabilizers: 'מייצבים',
  cards: 'כרטיסים',
  adapters: 'מתאמים',
  matrix_components: 'רכיבי מטריצה',
  other: 'אחר'
};

const EquipmentDetailsModal: React.FC<EquipmentDetailsModalProps> = ({ 
  visible, 
  equipment,
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState('1');
  const componentRef = useRef<HTMLDivElement>(null);
  const [barcodeData, setBarcodeData] = useState<string>('');
  const [isPrintReady, setIsPrintReady] = useState(false);
  const { message } = App.useApp();

  // Query for current assignments
  const { data: assignmentsData, loading: assignmentsLoading } = useQuery(GET_EQUIPMENT_ASSIGNMENTS, {
    variables: { equipmentId: equipment?.id },
    skip: !equipment?.id || activeTab !== '2'
  });

  // Query for assignment history
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useQuery(GET_EQUIPMENT_HISTORY, {
    variables: { equipmentId: equipment?.id },
    skip: !equipment?.id || activeTab !== '3'
  });

  const currentAssignments = assignmentsData?.equipmentAssignments || [];
  const assignmentHistory = historyData?.equipmentHistory || [];

  // Undo transfer mutation
  const [undoTransfer] = useMutation(UNDO_EQUIPMENT_TRANSFER, {
    onCompleted: () => {
      message.success('העברת הציוד בוטלה בהצלחה');
      refetchHistory();
    },
    onError: (error) => {
      message.error(`שגיאה בביטול ההעברה: ${error.message}`);
    }
  });

  // Generate barcode SVG
  React.useEffect(() => {
    if (equipment?.barcode) {
      try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, equipment.barcode, {
          format: "CODE128",
          width: 2.5,
          height: 80,
          displayValue: true,
          fontSize: 16,
          font: "Arial",
          textAlign: "center",
          textPosition: "bottom",
          margin: 10,
          background: "#ffffff",
          lineColor: "#000000"
        });
        setBarcodeData(svg.outerHTML);
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [equipment?.barcode]);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `barcode-${equipment?.barcode}`,
    pageStyle: `
      @page {
        size: 100mm 60mm;
        margin: 0;
      }
      @media print {
        body {
          margin: 0;
        }
        body > * {
          display: none !important;
        }
        #barcode-print-area {
          display: block !important;
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          visibility: visible !important;
          z-index: 9999 !important;
          background-color: white !important;
        }
        #barcode-print-area * {
          display: inherit !important;
          visibility: visible !important;
        }
      }
    `
  });

  // Add a wrapper function to handle print with delay
  const handlePrintClick = () => {
    setIsPrintReady(true);
    // Wait for barcode to be rendered
    setTimeout(() => {
      handlePrint();
      setTimeout(() => setIsPrintReady(false), 1000);
    }, 500);
  };

  // Barcode Label Component
  const BarcodeLabel = React.forwardRef<HTMLDivElement>((props, ref) => {
    const [printBarcodeData, setPrintBarcodeData] = useState<string>('');
    
    React.useEffect(() => {
      if (equipment?.barcode && isPrintReady) {
        try {
          // Create a container div to hold the SVG
          const container = document.createElement('div');
          container.style.display = 'inline-block';
          
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          JsBarcode(svg, equipment.barcode, {
            format: "CODE128",
            width: 3,
            height: 80,
            displayValue: true,
            fontSize: 18,
            font: "Arial",
            textAlign: "center",
            textPosition: "bottom",
            margin: 10,
            background: "#ffffff",
            lineColor: "#000000"
          });
          
          container.appendChild(svg);
          setPrintBarcodeData(container.innerHTML);
        } catch (error) {
          console.error('Error generating print barcode:', error);
        }
      }
    }, [isPrintReady]);
    
    return (
      <div 
        ref={ref} 
        id="barcode-print-area"
        style={{ 
          position: 'fixed',
          left: isPrintReady ? '0px' : '-1000px',
          top: '0px',
          width: '100mm',
          height: '60mm',
          overflow: 'hidden',
          zIndex: isPrintReady ? 9999 : -1,
          backgroundColor: 'white',
          visibility: isPrintReady ? 'visible' : 'hidden'
        }}
      >
        <div
          style={{
            width: '100mm',
            height: '60mm',
            padding: '5mm',
            backgroundColor: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Arial, sans-serif',
            boxSizing: 'border-box',
            border: '1px solid #000'
        }}
        >
          <h3 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '18px', 
            textAlign: 'center',
            fontWeight: 'bold',
            color: '#000',
            fontFamily: 'Arial, sans-serif'
          }}>
            {equipment?.name}
          </h3>
          <div style={{ minHeight: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {printBarcodeData ? (
              <div dangerouslySetInnerHTML={{ __html: printBarcodeData }} />
            ) : isPrintReady ? (
              <canvas 
                ref={(canvas) => {
                  if (canvas && equipment?.barcode) {
                    try {
                      JsBarcode(canvas, equipment.barcode, {
                        format: "CODE128",
                        width: 3,
                        height: 80,
                        displayValue: true,
                        fontSize: 18,
                        font: "Arial",
                        textAlign: "center",
                        textPosition: "bottom",
                        margin: 10,
                        background: "#ffffff",
                        lineColor: "#000000"
                      });
                    } catch (error) {
                      console.error('Error generating canvas barcode:', error);
                    }
                  }
                }}
              />
            ) : (
              <div>טוען ברקוד...</div>
            )}
          </div>
          <div style={{ 
            marginTop: '8px', 
            fontSize: '14px', 
            textAlign: 'center',
            color: '#333',
            fontFamily: 'Arial, sans-serif'
          }}>
            {equipment?.category && `${EQUIPMENT_CATEGORIES[equipment.category as keyof typeof EQUIPMENT_CATEGORIES] || equipment.category}`}
          </div>
          {equipment?.brand && (
            <div style={{ 
              marginTop: '4px', 
              fontSize: '12px', 
              textAlign: 'center',
              color: '#666',
              fontFamily: 'Arial, sans-serif'
            }}>
              {equipment.brand} {equipment.equipmentModel ? `- ${equipment.equipmentModel}` : ''}
            </div>
          )}
        </div>
      </div>
    );
  });

  BarcodeLabel.displayName = 'BarcodeLabel';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'green';
      case 'assigned': return 'blue';
      case 'maintenance': return 'orange';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'זמין';
      case 'assigned': return 'מוקצה';
      case 'maintenance': return 'בתחזוקה';
      default: return status;
    }
  };

  // Current assignments table columns
  const currentAssignmentsColumns = [
    {
      title: 'שם אירוע',
      dataIndex: 'eventName',
      key: 'eventName',
    },
    {
      title: 'תאריך התחלה',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'תאריך סיום',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'מיקום',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: 'כמות',
      dataIndex: 'quantityAssigned',
      key: 'quantityAssigned',
      render: (qty: number) => <Badge count={qty} style={{ backgroundColor: '#1890ff' }} />
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'default'}>
          {status === 'active' ? 'פעיל' : status}
        </Tag>
      )
    }
  ];

  // History table columns
  const historyColumns = [
    {
      title: 'שם אירוע',
      dataIndex: 'eventName',
      key: 'eventName',
    },
    {
      title: 'תאריך',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'פעולה',
      dataIndex: 'action',
      key: 'action',
      render: (action: string, record: any) => {
        const actionColors: Record<string, string> = {
          'assigned': 'blue',
          'returned': 'green',
          'transferred': 'orange',
          'quantity_adjusted': 'purple',
          'disabled': 'red',
          'enabled': 'green'
        };
        const actionTexts: Record<string, string> = {
          'assigned': 'הוקצה',
          'returned': 'הוחזר',
          'transferred': 'הועבר',
          'quantity_adjusted': 'כמות עודכנה',
          'disabled': 'הושבת',
          'enabled': 'הופעל'
        };
        const actionText = actionTexts[action] || action;
        
        // Add transfer details if available
        if (action === 'transferred' && record.transferDetails) {
          return (
            <div>
              <Tag color={actionColors[action]}>{actionText}</Tag>
              <div className="text-xs text-gray-500 mt-1">
                מ-{record.transferDetails.sourceEventName} ל-{record.transferDetails.targetEventName}
              </div>
            </div>
          );
        }
        
        return <Tag color={actionColors[action] || 'default'}>{actionText}</Tag>;
      }
    },
    {
      title: 'כמות',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: 'מבוצע ע"י',
      dataIndex: 'performedBy',
      key: 'performedBy',
    },
    {
      title: 'הערות',
      dataIndex: 'notes',
      key: 'notes',
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_, record: any) => {
        if (record.action === 'transferred' && record.transferDetails?.canUndo) {
          return (
            <Button
              size="small"
              icon={<UndoOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'ביטול העברת ציוד',
                  content: `האם אתה בטוח שברצונך לבטל את העברת ${record.quantity} פריטים מ-${record.transferDetails.targetEventName} חזרה ל-${record.transferDetails.sourceEventName}?`,
                  okText: 'כן, בטל העברה',
                  cancelText: 'ביטול',
                  onOk: () => {
                    undoTransfer({
                      variables: { transferId: record.id }
                    });
                  }
                });
              }}
            >
              בטל העברה
            </Button>
          );
        }
        return null;
      }
    }
  ];

  const tabItems = [
    {
      key: '1',
      label: (
        <span>
          <InfoCircleOutlined />
          פרטי ציוד
        </span>
      ),
      children: (
        <div>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="שם המוצר" span={2}>
              {equipment?.name}
            </Descriptions.Item>
            <Descriptions.Item label="קטגוריה">
              <Tag color="blue">{EQUIPMENT_CATEGORIES[equipment?.category as keyof typeof EQUIPMENT_CATEGORIES] || equipment?.category}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="ברקוד">
              <code>{equipment?.barcode}</code>
            </Descriptions.Item>
            <Descriptions.Item label="מותג">
              {equipment?.brand || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="דגם">
              {equipment?.equipmentModel || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="סטטוס">
              <Tag color={getStatusColor(equipment?.status)}>
                {getStatusText(equipment?.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="מצב">
              {equipment?.condition || 'תקין'}
            </Descriptions.Item>
            <Descriptions.Item label="כמות כוללת">
              {equipment?.quantityTotal}
            </Descriptions.Item>
            <Descriptions.Item label="כמות זמינה">
              <Badge count={equipment?.quantityAvailable} style={{ backgroundColor: '#52c41a' }} />
            </Descriptions.Item>
            <Descriptions.Item label="כמות מוקצית">
              <Badge count={equipment?.quantityAssigned} style={{ backgroundColor: '#1890ff' }} />
            </Descriptions.Item>
            <Descriptions.Item label="מיקום נוכחי">
              {equipment?.currentLocation || 'מחסן ראשי'}
            </Descriptions.Item>
            
            {/* Additional Details */}
            {equipment?.price && (
              <Descriptions.Item label="מחיר">
                ₪{equipment.price.toLocaleString('he-IL')}
              </Descriptions.Item>
            )}
            {equipment?.purchaseDate && (
              <Descriptions.Item label="תאריך רכישה">
                {dayjs(equipment.purchaseDate).format('DD/MM/YYYY')}
              </Descriptions.Item>
            )}
            {/* Filler for odd number of items */}
            {((equipment?.price ? 1 : 0) + (equipment?.purchaseDate ? 1 : 0)) % 2 === 1 && (
              <Descriptions.Item label="">{''}</Descriptions.Item>
            )}
            {equipment?.warrantyExpiryDate && (
              <Descriptions.Item label="תאריך סיום אחריות">
                {dayjs(equipment.warrantyExpiryDate).format('DD/MM/YYYY')}
              </Descriptions.Item>
            )}
            {equipment?.company && (
              <Descriptions.Item label="חברה">
                {equipment.company}
              </Descriptions.Item>
            )}
            {/* Filler for odd number of items */}
            {((equipment?.warrantyExpiryDate ? 1 : 0) + (equipment?.company ? 1 : 0)) % 2 === 1 && (
              <Descriptions.Item label="">{''}</Descriptions.Item>
            )}
            {equipment?.contactPerson && (
              <Descriptions.Item label="איש קשר">
                {equipment.contactPerson}
              </Descriptions.Item>
            )}
            {equipment?.manualLink && (
              <Descriptions.Item label="הוראות הפעלה">
                <a href={equipment.manualLink} target="_blank" rel="noopener noreferrer">
                  קישור להוראות
                </a>
              </Descriptions.Item>
            )}
            {/* Filler for odd number of items */}
            {((equipment?.contactPerson ? 1 : 0) + (equipment?.manualLink ? 1 : 0)) % 2 === 1 && (
              <Descriptions.Item label="">{''}</Descriptions.Item>
            )}
            
            {/* Storage Location */}
            {equipment?.storage && (
              <>
                <Descriptions.Item label="מיקום במחסן" span={2}>
                  <EnvironmentOutlined /> 
                  {[
                    equipment.storage.row && `שורה ${equipment.storage.row}`,
                    equipment.storage.shelf && `מדף ${equipment.storage.shelf}`,
                    equipment.storage.cell && `תא ${equipment.storage.cell}`
                  ].filter(Boolean).join(', ') || 'לא מוגדר'}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
          
          {/* Barcode Preview */}
          {equipment?.barcode && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <h4>ברקוד</h4>
              <div style={{ 
                display: 'inline-block', 
                padding: '20px', 
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                border: '1px solid #d9d9d9'
              }}>
                <div dangerouslySetInnerHTML={{ __html: barcodeData }}></div>
              </div>
            </div>
          )}
          
          {equipment?.imageUrl && (
            <div style={{ marginTop: 16 }}>
              <h4>תמונת המוצר</h4>
              <Image
                width={200}
                src={equipment.imageUrl}
                alt={equipment.name}
                placeholder={
                  <div style={{ background: '#f0f0f0', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    טוען...
                  </div>
                }
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: '2',
      label: (
        <span>
          <CalendarOutlined />
          אירועים פעילים
        </span>
      ),
      children: (
        <div>
          {assignmentsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" />
              <div style={{ marginTop: '10px' }}>טוען אירועים פעילים...</div>
            </div>
          ) : currentAssignments.length > 0 ? (
            <Table
              dataSource={currentAssignments}
              columns={currentAssignmentsColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          ) : (
            <Empty 
              description="אין אירועים פעילים כרגע"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      ),
    },
    {
      key: '3',
      label: (
        <span>
          <HistoryOutlined />
          היסטוריית הקצאות
        </span>
      ),
      children: (
        <div>
          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" />
              <div style={{ marginTop: '10px' }}>טוען היסטוריה...</div>
            </div>
          ) : assignmentHistory.length > 0 ? (
            <Table
              dataSource={assignmentHistory}
              columns={historyColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              size="small"
            />
          ) : (
            <Empty 
              description="אין היסטוריית הקצאות"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={`פרטי ציוד: ${equipment?.name || ''}`}
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={[
        <Button key="close" onClick={onClose}>
          סגור
        </Button>,
        equipment?.barcode && (
          <Button 
            key="print" 
            type="primary" 
            icon={<PrinterOutlined />}
            onClick={handlePrintClick}
          >
            הדפס מדבקה
          </Button>
        )
      ].filter(Boolean)}
      destroyOnHidden
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
      <BarcodeLabel ref={componentRef} />
    </Modal>
  );
};

export default EquipmentDetailsModal; 