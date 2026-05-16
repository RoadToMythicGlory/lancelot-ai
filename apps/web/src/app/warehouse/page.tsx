'use client';

import React, { useMemo, useState } from 'react';
import { Alert, List, Card, Input, Button, Space, Tag, Row, Col, Empty, App, Breadcrumb, Select, Statistic, Tabs, DatePicker, Modal } from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  HomeOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  PlusOutlined,
  ExportOutlined,
  ToolOutlined,
  HistoryOutlined,
  CalendarOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  FilePdfOutlined,
  EnvironmentOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT, GET_WAREHOUSE_EQUIPMENT_STATS, GET_BROADCAST_EVENTS, GET_STALE_EQUIPMENT } from '../../graphql/queries';
import Link from 'next/link';
import EquipmentRegistrationModal from '../../components/warehouse/EquipmentRegistrationModal';
import EquipmentEditModal from '../../components/warehouse/EquipmentEditModal';
import EquipmentReturnModal from '../../components/warehouse/EquipmentReturnModal';
import EquipmentDetailsModal from '../../components/warehouse/EquipmentDetailsModal';
import EquipmentQuantityAdjustment from '../../components/warehouse/EquipmentQuantityAdjustment';
import EquipmentDisableModal from '../../components/warehouse/EquipmentDisableModal';
import VendorManagement from '../../components/warehouse/VendorManagement';
import UpcomingEvents from '../../components/warehouse/UpcomingEvents';
import ExternalBroadcastRequests from '../../components/warehouse/ExternalBroadcastRequests';
import WarehousePdfImportModal from '../../components/warehouse/WarehousePdfImportModal';
import EquipmentSetsManager from '../../components/warehouse/EquipmentSetsManager';
import EquipmentLiveTracking from '../../components/warehouse/tracking/EquipmentLiveTracking';
import InternalAssignmentsTab from '../../components/warehouse/internalAssignments/InternalAssignmentsTab';
import dayjs from 'dayjs';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useDebouncedValue } from '@/hooks/useDebounce';

const { RangePicker } = DatePicker;

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand: string;
  barcode: string;
  status: 'available' | 'assigned' | 'maintenance';
  condition: string;
  quantityAvailable: number;
  quantityTotal: number;
  quantityAssigned: number;
  currentLocation: string;
  price: number;
  purchaseDate: string;
  warrantyExpiryDate: string;
  company: string;
  equipmentModel: string;
  contactPerson: string;
  manualLink: string;
  imageUrl: string;
  storage: {
    row: string;
    shelf: string;
    cell: string;
  };
  isQuantityBased: boolean;
  isSharedEngineeringEquipment?: boolean;
  isDisabled: boolean;
  disabledAt?: string;
  disabledReason?: string;
  suspensionStatus?: string;
  lastUsedAt?: string;
}

/** Avoid crashes when metadata lists are missing or not arrays */
function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function legacyEquipmentStrings(equipmentList: unknown): string[] {
  if (Array.isArray(equipmentList)) {
    return equipmentList.filter((x): x is string => typeof x === 'string');
  }
  if (typeof equipmentList === 'string' && equipmentList.trim()) {
    return [equipmentList];
  }
  return [];
}

