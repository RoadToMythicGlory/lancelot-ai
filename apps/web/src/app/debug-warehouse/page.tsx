'use client';

import React from 'react';
import { useQuery } from '@apollo/client';
import { Card, Table, Tag, Space } from 'antd';
import { GET_BROADCAST_EVENTS } from '../../graphql/queries';
import dayjs from 'dayjs';

const DebugWarehousePage = () => {
  const { data, loading } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: dayjs().subtract(30, 'days').toISOString(),
      endDate: dayjs().add(30, 'days').toISOString()
    }
  });

  const events = data?.broadcastEvents || [];

  const getWarehouseStatus = (event: any) => {
    const metadata = event.metadata || {};
    
    // Check all locations for warehouse data
    const warehouseData = metadata.departments?.warehouse || {};
    const warehouseCustomData = warehouseData.customData || {};
    const warehouseDataFromMetadata = metadata.warehouseData || {};
    const warehouseDataFromMetadataCustom = warehouseDataFromMetadata.customData || {};
    
    // Check multiple locations for SCANNED items
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
    
    // Check if notApplicable
    if (warehouseCustomData.notApplicable || 
        warehouseData.notApplicable || 
        warehouseDataFromMetadataCustom.notApplicable || 
        warehouseDataFromMetadata.notApplicable) {
      return { status: 'complete', color: 'green', text: 'לא רלוונטי' };
    }
    
    // Status calculation
    if (totalScanned >= 3 || assignedItems.length >= 3) {
      return { status: 'complete', color: 'green', text: `מלא (${totalScanned})` };
    }
    if (totalScanned > 0 || assignedItems.length > 0) {
      return { status: 'partial', color: 'orange', text: `חלקי (${totalScanned})` };
    }
    
    return { status: 'empty', color: 'red', text: 'ריק' };
  };

  const columns = [
    {
      title: 'אירוע',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: any) => (
        <div>
          <strong>{record.hebrewTitle || title}</strong>
          <br />
          <small>{dayjs(record.startTime).format('DD/MM HH:mm')}</small>
        </div>
      )
    },
    {
      title: 'סטטוס מחסן',
      key: 'warehouse',
      render: (_: any, record: any) => {
        const status = getWarehouseStatus(record);
        return <Tag color={status.color}>{status.text}</Tag>;
      }
    },
    {
      title: 'equipment_list',
      key: 'equipment_list',
      render: (_: any, record: any) => (
        <span>{record.equipment_list?.length || 0}</span>
      )
    },
    {
      title: 'warehouse.assignedItems',
      key: 'warehouse_assigned',
      render: (_: any, record: any) => {
        const warehouseData = record.metadata?.departments?.warehouse;
        const assignedCount = warehouseData?.assignedItems?.length || 
                             warehouseData?.customData?.assignedItems?.length || 0;
        return <span>{assignedCount}</span>;
      }
    },
    {
      title: 'warehouse.totalAssigned',
      key: 'warehouse_total',
      render: (_: any, record: any) => {
        const warehouseData = record.metadata?.departments?.warehouse;
        const total = warehouseData?.totalAssigned || 
                     warehouseData?.customData?.totalAssigned || 0;
        return <span>{total}</span>;
      }
    },
    {
      title: 'warehouseData (legacy)',
      key: 'legacy',
      render: (_: any, record: any) => {
        const legacyData = record.metadata?.warehouseData;
        const assignedCount = legacyData?.assignedItems?.length || 
                             legacyData?.customData?.assignedItems?.length || 0;
        return <span>{assignedCount}</span>;
      }
    },
    {
      title: 'Debug Data',
      key: 'debug',
      width: 300,
      render: (_: any, record: any) => (
        <pre style={{ fontSize: '10px', margin: 0 }}>
          {JSON.stringify({
            equipment_list: record.equipment_list?.length || 0,
            warehouse: record.metadata?.departments?.warehouse,
            warehouseData: record.metadata?.warehouseData
          }, null, 2)}
        </pre>
      )
    }
  ];

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <Card title="Debug Warehouse Status">
        <p>This page shows all locations where equipment data might be stored</p>
        <Table
          dataSource={events}
          columns={columns}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

export default DebugWarehousePage; 