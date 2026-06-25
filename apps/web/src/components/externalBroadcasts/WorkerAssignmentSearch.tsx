'use client';

/**
 * Read-only worker assignment search.
 *
 * Adapts the legacy `search_imp.php` workflow. Searches across External
 * Broadcasts events for any worker name and shows the events where they
 * appear. This view is strictly read-only — it never modifies people
 * assignment. The data source is the existing `productionCrew` and
 * `dynamicJobs` metadata that the people-assignment workflow already
 * writes.
 */
import React, { useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useLazyQuery } from '@apollo/client';
import dayjs, { Dayjs } from 'dayjs';
import { GET_EXTERNAL_BROADCAST_WORKER_ASSIGNMENTS } from '@/graphql/queries';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

export const WorkerAssignmentSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().subtract(1, 'month'),
    dayjs().add(1, 'month'),
  ]);

  const [search, { data, loading }] = useLazyQuery(
    GET_EXTERNAL_BROADCAST_WORKER_ASSIGNMENTS,
    { fetchPolicy: 'network-only' },
  );

  const handleSearch = () => {
    if (!query.trim()) return;
    search({
      variables: {
        query: query.trim(),
        startDate: range?.[0]?.toISOString() || null,
        endDate: range?.[1]?.toISOString() || null,
      },
    });
  };

  const rows = data?.externalBroadcastWorkerAssignments || [];

  return (
    <Card style={{ direction: 'rtl' }}>
      <Title level={4}>
        <UserOutlined /> חיפוש שיבוצי עובד (קריאה בלבד)
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        חיפוש זה אינו משנה שיבוצי אנשים — הוא רק מציג היכן העובד הוקצה בשידורי חוץ.
      </Text>

      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder="שם עובד / מזהה"
            prefix={<SearchOutlined />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
          />
        </Col>
        <Col>
          <RangePicker
            value={range as any}
            onChange={(v) => setRange(v as any)}
            format="DD/MM/YYYY"
          />
        </Col>
        <Col>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
            חפש
          </Button>
        </Col>
      </Row>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      )}

      {!loading && rows.length === 0 && data && (
        <Empty description="לא נמצאו שיבוצים לעובד זה" />
      )}

      {rows.length > 0 && (
        <Table
          rowKey={(r: any) => `${r.eventId}-${r.workerName}-${r.roleLabel || ''}`}
          dataSource={rows}
          size="small"
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: 'עובד',
              dataIndex: 'workerName',
              key: 'workerName',
              render: (v: string) => <Tag color="blue">{v}</Tag>,
            },
            {
              title: 'תפקיד',
              dataIndex: 'roleLabel',
              key: 'roleLabel',
              render: (v: string | null) => v || <Text type="secondary">-</Text>,
            },
            {
              title: 'תאריך',
              key: 'date',
              render: (_: any, r: any) =>
                r.startTime ? dayjs(r.startTime).format('DD/MM/YYYY') : '-',
            },
            {
              title: 'יום',
              key: 'day',
              render: (_: any, r: any) =>
                r.startTime ? dayjs(r.startTime).format('dddd') : '-',
            },
            {
              title: 'שעות',
              key: 'time',
              render: (_: any, r: any) => {
                if (!r.startTime) return '-';
                const start = dayjs(r.startTime).format('HH:mm');
                const end = r.endTime ? dayjs(r.endTime).format('HH:mm') : '';
                return end ? `${start} - ${end}` : start;
              },
            },
            { title: 'שידור', dataIndex: 'eventTitle', key: 'eventTitle' },
            { title: 'ערוץ', dataIndex: 'channel', key: 'channel' },
            { title: 'ליגה', dataIndex: 'league', key: 'league' },
            { title: 'מיקום', dataIndex: 'location', key: 'location' },
          ]}
        />
      )}
    </Card>
  );
};
