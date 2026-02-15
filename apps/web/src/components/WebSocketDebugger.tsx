'use client';

import React, { useState, useEffect } from 'react';
import { Card, Badge, Collapse, Typography, Tag } from 'antd';
import { WifiOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useWebSocket } from '@/contexts/WebSocketContext';

const { Panel } = Collapse;
const { Text } = Typography;

export const WebSocketDebugger: React.FC = () => {
  const { socket, connected } = useWebSocket();
  const [events, setEvents] = useState<Array<{ id: string; type: string; data: any; timestamp: Date }>>([]);

  useEffect(() => {
    if (!socket) return;

    // Listen to all events for debugging
    const onAnyEvent = (eventName: string, ...args: any[]) => {
      setEvents(prev => [...prev.slice(-19), {
        id: `${Date.now()}-${Math.random()}`,
        type: eventName,
        data: args,
        timestamp: new Date()
      }]);
    };

    // Store original emit function
    const originalEmit = socket.emit;
    
    // Override emit to capture outgoing events
    socket.emit = function(...args: any[]) {
      onAnyEvent('⬆️ ' + args[0], ...args.slice(1));
      return originalEmit.apply(socket, args as any);
    };

    // Listen to common events
    socket.onAny((eventName, ...args) => {
      onAnyEvent('⬇️ ' + eventName, ...args);
    });

    return () => {
      socket.emit = originalEmit;
      socket.offAny();
    };
  }, [socket]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('he-IL', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  return (
    <div className="fixed bottom-4 left-4 w-96 max-h-96 overflow-hidden z-50">
      <Card 
        size="small"
        title={
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <WifiOutlined className="text-green-500" />
                <Badge status="success" text="WebSocket מחובר" />
              </>
            ) : (
              <>
                <DisconnectOutlined className="text-red-500" />
                <Badge status="error" text="WebSocket מנותק" />
              </>
            )}
          </div>
        }
        className="shadow-lg"
      >
        <Collapse accordion size="small">
          <Panel header={`אירועים אחרונים (${events.length})`} key="events">
            <div className="max-h-60 overflow-y-auto">
              {events.map(event => (
                <div key={event.id} className="mb-2 p-2 bg-gray-50 rounded text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <Tag color={event.type.startsWith('⬆️') ? 'blue' : 'green'}>
                      {event.type}
                    </Tag>
                    <Text type="secondary">{formatTimestamp(event.timestamp)}</Text>
                  </div>
                  <pre className="overflow-x-auto text-xs">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </Panel>
        </Collapse>
      </Card>
    </div>
  );
};

