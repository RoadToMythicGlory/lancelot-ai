'use client';

import React, { useState } from 'react';
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

interface BroadcastEventModalProps {
  visible: boolean;
  event: any;
  onClose: () => void;
  onUpdate?: (departmentData: any) => Promise<void>;
  onDataSaved?: () => void;
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
}) => {
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);

  // Debug: Log event structure when modal opens
  React.useEffect(() => {
    if (visible && event) {
      console.log('🔵 BroadcastEventModal opened with event:', {
        eventId: event.id,
        title: event.title,
        metadata: event.metadata,
        departments: event.metadata?.departments,
        departmentKeys: event.metadata?.departments ? Object.keys(event.metadata.departments) : [],
        fullEvent: event
      });
    }
  }, [visible, event]);

  // Function to check data completion status for each department
  const getDataStatus = (dept: Department): DataStatus => {
    if (!event) return 'empty';

    const metadata = event.metadata || {};
    
    // Map frontend department names to backend department names
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
    
    // Check for "not applicable" flag first
    if (departmentData.customData?.notApplicable || departmentData.notApplicable) {
      return 'complete'; // Show as complete if marked as not applicable
    }

    // Debug logging
    console.log(`🔍 Checking status for ${dept} (${backendDeptName}):`, {
      eventId: event.id,
      eventTitle: event.title,
      hasMetadata: !!metadata,
      hasDepartments: !!metadata.departments,
      availableDepartments: metadata.departments ? Object.keys(metadata.departments) : [],
      departmentData,
      allDepartmentData: metadata.departments,
      // Also check root level fields
      rootFields: {
        routing_preset: event.routingPreset,
        production_crew: event.production_crew,
        equipment_list: event.equipment_list,
        subtitles: event.subtitles,
        reception_start_time: event.reception_start_time
      }
    });

    switch (dept) {
      case 'broadcast-array':
        // Check all possible data locations
        const broadcastArrayData = departmentData;
        const crewAssignments = broadcastArrayData.crewAssignments || broadcastArrayData.broadcastArray?.crewAssignments || [];
        const customData = broadcastArrayData.customData || broadcastArrayData.broadcastArray?.customData || {};
        
        // Also check root level fields
        const hasRootData = broadcastArrayData.שידור || broadcastArrayData.מקוםשידור ||
                           broadcastArrayData.עורך || broadcastArrayData.מפיק || 
                           broadcastArrayData.אישVTR || broadcastArrayData.טכנאישידור;
        
        // Count filled crew positions (6 possible roles)
        const filledCrewPositions = crewAssignments.length;
        const hasCustomData = customData.שידור || customData.מקוםשידור;
        
        // Complete: All 6 crew positions + custom data
        if (filledCrewPositions >= 6 && (hasCustomData || hasRootData)) return 'complete';
        // Partial: Some crew positions OR some custom data OR root data
        if (filledCrewPositions > 0 || hasCustomData || hasRootData) return 'partial';
        return 'empty';

      case 'mcr':
        // Check all possible data locations for MCR
        const mcrData = departmentData;
        const mcrCustomData = mcrData.customData || {};
        
        // Enhanced debug logging for MCR
        console.log(`🔍 MCR Debug for event ${event.id}:`, {
          mcrData,
          mcrCustomData,
          allKeys: Object.keys(mcrData),
          customDataKeys: Object.keys(mcrCustomData),
          hasRoutingPreset: mcrData.routingPreset || mcrData.routing_preset,
          hasDevices: mcrData.devices || mcrData.מכשירים
        });
        
        // Check Hebrew fields in customData
        const mcrFields = [
          mcrCustomData.מקור,
          mcrCustomData.גיבוי,
          mcrCustomData.מכשירים,
          mcrCustomData.ניתובים
        ].filter(field => field && field.trim() !== '');
        
        // Also check root level fields
        const rootMcrFields = [
          mcrData.מקור,
          mcrData.גיבוי,
          mcrData.מכשירים,
          mcrData.ניתובים
        ].filter(field => field && field.trim() !== '');
        
        // Check for other MCR data (including at event root)
        const hasRoutingData = mcrData.routingPreset || mcrData.routing_preset || 
                              mcrData.routingData?.selectedPreset || event.routingPreset;
        const hasDevicesData = mcrData.devices || mcrData.devicesData?.primaryDevices?.length > 0 ||
                              metadata.mcrDevices?.length > 0;
        const hasCameramanData = mcrCustomData.cameramanData?.length > 0 || mcrData.cameramanData?.length > 0;
        
        const totalFields = Math.max(mcrFields.length, rootMcrFields.length);
        
        console.log(`🔍 MCR Status calculation:`, {
          mcrFieldsCount: mcrFields.length,
          rootMcrFieldsCount: rootMcrFields.length,
          hasRoutingData,
          hasDevicesData,
          hasCameramanData
        });
        
        // Complete: Multiple fields filled
        if (totalFields >= 4 || (totalFields >= 2 && (hasRoutingData || hasDevicesData))) return 'complete';
        // Partial: Any field filled
        if (totalFields > 0 || hasRoutingData || hasDevicesData || hasCameramanData) return 'partial';
        
        // Check if notApplicable is true
        if (mcrCustomData.notApplicable || mcrData.notApplicable) return 'complete';
        
        return 'empty';

      case 'external-broadcasts':
        // Check all possible data locations
        const externalData = departmentData;
        const externalCustomData = externalData.customData || {};
        
        // Check multiple data locations (including event root)
        const productionCrew = externalCustomData.productionCrew || 
                              externalData.productionCrew || 
                              externalData.production_crew || 
                              event.production_crew || [];
        const equipmentList = externalCustomData.equipmentList || 
                             externalData.equipmentList || 
                             externalData.equipment_list || 
                             event.equipment_list || [];
        
        console.log(`🔍 External Broadcasts Debug:`, {
          externalData,
          externalCustomData,
          productionCrewLength: productionCrew.length,
          equipmentListLength: equipmentList.length,
          customDataKeys: Object.keys(externalCustomData)
        });
        
        // Check if notApplicable
        if (externalCustomData.notApplicable || externalData.notApplicable) return 'complete';
        
        // Complete: Both crew and equipment with reasonable amounts
        if (productionCrew.length >= 2 && equipmentList.length >= 1) return 'complete';
        // Partial: Either crew or equipment
        if (productionCrew.length > 0 || equipmentList.length > 0) return 'partial';
        
        return 'empty';

      case 'closed-captions':
        // Check all possible data locations
        const captionsData = departmentData;
        const captionsCustomData = captionsData.customData || {};
        
        // Check multiple locations for caption type
        const captionType = captionsCustomData.captionType || 
                           captionsData.captionType || 
                           captionsData.subtitles ||
                           event.subtitles;
        
        console.log(`🔍 Closed Captions Debug:`, {
          captionsData,
          captionType
        });
        
        // Check if notApplicable
        if (captionsCustomData.notApplicable || captionsData.notApplicable) return 'complete';
        
        // If there's a caption type that's not None, show as complete
        if (captionType && captionType !== 'None' && captionType !== '') return 'complete';
        
        return 'empty';

      case 'warehouse':
        // Check all possible data locations
        const warehouseData = departmentData;
        const warehouseCustomData = warehouseData.customData || {};
        
        // Also check metadata.warehouseData location (for backward compatibility)
        const warehouseDataFromMetadata = metadata.warehouseData || {};
        const warehouseDataFromMetadataCustom = warehouseDataFromMetadata.customData || {};
        
        // Check multiple locations for SCANNED items (not requested items!)
        const assignedItems = warehouseCustomData.assignedItems || 
                             warehouseData.assignedItems || 
                             warehouseDataFromMetadataCustom.assignedItems ||
                             warehouseDataFromMetadata.assignedItems ||
                             [];
        
        // Get the actual count of scanned items
        const totalScanned = warehouseCustomData.totalAssigned || 
                            warehouseData.totalAssigned || 
                            warehouseDataFromMetadataCustom.totalAssigned ||
                            warehouseDataFromMetadata.totalAssigned ||
                            assignedItems.length;
        
        console.log(`🔍 Warehouse Debug:`, {
          warehouseData,
          warehouseCustomData,
          assignedItems,
          assignedItemsLength: assignedItems.length,
          totalScanned,
          totalRequested: warehouseCustomData.totalRequested || warehouseData.totalRequested
        });
        
        // Check if notApplicable
        if (warehouseCustomData.notApplicable || 
            warehouseData.notApplicable || 
            warehouseDataFromMetadataCustom.notApplicable || 
            warehouseDataFromMetadata.notApplicable) {
          return 'complete';
        }
        
        // Complete: 3+ items scanned, Partial: 1-2 items
        if (totalScanned >= 3 || assignedItems.length >= 3) return 'complete';
        if (totalScanned > 0 || assignedItems.length > 0) return 'partial';
        
        return 'empty';



      default:
        return 'empty';
    }
  };

  // Function to get color and icon based on status
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
    // Removed playout - it's now a bulk action in the main page
  ];

  const handleDepartmentClick = (dept: Department) => {
    setSelectedDepartment(dept);
  };

  const handleDepartmentModalClose = () => {
    setSelectedDepartment(null);
    // Refresh parent data when modal closes
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
      const departmentData = {
        department: selectedDepartment,
        ...data,
      };

      // Map department-specific data to database fields
      const updateData: any = {};

      switch (selectedDepartment) {
        case 'broadcast-array':
          // Save all broadcast array fields
          const broadcastArrayData = {
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
              'broadcastArray': broadcastArrayData
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
          updateData.production_crew = data.productionCrew;
          updateData.equipment_list = data.selectedEquipment;
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
        title={`ניהול אירוע: ${event?.hebrewTitle || event?.title || 'אירוע שידור'}`}
        open={visible && selectedDepartment !== 'rundown'}
        onCancel={onClose}
        footer={null}
        width={800}
      >
        <div className="text-center mb-4">
          <p className="text-gray-600">בחר מחלקה לעדכון פרטי האירוע</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const status = getDataStatus(dept.key);
            const statusStyle = getStatusStyle(status);
            
            // Debug logging
            console.log(`Department: ${dept.key}, Status: ${status}, Style:`, statusStyle);
            
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

      {/* Department-specific modals */}
      {selectedDepartment === 'broadcast-array' && (
        <BroadcastArrayModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onSave={handleDepartmentSave}
          onDataSaved={onDataSaved}
        />
      )}

      {selectedDepartment === 'mcr' && (
        <MCRModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
        />
      )}

      {selectedDepartment === 'external-broadcasts' && (
        <ExternalBroadcastsModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
        />
      )}

      {selectedDepartment === 'closed-captions' && (
        <ClosedCaptionsModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
        />
      )}

      {selectedDepartment === 'warehouse' && (
        <WarehouseModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
        />
      )}

      {selectedDepartment === 'rundown' && (
        <RundownModal
          visible={true}
          event={event}
          onClose={handleDepartmentModalClose}
          onDataSaved={onDataSaved}
        />
      )}
    </>
  );
};

export default BroadcastEventModal; 