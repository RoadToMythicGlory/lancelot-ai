'use client';

import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { Modal, Button, Space } from 'antd';
import {
  VideoCameraOutlined,
  DesktopOutlined,
  GlobalOutlined,
  MessageOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  BarsOutlined,
} from '@ant-design/icons';
import BroadcastArrayModal from './BroadcastArrayModal';
import MCRModal from './MCRModal';
import ExternalBroadcastsModal from './ExternalBroadcastsModal';
import ClosedCaptionsModal from './ClosedCaptionsModal';
import WarehouseModal from './WarehouseModal';
import PlayoutDepartmentModal from './PlayoutDepartmentModal';
import RundownModal from './RundownModal';
import { GET_ACTIVITY_ROW_BY_BROADCAST_EVENT } from '@/graphql/mcrQueries';

interface BroadcastEventModalProps {
  visible: boolean;
  event: any;
  onClose: () => void;
  onUpdate?: (departmentData: any) => Promise<void>;
  onDataSaved?: () => void;
  /** When false, all child department modals render in read-only mode (no save). */
  canEdit?: boolean;
}

type Department = 
  | 'broadcast-array'
  | 'mcr'
  | 'external-broadcasts'
  | 'closed-captions'
  | 'warehouse'
  | 'rundown';

type DataStatus = 'complete' | 'partial' | 'empty';

