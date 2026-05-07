'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Space, Tag, Divider, message } from 'antd';
import { ReloadOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export default function DebugAuthPage() {
  const [authLogs, setAuthLogs] = useState<any[]>([]);
  const [protectedRouteLogs, setProtectedRouteLogs] = useState<any[]>([]);
  const [apolloErrors, setApolloErrors] = useState<any[]>([]);
  const [dashboardLogs, setDashboardLogs] = useState<any[]>([]);
  const [apolloRequests, setApolloRequests] = useState<any[]>([]);
  const [, forceUpdate] = useState({});

  const loadLogs = () => {
    const auth = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
    const protectedRoute = JSON.parse(sessionStorage.getItem('protectedRouteDebug') || '[]');
    const apollo = JSON.parse(sessionStorage.getItem('apolloAuthErrors') || '[]');
    const dashboard = JSON.parse(sessionStorage.getItem('dashboardDebugLogs') || '[]');
    const requests = JSON.parse(sessionStorage.getItem('apolloRequestLogs') || '[]');
    setAuthLogs(auth);
    setProtectedRouteLogs(protectedRoute);
    setApolloErrors(apollo);
    setDashboardLogs(dashboard);
    setApolloRequests(requests);
    forceUpdate({});
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const clearLogs = () => {
    sessionStorage.removeItem('authDebugLogs');
    sessionStorage.removeItem('protectedRouteDebug');
    sessionStorage.removeItem('apolloAuthErrors');
    sessionStorage.removeItem('dashboardDebugLogs');
    sessionStorage.removeItem('apolloRequestLogs');
    loadLogs();
  };

  const copyLogsToClipboard = async () => {
    const allLogs = {
      timestamp: new Date().toISOString(),
      currentUrl: typeof window !== 'undefined' ? window.location.href : 'SSR',
      authLogs,
      protectedRouteLogs,
      apolloErrors,
      dashboardLogs,
      apolloRequests,
      localStorage: {
        'auth-token': typeof window !== 'undefined' ? localStorage.getItem('auth-token')?.substring(0, 50) + '...' : null
      }
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(allLogs, null, 2));
      message.success('Logs copied to clipboard!');
    } catch (err) {
      message.error('Failed to copy logs to clipboard');
      console.error('Copy failed:', err);
    }
  };

  const getEventColor = (event: string) => {
    const colorMap: Record<string, string> = {
      'AUTH_PROVIDER_MOUNTED': 'blue',
      'CHECK_AUTH_START': 'orange',
      'TOKEN_CHECK': 'purple',
      'USER_SET': 'green',
      'NO_VALID_TOKEN': 'red',
      'AUTH_ERROR': 'red',
      'AUTH_CHECK_COMPLETE': 'cyan',
      'REDIRECT_TO_LOGIN': 'red',
    };
    return colorMap[event] || 'default';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <Title level={1}>🔍 Auth Debug Logs</Title>
        <Paragraph>
          This page shows persistent authentication logs stored in sessionStorage.
          These logs persist even after page redirects.
        </Paragraph>

        <Space className="mb-4">
          <Button icon={<ReloadOutlined />} onClick={loadLogs}>
            Refresh Logs
          </Button>
          <Button icon={<CopyOutlined />} onClick={copyLogsToClipboard} type="primary">
            Copy Logs to Clipboard
          </Button>
          <Button icon={<DeleteOutlined />} danger onClick={clearLogs}>
            Clear All Logs
          </Button>
        </Space>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Auth Context Logs */}
          <Card title="Auth Context Logs" className="overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {authLogs.length === 0 ? (
                <Text type="secondary">No auth logs found</Text>
              ) : (
                authLogs.map((log, index) => (
                  <div key={index} className="mb-3 p-2 bg-gray-50 rounded">
                    <Tag color={getEventColor(log.event)}>{log.event}</Tag>
                    <Text type="secondary" className="text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </Text>
                    <pre className="text-xs mt-1 overflow-x-auto">
                      {JSON.stringify(log, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Protected Route Logs */}
          <Card title="Protected Route Logs" className="overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {protectedRouteLogs.length === 0 ? (
                <Text type="secondary">No protected route logs found</Text>
              ) : (
                protectedRouteLogs.map((log, index) => (
                  <div key={index} className="mb-3 p-2 bg-gray-50 rounded">
                    {log.event && (
                      <Tag color={getEventColor(log.event)}>{log.event}</Tag>
                    )}
                    <Text type="secondary" className="text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </Text>
                    <pre className="text-xs mt-1 overflow-x-auto">
                      {JSON.stringify(log, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Divider />

        <Card title="Current State" className="mt-4">
          <Space direction="vertical" className="w-full">
            <div>
              <Text strong>localStorage auth-token: </Text>
              <Text code>
                {typeof window !== 'undefined' && localStorage.getItem('auth-token')
                  ? localStorage.getItem('auth-token')?.substring(0, 50) + '...'
                  : 'null'}
              </Text>
            </div>
            <div>
              <Text strong>Current URL: </Text>
              <Text code>{typeof window !== 'undefined' ? window.location.href : 'SSR'}</Text>
            </div>
          </Space>
        </Card>

        {/* Apollo Authentication Errors */}
        <Card title="🚨 Apollo Authentication Errors" className="mt-4">
          <Space direction="vertical" className="w-full">
            {apolloErrors.length === 0 ? (
              <Text type="secondary">No Apollo authentication errors recorded</Text>
            ) : (
              apolloErrors.map((error: any, index: number) => (
                <Card 
                  key={index} 
                  size="small" 
                  style={{ backgroundColor: '#fff1f0', borderColor: '#ffccc7' }}
                >
                  <Space direction="vertical" className="w-full">
                    <Space>
                      <Tag color="red">APOLLO AUTH ERROR</Tag>
                      <Text type="secondary">{new Date(error.timestamp).toLocaleTimeString()}</Text>
                    </Space>
                    <Text strong>Operation: {error.operation || 'Unknown'}</Text>
                    <Text>Message: {error.message}</Text>
                    {error.path && <Text type="secondary">Path: {JSON.stringify(error.path)}</Text>}
                    {error.token && <Text type="secondary">Token present: Yes ({error.token})</Text>}
                    <details>
                      <summary style={{ cursor: 'pointer' }}>Full Error Details</summary>
                      <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                        {JSON.stringify(error, null, 2)}
                      </pre>
                    </details>
                  </Space>
                </Card>
              ))
            )}
          </Space>
        </Card>

        {/* Apollo Request Logs */}
        <Card title="📡 Apollo Request Logs" className="mt-4">
          <Space direction="vertical" className="w-full">
            {apolloRequests.length === 0 ? (
              <Text type="secondary">No Apollo requests recorded</Text>
            ) : (
              apolloRequests.map((request: any, index: number) => (
                <Card 
                  key={index} 
                  size="small" 
                  style={{ backgroundColor: request.hasToken ? '#f0f9ff' : '#fef3c7' }}
                >
                  <Space>
                    <Tag color={request.hasToken ? 'blue' : 'orange'}>
                      {request.operation || 'Unknown Operation'}
                    </Tag>
                    <Text type="secondary">{new Date(request.timestamp).toLocaleTimeString()}</Text>
                    {request.hasToken ? (
                      <Text type="success">Token: {request.tokenPreview}</Text>
                    ) : (
                      <Text type="danger">NO TOKEN</Text>
                    )}
                  </Space>
                </Card>
              ))
            )}
          </Space>
        </Card>

        <Card title="Instructions" className="mt-4">
          <ol>
            <li>Try to access the dashboard at <a href="/">Home</a></li>
            <li>If you get redirected to login, come back to this page</li>
            <li>The logs will show what happened during the authentication check</li>
            <li>Look for &quot;NO_VALID_TOKEN&quot; or &quot;REDIRECT_TO_LOGIN&quot; events</li>
            <li><strong>NEW:</strong> Apollo authentication errors will show which GraphQL query failed</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