const WarehousePage: React.FC = () => {
  const { message } = App.useApp();
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isRegistrationModalVisible, setIsRegistrationModalVisible] = useState(false);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isQuantityAdjustmentVisible, setIsQuantityAdjustmentVisible] = useState(false);
  const [isDisableModalVisible, setIsDisableModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('equipment');
  const [isPdfImportVisible, setIsPdfImportVisible] = useState(false);
  const [isStaleModalVisible, setIsStaleModalVisible] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().subtract(30, 'days'),
    dayjs().add(30, 'days')
  ]);

  const dateRangeValid = Boolean(dateRange[0] && dateRange[1]);
  const debouncedSearchText = useDebouncedValue(searchText.trim(), 300);
  const equipmentFilter = useMemo(() => {
    const filter: Record<string, string> = {};
    if (debouncedSearchText) filter.searchText = debouncedSearchText;
    if (selectedCategory !== 'all') filter.category = selectedCategory;
    if (selectedStatus !== 'all') filter.status = selectedStatus;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }, [debouncedSearchText, selectedCategory, selectedStatus]);

  // Query for warehouse equipment
  const { data: equipmentData, loading: equipmentLoading, error: equipmentError, refetch } = useQuery(GET_WAREHOUSE_EQUIPMENT, {
    variables: {
      filter: equipmentFilter,
      limit: 500,
      offset: 0,
    },
    fetchPolicy: 'cache-and-network',
  });
  const equipment: Equipment[] = equipmentData?.warehouseEquipment || [];
  const { data: equipmentStatsData } = useQuery(GET_WAREHOUSE_EQUIPMENT_STATS, {
    variables: { filter: equipmentFilter },
    fetchPolicy: 'cache-and-network',
  });

  // Stale equipment (unused 14+ days)
  const { data: staleData } = useQuery(GET_STALE_EQUIPMENT, { variables: { daysUnused: 14 } });
  const staleEquipment: Equipment[] = staleData?.staleEquipment || [];
  const staleCount = staleEquipment.length;

  // Query for broadcast events with equipment (skip if tab inactive or range cleared — avoids huge unbounded fetches and stale-cache confusion)
  const { data: eventsData, loading: eventsLoading, error: eventsError } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: dateRangeValid ? dateRange[0]!.toISOString() : undefined,
      endDate: dateRangeValid ? dateRange[1]!.toISOString() : undefined
    },
    skip: activeTab !== 'history' || !dateRangeValid
  });

  // Get unique categories for filter
  const categories = Array.from(new Set(equipment.map(e => e.category))).filter(Boolean);

  // Reset to first page whenever filters/search change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchText, selectedCategory, selectedStatus]);

  // Filter equipment based on search and filters
  const filteredEquipment = equipment.filter(item => {
    // Exclude disabled equipment by default unless specifically filtered
    if (item.isDisabled && selectedStatus !== 'disabled' && selectedStatus !== 'under_maintenance') {
      return false;
    }
    
    const q = debouncedSearchText.toLowerCase();
    const matchesSearch = !debouncedSearchText ||
      String(item.name ?? '').toLowerCase().includes(q) ||
      String(item.barcode ?? '').toLowerCase().includes(q) ||
      String(item.brand ?? '').toLowerCase().includes(q) ||
      String(item.company ?? '').toLowerCase().includes(q) ||
      String(item.equipmentModel ?? '').toLowerCase().includes(q);
    
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'disabled' ? item.isDisabled :
       selectedStatus === 'under_maintenance' ? item.suspensionStatus === 'under_maintenance' :
       item.status === selectedStatus);
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const statistics = {
    totalEquipment: equipmentStatsData?.warehouseEquipmentStats?.totalEquipment ?? 0,
    totalAvailable: equipmentStatsData?.warehouseEquipmentStats?.totalAvailable ?? 0,
    totalAssigned: equipmentStatsData?.warehouseEquipmentStats?.totalAssigned ?? 0,
    totalMaintenance: equipmentStatsData?.warehouseEquipmentStats?.totalMaintenance ?? 0,
    totalDisabled: equipmentStatsData?.warehouseEquipmentStats?.totalDisabled ?? 0,
  };

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

  const handleEquipmentClick = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setIsDetailsModalVisible(true);
  };

  // Export equipment history to Excel
  const exportToExcel = (eventsWithEquipment: any[]) => {
    // Prepare data for export
    const exportData: any[] = [];
    
    eventsWithEquipment.forEach((event: any) => {
      // Extract equipment data from various sources
      const equipmentItems: any[] = [];

      // From warehouse metadata (permanent history)
      const warehouseData = event.metadata?.departments?.warehouse;
      const warehouseCustomData = warehouseData?.customData || {};
      
      // First check equipmentHistory (permanent record)
      const equipmentHistory = asArray(
        warehouseCustomData.equipmentHistory ?? warehouseData?.equipmentHistory
      );

      // If no history, fall back to current assignedItems
      const assignedItems = equipmentHistory.length > 0
        ? equipmentHistory
        : asArray(warehouseCustomData.assignedItems ?? warehouseData?.assignedItems);
      
      // Add items from history or current assignments
      assignedItems.forEach((item: any) => {
        equipmentItems.push({
          name: item.name || 'ציוד',
          type: item.action === 'returned' ? 'returned' : 'scanned',
          barcode: item.barcode,
          category: item.category,
          assignedAt: item.assignedAt || item.scannedAt,
          returnedAt: item.returnedAt
        });
      });
      
      // From external broadcasts (requested equipment)
      const externalBroadcastsData = event.metadata?.departments?.externalBroadcasts;
      const externalCustomData = externalBroadcastsData?.customData || {};
      const requestedEquipment = asArray(
        externalCustomData.equipmentList ?? externalBroadcastsData?.equipmentList
      );
      
      // Add requested equipment
      requestedEquipment.forEach((item: any) => {
        equipmentItems.push({
          name: item.name || 'ציוד מבוקש',
          type: 'requested',
          quantity: item.quantity,
          category: item.category
        });
      });
      
      // From legacy equipment_list field (string or string[])
      legacyEquipmentStrings(event.equipment_list).forEach((item: string) => {
        equipmentItems.push({
          name: item,
          type: 'legacy'
        });
      });
      
      // Check backward compatibility location
      const rootWarehouseData = event.metadata?.warehouseData;
      if (rootWarehouseData) {
        // Check history first
        const rootHistory = asArray(rootWarehouseData.equipmentHistory);
        if (rootHistory.length > 0) {
          rootHistory.forEach((item: any) => {
            equipmentItems.push({
              name: item.name || 'ציוד',
              type: item.action === 'returned' ? 'returned' : 'scanned',
              barcode: item.barcode,
              category: item.category,
              assignedAt: item.assignedAt || item.scannedAt,
              returnedAt: item.returnedAt
            });
          });
        } else if (rootWarehouseData.assignedItems) {
          // Fall back to assigned items if no history
          asArray(rootWarehouseData.assignedItems).forEach((item: any) => {
            equipmentItems.push({
              name: item.name || 'ציוד',
              type: 'scanned',
              barcode: item.barcode,
              category: item.category
            });
          });
        }
      }
      
      // Add each equipment item as a row
      equipmentItems.forEach((item: any) => {
        exportData.push({
          'מספר אירוע': event.eventNumber || '',
          'שם האירוע': event.title || event.hebrewTitle || '',
          'ערוץ': event.channel || '',
          'תאריך אירוע': event.startTime && dayjs(event.startTime).isValid()
            ? dayjs(event.startTime).format('DD/MM/YYYY')
            : '',
          'שעת התחלה': event.startTime && dayjs(event.startTime).isValid()
            ? dayjs(event.startTime).format('HH:mm')
            : '',
          'שעת סיום': event.endTime && dayjs(event.endTime).isValid()
            ? dayjs(event.endTime).format('HH:mm')
            : '',
          'מיקום': event.location || event.venue || '',
          'שם ציוד': item.name || '',
          'ברקוד': item.barcode || '',
          'קטגוריה': item.category || '',
          'כמות': item.quantity || 1,
          'סטטוס': item.type === 'returned' ? 'הוחזר' : item.type === 'requested' ? 'מבוקש' : 'מוקצה',
          'תאריך הקצאה': item.assignedAt && dayjs(item.assignedAt).isValid()
            ? dayjs(item.assignedAt).format('DD/MM/YYYY HH:mm')
            : '',
          'תאריך החזרה': item.returnedAt && dayjs(item.returnedAt).isValid()
            ? dayjs(item.returnedAt).format('DD/MM/YYYY HH:mm')
            : ''
        });
      });
    });
    
    // Convert data to CSV format
    if (exportData.length === 0) {
      message.warning('אין נתונים לייצוא');
      return;
    }
    
    // Create CSV content with BOM for Hebrew support
    const headers = Object.keys(exportData[0]);
    const csvContent = '\ufeff' + // BOM for UTF-8
      headers.join(',') + '\n' +
      exportData.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape quotes and handle commas
          const stringValue = String(value || '');
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      ).join('\n');
    
    // Create filename with date range
    const startDateStr = (dateRange[0] ?? dayjs().subtract(30, 'days')).format('DD.MM.YYYY');
    const endDateStr = (dateRange[1] ?? dayjs().add(30, 'days')).format('DD.MM.YYYY');
    const filename = `רשימות ציוד שהוקצה תאריכים - ${startDateStr}-${endDateStr}.csv`;

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      message.success(`הקובץ "${filename}" יורד כעת`);
    }
  };

  const renderEquipmentTab = () => (
    <>
      {/* Statistics Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={4}>
          <Card>
            <Statistic
              title="סה״כ ציוד פעיל"
              value={statistics.totalEquipment}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="ציוד זמין"
              value={statistics.totalAvailable}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="ציוד מוקצה"
              value={statistics.totalAssigned}
              prefix={<InboxOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="בתחזוקה"
              value={statistics.totalMaintenance}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="ציוד מושבת"
              value={statistics.totalDisabled}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="ניהול ציוד מחסן"
        description="לחץ על כל פריט ציוד כדי לראות פרטים מלאים, אירועים פעילים והיסטוריית הקצאות."
        type="info"
        showIcon
        className="mb-6"
      />

      {staleCount > 0 && (
        <Alert
          message={`${staleCount} פריטי ציוד לא בשימוש מעל שבועיים`}
          description="ציוד שלא היה בשימוש במשך 14 יום ומעלה. לחץ כאן לצפייה ברשימה."
          type="warning"
          showIcon
          className="mb-6 cursor-pointer"
          onClick={() => setIsStaleModalVisible(true)}
        />
      )}

      {/* Filters and Search */}
      <Card className="mb-6">
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Input
              placeholder="חיפוש לפי שם, ברקוד או מותג"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="סנן לפי קטגוריה"
              style={{ width: '100%' }}
              value={selectedCategory}
              onChange={setSelectedCategory}
              suffixIcon={<FilterOutlined />}
            >
              <Select.Option value="all">כל הקטגוריות</Select.Option>
              {categories.map(cat => (
                <Select.Option key={cat} value={cat}>{cat}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <Select
              placeholder="סנן לפי סטטוס"
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={setSelectedStatus}
              suffixIcon={<FilterOutlined />}
            >
              <Select.Option value="all">כל הסטטוסים</Select.Option>
              <Select.Option value="available">זמין</Select.Option>
              <Select.Option value="assigned">מוקצה</Select.Option>
              <Select.Option value="maintenance">בתחזוקה</Select.Option>
              <Select.Option value="under_maintenance">בתחזוקה (השעיה)</Select.Option>
              <Select.Option value="disabled">מושבת</Select.Option>
            </Select>
          </Col>
          <Col span={4}>
            <Button 
              icon={<ClearOutlined />}
              onClick={() => {
                setSearchText('');
                setSelectedCategory('all');
                setSelectedStatus('all');
              }}
            >
              נקה סינון
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Equipment List */}
      <Card 
        title={
          <span>
            <InboxOutlined className="ml-2" style={{ color: '#1890ff' }} />
            רשימת ציוד ({filteredEquipment.length} פריטים)
          </span>
        }
      >
        {equipmentLoading ? (
          <div className="text-center py-8">טוען נתוני ציוד...</div>
        ) : equipmentError ? (
          <Alert message="שגיאה בטעינת נתוני ציוד" type="error" showIcon />
        ) : filteredEquipment.length === 0 ? (
          <Empty description="לא נמצא ציוד תואם לחיפוש" />
        ) : (
          <List
            dataSource={filteredEquipment}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredEquipment.length,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} מתוך ${total} פריטים`,
              onChange: (page, size) => {
                setCurrentPage(page);
                if (size !== pageSize) {
                  setPageSize(size);
                  setCurrentPage(1);
                }
              },
              position: 'both',
            }}
            renderItem={(item) => (
              <List.Item
                className="hover:bg-gray-50 transition-colors"
                actions={[
                  ...(item.isQuantityBased ? [<Button
                    key="adjust"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipment(item);
                      setIsQuantityAdjustmentVisible(true);
                    }}
                  >
                    התאם כמות
                  </Button>] : []),
                  <Button
                    key="edit"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipment(item);
                      setIsEditModalVisible(true);
                    }}
                  >
                    עריכה
                  </Button>,
                  <Button
                    key="disable"
                    size="small"
                    danger={item.isDisabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipment(item);
                      setIsDisableModalVisible(true);
                    }}
                  >
                    {item.isDisabled ? 'הפעל' : 'השבת'}
                  </Button>,
                  <Button
                    key="details"
                    size="small"
                    type="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEquipmentClick(item);
                    }}
                  >
                    פרטים
                  </Button>
                ]}
              >
                <div className="w-full cursor-pointer" onClick={() => handleEquipmentClick(item)}>
                  <div className="flex justify-between items-center mb-2">
                    <Space>
                      <strong className="text-lg">{item.name}</strong>
                      <Tag color="blue">{item.category}</Tag>
                      <Tag color={getStatusColor(item.status)}>
                        {getStatusText(item.status)}
                      </Tag>
                      {item.isDisabled && (
                        <Tag color="red">מושבת</Tag>
                      )}
                      {item.isSharedEngineeringEquipment && (
                        <Tag color="purple">ציוד הנדסה שיתופי</Tag>
                      )}
                      {item.suspensionStatus && (
                        <Tag color="volcano">
                          {item.suspensionStatus === 'under_maintenance' ? 'בתחזוקה' :
                           item.suspensionStatus === 'broken' ? 'תקול' :
                           item.suspensionStatus === 'lost' ? 'אבד' :
                           item.suspensionStatus === 'reserved' ? 'משוריין' : 'אחר'}
                        </Tag>
                      )}
                      {item.condition && item.condition !== 'תקין' && (
                        <Tag color="warning">{item.condition}</Tag>
                      )}
                    </Space>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{item.barcode}</code>
                  </div>
                  <div className="text-sm text-gray-500 flex justify-between">
                    <Space>
                      {item.brand && <span>מותג: {item.brand}</span>}
                      {item.equipmentModel && <span>| דגם: {item.equipmentModel}</span>}
                      <span>| זמין: {item.quantityAvailable}/{item.quantityTotal}</span>
                      {item.quantityAssigned > 0 && (
                        <span className="text-blue-600">| מוקצה: {item.quantityAssigned}</span>
                      )}
                    </Space>
                    {item.currentLocation && (
                      <span>מיקום: {item.currentLocation}</span>
                    )}
                  </div>
                  {item.isDisabled && item.disabledReason && (
                    <div className="text-sm text-red-600 mt-1">
                      סיבת השבתה: {item.disabledReason}
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </>
  );

  const renderHistoryTab = () => {
    const events = !dateRangeValid ? [] : (eventsData?.broadcastEvents || []);

    // Filter events that have equipment - check multiple sources
    const eventsWithEquipment = events.filter((event: any) => {
      // Check warehouse department data in metadata (this is where WarehouseModal saves data)
      const warehouseData = event.metadata?.departments?.warehouse;
      const warehouseCustomData = warehouseData?.customData || {};

      // Check for equipment history (permanent record)
      const equipmentHistory = asArray(
        warehouseCustomData.equipmentHistory ?? warehouseData?.equipmentHistory
      );

      if (equipmentHistory.length > 0) {
        return true;
      }

      // Also check current assigned items
      const assignedItems = asArray(
        warehouseCustomData.assignedItems ?? warehouseData?.assignedItems
      );

      if (assignedItems.length > 0) {
        return true;
      }

      // Check external broadcasts equipment list
      const externalBroadcastsData = event.metadata?.departments?.externalBroadcasts;
      const externalCustomData = externalBroadcastsData?.customData || {};
      const equipmentList = asArray(
        externalCustomData.equipmentList ?? externalBroadcastsData?.equipmentList
      );

      if (equipmentList.length > 0) {
        return true;
      }

      // Check legacy equipment_list field
      if (legacyEquipmentStrings(event.equipment_list).length > 0) {
        return true;
      }

      // Check if metadata has warehouseData at root level (backward compatibility)
      const rootWarehouseData = event.metadata?.warehouseData;
      if (rootWarehouseData) {
        const rootHistory = asArray(rootWarehouseData.equipmentHistory);
        const rootAssigned = asArray(rootWarehouseData.assignedItems);
        if (rootHistory.length > 0 || rootAssigned.length > 0) {
          return true;
        }
      }

      return false;
    });

    return (
      <>
        <Alert
          message="היסטוריית ציוד לאירועים"
          description="רשימת כל האירועים עם ציוד מוקצה. בחר טווח תאריכים כדי לסנן את התוצאות."
          type="info"
          showIcon
          className="mb-6"
        />

        {/* Date Range Picker */}
        <Card className="mb-6">
          <Row gutter={16} align="middle">
            <Col span={12}>
              <Space>
                <CalendarOutlined />
                <span>בחר טווח תאריכים:</span>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                  format="DD/MM/YYYY"
                  placeholder={['תאריך התחלה', 'תאריך סיום']}
                />
              </Space>
            </Col>
            <Col span={12} className="text-left">
              <Space>
                <Tag color="blue">
                  {dateRangeValid ? `${eventsWithEquipment.length} אירועים עם ציוד` : 'בחר טווח תאריכים'}
                </Tag>
                <Button 
                  icon={<DownloadOutlined />}
                  onClick={() => exportToExcel(eventsWithEquipment)}
                  disabled={!dateRangeValid || eventsWithEquipment.length === 0}
                >
                  ייצוא CSV
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Events List */}
        <Card 
          title={
            <span>
              <HistoryOutlined className="ml-2" style={{ color: '#1890ff' }} />
              אירועים עם ציוד מוקצה
            </span>
          }
        >
          {!dateRangeValid ? (
            <Empty description="בחר תאריך התחלה ותאריך סיום כדי לטעון את רשימת האירועים" />
          ) : eventsLoading ? (
            <div className="text-center py-8">טוען נתוני אירועים...</div>
          ) : eventsError ? (
            <Alert message="שגיאה בטעינת נתוני אירועים" type="error" showIcon />
          ) : eventsWithEquipment.length === 0 ? (
            <Empty description="לא נמצאו אירועים עם ציוד בטווח התאריכים שנבחר" />
          ) : (
            <List
              dataSource={eventsWithEquipment}
              renderItem={(event: any) => {
                // Extract equipment data from various sources
                const equipmentItems: any[] = [];

                // From warehouse metadata (permanent history)
                const warehouseData = event.metadata?.departments?.warehouse;
                const warehouseCustomData = warehouseData?.customData || {};

                // First check equipmentHistory (permanent record)
                const equipmentHistory = asArray(
                  warehouseCustomData.equipmentHistory ?? warehouseData?.equipmentHistory
                );

                // If no history, fall back to current assignedItems
                const assignedItems = equipmentHistory.length > 0
                  ? equipmentHistory
                  : asArray(warehouseCustomData.assignedItems ?? warehouseData?.assignedItems);
                
                // Add items from history or current assignments
                assignedItems.forEach((item: any) => {
                  equipmentItems.push({
                    name: item.name || 'ציוד',
                    type: item.action === 'returned' ? 'returned' : 
                          item.action === 'transferred' ? 'transferred' : 'scanned',
                    barcode: item.barcode,
                    category: item.category,
                    assignedAt: item.assignedAt || item.scannedAt,
                    returnedAt: item.returnedAt,
                    transferredTo: item.transferredTo,
                    transferredAt: item.transferredAt
                  });
                });
                
                // From external broadcasts (requested equipment)
                const externalBroadcastsData = event.metadata?.departments?.externalBroadcasts;
                const externalCustomData = externalBroadcastsData?.customData || {};
                const requestedEquipment = asArray(
                  externalCustomData.equipmentList ?? externalBroadcastsData?.equipmentList
                );
                
                // Add requested equipment
                requestedEquipment.forEach((item: any) => {
                  equipmentItems.push({
                    name: item.name || 'ציוד מבוקש',
                    type: 'requested',
                    quantity: item.quantity,
                    category: item.category
                  });
                });
                
                // From legacy equipment_list field
                legacyEquipmentStrings(event.equipment_list).forEach((item: string) => {
                  equipmentItems.push({
                    name: item,
                    type: 'legacy'
                  });
                });
                
                // Check backward compatibility location
                const rootWarehouseData = event.metadata?.warehouseData;
                if (rootWarehouseData) {
                  // Check history first
                  const rootHistory = asArray(rootWarehouseData.equipmentHistory);
                  if (rootHistory.length > 0) {
                    rootHistory.forEach((item: any) => {
                      equipmentItems.push({
                        name: item.name || 'ציוד',
                        type: item.action === 'returned' ? 'returned' : 
                              item.action === 'transferred' ? 'transferred' : 'scanned',
                        barcode: item.barcode,
                        category: item.category,
                        assignedAt: item.assignedAt || item.scannedAt,
                        transferredTo: item.transferredTo,
                        transferredAt: item.transferredAt
                      });
                    });
                  } else if (rootWarehouseData.assignedItems) {
                    // Fall back to assigned items if no history
                    asArray(rootWarehouseData.assignedItems).forEach((item: any) => {
                      equipmentItems.push({
                        name: item.name || 'ציוד',
                        type: 'scanned',
                        barcode: item.barcode,
                        category: item.category
                      });
                    });
                  }
                }
                
                const startD = event.startTime ? dayjs(event.startTime) : null;
                const isUpcoming = startD?.isValid() ? startD.isAfter(dayjs()) : false;

                return (
                  <List.Item>
                    <div className="w-full">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <strong className="text-lg">{event.title || event.hebrewTitle}</strong>
                          {event.eventNumber && (
                            <span className="ml-2 text-sm text-gray-500">#{event.eventNumber}</span>
                          )}
                        </div>
                        <Space>
                          <Tag color={isUpcoming ? 'blue' : 'default'}>
                            {isUpcoming ? 'עתידי' : 'עבר'}
                          </Tag>
                          <Tag>{event.channel}</Tag>
                        </Space>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        <Space>
                          <CalendarOutlined />
                          {startD?.isValid()
                            ? startD.format('DD/MM/YYYY HH:mm')
                            : '—'}
                          {event.endTime && dayjs(event.endTime).isValid() &&
                            ` - ${dayjs(event.endTime).format('HH:mm')}`}
                          {event.location && <span>| {event.location}</span>}
                        </Space>
                      </div>
                      <div className="mt-2">
                        <strong className="text-sm">ציוד:</strong>
                        <div className="mt-1">
                          {equipmentItems.length > 0 ? (
                            equipmentItems.map((item: any, index: number) => (
                              <Tag 
                                key={index} 
                                className="mb-1"
                                color={
                                  item.type === 'returned' ? 'orange' : 
                                  item.type === 'transferred' ? 'purple' :
                                  item.type === 'scanned' ? 'green' : 
                                  item.type === 'requested' ? 'blue' : 
                                  'default'
                                }
                              >
                                {item.name}
                                {item.quantity && item.quantity > 1 && ` (${item.quantity})`}
                                {item.barcode && ` - ${item.barcode}`}
                                {item.type === 'returned' && ' (הוחזר)'}
                                {item.type === 'transferred' && item.transferredTo && ` (הועבר ל: ${item.transferredTo})`}
                              </Tag>
                            ))
                          ) : (
                            <span className="text-gray-500 text-sm">אין מידע על ציוד</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Card>
      </>
    );
  };

  return (
    <ProtectedRoute requires={Permission.WAREHOUSE_VIEW}>
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumb 
          className="mb-4"
          items={[
            {
              title: (
                <Link href="/">
                  <HomeOutlined /> בית
                </Link>
              ),
            },
            {
              title: 'מחסן',
            },
          ]}
        />

        {/* Page Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <InboxOutlined />
                מחסן - ניהול ציוד
              </h1>
              <p className="text-gray-600 mt-2">ניהול ציוד וצפייה בהיסטוריית הקצאות</p>
            </div>
            {activeTab === 'equipment' && (
              <Space>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  size="large"
                  onClick={() => setIsRegistrationModalVisible(true)}
                >
                  רשום ציוד חדש
                </Button>
                <Button 
                  type="default" 
                  icon={<ExportOutlined />}
                  size="large"
                  onClick={() => setIsReturnModalVisible(true)}
                  style={{ marginLeft: 8 }}
                >
                  החזרת ציוד
                </Button>
                <Button
                  icon={<FilePdfOutlined />}
                  size="large"
                  onClick={() => setIsPdfImportVisible(true)}
                  style={{ marginLeft: 8 }}
                >
                  ייבוא PDF ציוד
                </Button>
              </Space>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'equipment',
              label: (
                <span>
                  <InboxOutlined />
                  רשימת ציוד
                </span>
              ),
              children: renderEquipmentTab(),
            },
            {
              key: 'history',
              label: (
                <span>
                  <HistoryOutlined />
                  היסטוריית ציוד לאירועים
                </span>
              ),
              children: renderHistoryTab(),
            },
            {
              key: 'internal-assignments',
              label: (
                <span>
                  <UserSwitchOutlined />
                  הקצאות פנימיות
                </span>
              ),
              children: <InternalAssignmentsTab />,
            },
            {
              key: 'vendors',
              label: (
                <span>
                  <PhoneOutlined />
                  ניהול ספקים
                </span>
              ),
              children: <VendorManagement />,
            },
            {
              key: 'upcoming-events',
              label: (
                <span>
                  <CalendarOutlined />
                  אירועים קרובים
                </span>
              ),
              children: <UpcomingEvents />,
            },
            {
              key: 'equipment-sets',
              label: (
                <span>
                  <InboxOutlined />
                  סטים / פריסטים
                </span>
              ),
              children: <EquipmentSetsManager />,
            },
            {
              key: 'external-requests',
              label: (
                <span>
                  <ToolOutlined />
                  בקשות שידורי חוץ
                </span>
              ),
              children: <ExternalBroadcastRequests message={message} />,
            },
            {
              key: 'tracking',
              label: (
                <span>
                  <EnvironmentOutlined />
                  מעקב חי
                </span>
              ),
              children: <EquipmentLiveTracking />,
            },
          ]}
        />

        {/* Equipment Registration Modal */}
        <EquipmentRegistrationModal
          visible={isRegistrationModalVisible}
          onClose={() => setIsRegistrationModalVisible(false)}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Equipment Return Modal */}
        <EquipmentReturnModal
          visible={isReturnModalVisible}
          onClose={() => setIsReturnModalVisible(false)}
          onSuccess={() => {
            refetch();
            message.success('הציוד הוחזר בהצלחה');
          }}
        />

        {/* Equipment Details Modal */}
        <EquipmentDetailsModal
          visible={isDetailsModalVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsDetailsModalVisible(false);
            setSelectedEquipment(null);
          }}
          onEdit={() => {
            setIsDetailsModalVisible(false);
            setIsEditModalVisible(true);
          }}
        />

        {/* Equipment Edit Modal */}
        <EquipmentEditModal
          visible={isEditModalVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsEditModalVisible(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Equipment Quantity Adjustment Modal */}
        <EquipmentQuantityAdjustment
          visible={isQuantityAdjustmentVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsQuantityAdjustmentVisible(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Equipment Disable/Enable Modal */}
        <EquipmentDisableModal
          visible={isDisableModalVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsDisableModalVisible(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* PDF Equipment Import Modal */}
        <WarehousePdfImportModal
          visible={isPdfImportVisible}
          onClose={() => setIsPdfImportVisible(false)}
          onSuccess={() => {
            message.success('רשימת הציוד לאירוע נשמרה בהצלחה');
          }}
        />

        {/* Stale Equipment Modal (unused 14+ days) */}
        <Modal
          title={
            <span>
              <ExclamationCircleOutlined style={{ color: '#faad14', marginInlineEnd: 8 }} />
              ציוד לא בשימוש מעל שבועיים ({staleCount})
            </span>
          }
          open={isStaleModalVisible}
          onCancel={() => setIsStaleModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setIsStaleModalVisible(false)}>
              סגור
            </Button>,
          ]}
          width={800}
        >
          {staleEquipment.length === 0 ? (
            <Empty description="אין פריטי ציוד שאינם בשימוש" />
          ) : (
            <List
              dataSource={staleEquipment}
              renderItem={(item) => {
                const lastUsed = item.lastUsedAt && dayjs(item.lastUsedAt).isValid()
                  ? dayjs(item.lastUsedAt)
                  : null;
                const daysUnused = lastUsed ? dayjs().diff(lastUsed, 'day') : null;
                return (
                  <List.Item
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setIsStaleModalVisible(false);
                      handleEquipmentClick(item);
                    }}
                    actions={[
                      <Button
                        key="details"
                        size="small"
                        type="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsStaleModalVisible(false);
                          handleEquipmentClick(item);
                        }}
                      >
                        פרטים
                      </Button>,
                    ]}
                  >
                    <div className="w-full">
                      <div className="flex justify-between items-center mb-1">
                        <Space>
                          <strong>{item.name}</strong>
                          {item.category && <Tag color="blue">{item.category}</Tag>}
                          <Tag color={getStatusColor(item.status)}>
                            {getStatusText(item.status)}
                          </Tag>
                          {item.isDisabled && <Tag color="red">מושבת</Tag>}
                        </Space>
                        {item.barcode && (
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">{item.barcode}</code>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {lastUsed
                          ? `שימוש אחרון: ${lastUsed.format('DD/MM/YYYY')}${daysUnused !== null ? ` (לפני ${daysUnused} ימים)` : ''}`
                          : 'לא נרשם שימוש'}
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Modal>
      </div>
    </div>
    </ProtectedRoute>
  );
};

export default WarehousePage; 