const BroadcastEventModal: React.FC<BroadcastEventModalProps> = ({
  visible,
  event,
  onClose,
  onUpdate,
  onDataSaved,
  canEdit = false,
}) => {
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch the real ActivityRow from the DB for this broadcast event so MCR
  // status reflects actual saved data, not stale metadata.
  const eventDate = event?.startTime
    ? new Date(event.startTime).toISOString()
    : new Date().toISOString();

  const { data: activityRowData } = useQuery(GET_ACTIVITY_ROW_BY_BROADCAST_EVENT, {
    variables: {
      broadcastEventId: event?.id,
      date: eventDate,
    },
    skip: !visible || !event?.id,
    fetchPolicy: 'cache-and-network',
  });

  const activityRow = activityRowData?.activityRowByBroadcastEvent;

  const getDataStatus = (dept: Department): DataStatus => {
    if (!event) return 'empty';

    const metadata = event.metadata || {};
    
    const deptNameMap: Record<Department, string> = {
      'broadcast-array': 'broadcastArray',
      'mcr': 'mcr',
      'external-broadcasts': 'externalBroadcasts',
      'closed-captions': 'closedCaptions',
      'warehouse': 'warehouse',
      'rundown': 'rundown'
    };
    
    const backendDeptName = deptNameMap[dept];
    const departmentData = metadata.departments?.[backendDeptName] || {};
    
    if (departmentData.customData?.notApplicable || departmentData.notApplicable) {
      return 'complete';
    }

    switch (dept) {
      case 'broadcast-array': {
        const broadcastArrayData = departmentData;
        const crewAssignments = broadcastArrayData.crewAssignments || broadcastArrayData.broadcastArray?.crewAssignments || [];
        const customData = broadcastArrayData.customData || broadcastArrayData.broadcastArray?.customData || {};
        
        const hasRootData = broadcastArrayData.שידור || broadcastArrayData.מקוםשידור ||
                           broadcastArrayData.עורך || broadcastArrayData.מפיק || 
                           broadcastArrayData.אישVTR || broadcastArrayData.טכנאישידור;
        
        const filledCrewPositions = crewAssignments.length;
        const hasCustomData = customData.שידור || customData.מקוםשידור;
        
        if (filledCrewPositions >= 6 && (hasCustomData || hasRootData)) return 'complete';
        if (filledCrewPositions > 0 || hasCustomData || hasRootData) return 'partial';
        return 'empty';
      }

      case 'mcr': {
        // MCR data lives in ActivityRow — read directly from the DB query above.
        if (!activityRow) return 'empty';

        const filledFields = [
          activityRow.source,
          activityRow.backup,
          activityRow.equipment,
          activityRow.routing,
          activityRow.notes,
        ].filter((f: string | null | undefined) => f && String(f).trim() !== '');

        const hasWarehouseEquipment = (activityRow.warehouseEquipment || []).length > 0;

        if (filledFields.length >= 4 || (filledFields.length >= 2 && hasWarehouseEquipment)) return 'complete';
        if (filledFields.length > 0 || hasWarehouseEquipment) return 'partial';
        return 'empty';
      }

      case 'external-broadcasts': {
        const externalData = departmentData;
        const externalCustomData = externalData.customData || {};
        
        const productionCrew = externalCustomData.productionCrew ||
                              externalData.productionCrew ||
                              [];
        const equipmentList = externalCustomData.equipmentList ||
                             externalData.equipmentList ||
                             event.equipment_list || [];
        const equipmentRequests = externalCustomData.equipmentRequests || 
                                 externalData.equipmentRequests || [];
        const hasEquipment = equipmentList.length > 0 || equipmentRequests.length > 0;
        
        if (externalCustomData.notApplicable || externalData.notApplicable) return 'complete';
        
        if (productionCrew.length >= 2 && hasEquipment) return 'complete';
        if (productionCrew.length > 0 || hasEquipment) return 'partial';
        
        return 'empty';
      }

      case 'closed-captions': {
        const captionsData = departmentData;
        const captionsCustomData = captionsData.customData || {};
        
        const captionType = captionsCustomData.captionType || 
                           captionsData.captionType || 
                           captionsData.subtitles ||
                           event.subtitles;
        
        if (captionsCustomData.notApplicable || captionsData.notApplicable) return 'complete';
        if (captionType && captionType !== 'None' && captionType !== '') return 'complete';
        return 'empty';
      }

      case 'warehouse': {
        const warehouseData = departmentData;
        const warehouseCustomData = warehouseData.customData || {};
        const warehouseDataFromMetadata = metadata.warehouseData || {};
        const warehouseDataFromMetadataCustom = warehouseDataFromMetadata.customData || {};
        
        const assignedItems = warehouseCustomData.assignedItems || 
                             warehouseData.assignedItems || 
                             warehouseDataFromMetadataCustom.assignedItems ||
                             warehouseDataFromMetadata.assignedItems ||
                             [];
        
        const totalScanned = warehouseCustomData.totalAssigned || 
                            warehouseData.totalAssigned || 
                            warehouseDataFromMetadataCustom.totalAssigned ||
                            warehouseDataFromMetadata.totalAssigned ||
                            assignedItems.length;
        
        if (warehouseCustomData.notApplicable || 
            warehouseData.notApplicable || 
            warehouseDataFromMetadataCustom.notApplicable || 
            warehouseDataFromMetadata.notApplicable) {
          return 'complete';
        }
        
        if (totalScanned >= 3 || assignedItems.length >= 3) return 'complete';
        if (totalScanned > 0 || assignedItems.length > 0) return 'partial';
        return 'empty';
      }

      default:
        return 'empty';
    }
  };

  const getStatusStyle = (status: DataStatus) => {
    switch (status) {
      case 'complete':
        return {
          backgroundColor: '#22c55e',
          hoverColor: '#16a34a',
          borderColor: '#16a34a',
          color: 'white',
          statusIcon: <CheckCircleOutlined style={{ color: 'white' }} />,
        };
      case 'partial':
        return {
          backgroundColor: '#eab308',
          hoverColor: '#ca8a04',
          borderColor: '#ca8a04',
          color: 'white',
          statusIcon: <ExclamationCircleOutlined style={{ color: 'white' }} />,
        };
      case 'empty':
        return {
          backgroundColor: '#ef4444',
          hoverColor: '#dc2626',
          borderColor: '#dc2626',
          color: 'white',
          statusIcon: <CloseCircleOutlined style={{ color: 'white' }} />,
        };
    }
  };

  const departments = [
    {
      key: 'broadcast-array' as Department,
      title: 'מערך שידורים',
      icon: <VideoCameraOutlined className="text-3xl" />,
    },
    {
      key: 'mcr' as Department,
      title: 'MCR - חדר בקרה',
      icon: <DesktopOutlined className="text-3xl" />,
    },
    {
      key: 'external-broadcasts' as Department,
      title: 'שידורי חוץ',
      icon: <GlobalOutlined className="text-3xl" />,
    },
    {
      key: 'closed-captions' as Department,
      title: 'כתוביות סמויות',
      icon: <MessageOutlined className="text-3xl" />,
    },
    {
      key: 'warehouse' as Department,
      title: 'מחסן',
      icon: <DatabaseOutlined className="text-3xl" />,
    },
    {
      key: 'rundown' as Department,
      title: 'Rundown',
      icon: <BarsOutlined className="text-3xl" />,
    },
  ];

  const handleDepartmentClick = (dept: Department) => {
    setSelectedDepartment(dept);
  };

  const handleDepartmentModalClose = () => {
    setSelectedDepartment(null);
    if (onDataSaved) {
      onDataSaved();
    }
  };

  const handleDepartmentSave = async (data: any) => {
    if (!onUpdate) {
      handleDepartmentModalClose();
      return;
    }

    setSaving(true);
    try {
      const updateData: any = {};

      switch (selectedDepartment) {
        case 'broadcast-array':
          const broadcastArraySaveData = {
            שידור: data.שידור,
            מקוםשידור: data.מקוםשידור,
            עורך: data.עורך,
            מפיק: data.מפיק,
            אישVTR: data.אישVTR,
            טכנאישידור: data.טכנאישידור,
            שדר: data.שדר,
            שדרקוים: data.שדרקוים
          };
          updateData.metadata = {
            ...event.metadata,
            departments: {
              ...event.metadata?.departments,
              'broadcastArray': broadcastArraySaveData
            }
          };
          break;
          
        case 'mcr':
          updateData.routingPreset = data.routingPreset;
          updateData.metadata = {
            ...event.metadata,
            mcrDevices: data.selectedDevices,
          };
          break;
        
        case 'external-broadcasts':
          updateData.equipment_list = data.selectedEquipment;
          updateData.metadata = {
            ...event.metadata,
            departments: {
              ...(event.metadata?.departments || {}),
              externalBroadcasts: {
                ...(event.metadata?.departments?.externalBroadcasts || {}),
                customData: {
                  ...(event.metadata?.departments?.externalBroadcasts?.customData || {}),
                  productionCrew: data.productionCrew,
                },
              },
            },
          };
          break;
        
        case 'closed-captions':
          updateData.subtitles = data.captionType;
          break;
        
        case 'warehouse':
          updateData.metadata = {
            ...event.metadata,
            departments: {
              ...event.metadata?.departments,
              warehouse: data
            }
          };
          break;
      }

      await onUpdate(updateData);
      handleDepartmentModalClose();
    } catch (error) {
      console.error('Error saving department data:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        title={
          <span>
            {`${canEdit ? 'ניהול' : 'צפייה ב'}אירוע: ${event?.hebrewTitle || event?.title || 'אירוע שידור'}`}
            {!canEdit && (
              <span style={{
                marginInlineStart: 8,
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
          </span>
        }
        open={visible && selectedDepartment !== 'rundown'}
        onCancel={onClose}
        footer={null}
        width={800}
      >
        <div className="text-center mb-4">
          <p className="text-gray-600">
            {canEdit ? 'בחר מחלקה לעדכון פרטי האירוע' : 'בחר מחלקה לצפייה בפרטי האירוע (אין לך הרשאת עריכה)'}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const status = getDataStatus(dept.key);
            const statusStyle = getStatusStyle(status);
            
            return (
              <button
                key={dept.key}
                style={{
                  height: '128px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  backgroundColor: statusStyle.backgroundColor,
                  color: statusStyle.color,
                  border: `2px solid ${statusStyle.borderColor}`,
                  borderRadius: '8px',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = statusStyle.hoverColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = statusStyle.backgroundColor;
                }}
                onClick={() => handleDepartmentClick(dept.key)}
              >
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                  {statusStyle.statusIcon}
                </div>
                {React.cloneElement(dept.icon, { style: { fontSize: '48px', color: statusStyle.color } })}
                <span style={{ fontWeight: '500', fontSize: '14px' }}>{dept.title}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-center space-x-4 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircleOutlined className="text-green-600" />
            <span>נתונים מלאים</span>
          </div>
          <div className="flex items-center gap-1">
            <ExclamationCircleOutlined className="text-yellow-600" />
            <span>נתונים חלקיים</span>
          </div>
          <div className="flex items-center gap-1">
            <CloseCircleOutlined className="text-red-600" />
            <span>אין נתונים</span>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded">
          <h4 className="font-medium mb-2">פרטי האירוע:</h4>
          <Space direction="vertical" size={0}>
            <div>
              <span className="text-gray-600">שעת התחלה:</span>{' '}
              {event?.startTime && new Date(event.startTime).toLocaleString('he-IL')}
            </div>
            {event?.endTime && (
              <div>
                <span className="text-gray-600">שעת סיום:</span>{' '}
                {new Date(event.endTime).toLocaleString('he-IL')}
              </div>
            )}
            {event?.channel && (
              <div>
                <span className="text-gray-600">ערוץ:</span> {event.channel}
              </div>
            )}
            {event?.location && (
              <div>
                <span className="text-gray-600">מיקום:</span> {event.location}
              </div>
            )}
          </Space>
        </div>
      </Modal>

      {selectedDepartment === 'broadcast-array' && (
        <BroadcastArrayModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
          canEdit={canEdit}
        />
      )}

      {selectedDepartment === 'mcr' && (
        <MCRModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
          canEdit={canEdit}
        />
      )}

      {selectedDepartment === 'external-broadcasts' && (
        <ExternalBroadcastsModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
          canEdit={canEdit}
        />
      )}

      {selectedDepartment === 'closed-captions' && (
        <ClosedCaptionsModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
          canEdit={canEdit}
        />
      )}

      {selectedDepartment === 'warehouse' && (
        <WarehouseModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
          canEdit={canEdit}
        />
      )}

      {selectedDepartment === 'rundown' && (
        <RundownModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
          canEdit={canEdit}
        />
      )}
    </>
  );
};

export default BroadcastEventModal;
