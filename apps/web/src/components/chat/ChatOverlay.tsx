'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, List, Avatar, Typography, Empty, App } from 'antd';
import { SendOutlined, UserOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { 
  GET_CONVERSATION_MESSAGES, 
  SEND_PRIVATE_MESSAGE,
  MARK_MESSAGES_AS_READ 
} from '../../graphql/chat-queries';

const { Text } = Typography;
const { TextArea } = Input;

interface Message {
  id: string;
  user: string;
  message: string;
  timestamp: string;
  avatar?: string;
  isRead?: boolean;
  senderId?: string;
}

interface ChatOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  conversationId: string;
  participantName: string;
  participantId: string;
}

export default function ChatOverlay({ 
  isVisible, 
  onClose, 
  conversationId, 
  participantName,
  participantId 
}: ChatOverlayProps) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { sendMessage: sendWebSocketMessage, isConnected } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // GraphQL queries and mutations
  const { data, loading, refetch } = useQuery(GET_CONVERSATION_MESSAGES, {
    variables: { conversationId },
    skip: !conversationId || !isVisible,
    fetchPolicy: 'cache-and-network'
  });

  const [sendMessage] = useMutation(SEND_PRIVATE_MESSAGE, {
    onCompleted: () => {
      setNewMessage('');
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה בשליחת הודעה: ${error.message}`);
    }
  });

  const [markAsRead] = useMutation(MARK_MESSAGES_AS_READ, {
    onError: (error) => {
      console.error('Error marking messages as read:', error);
    }
  });

  // Load messages from GraphQL data
  useEffect(() => {
    if (data?.conversationMessages) {
      const formattedMessages = data.conversationMessages.map((msg: any) => ({
        id: msg.id,
        user: msg.fromUser.id === user?.id ? 'אתה' : msg.fromUser.fullName || (msg.fromUser.firstName + ' ' + msg.fromUser.lastName),
        message: msg.message,
        timestamp: new Date(msg.createdAt).toLocaleTimeString('he-IL', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        isRead: msg.isRead,
        senderId: msg.fromUser.id
      }));
      setMessages(formattedMessages);
      
      // Mark messages as read when opening chat
      if (conversationId && user?.id) {
        markAsRead({
          variables: { conversationId }
        });
      }
    }
  }, [data, user?.id, conversationId, markAsRead]);

  // Listen for WebSocket messages
  useEffect(() => {
    const handleWebSocketMessage = (event: CustomEvent) => {
      const messageData = event.detail;
      
      // Check if message is for this conversation
      if (messageData.conversationId === conversationId) {
        const newMsg: Message = {
          id: messageData.id,
          user: messageData.senderId === user?.id ? 'אתה' : messageData.senderName,
          message: messageData.content,
          timestamp: new Date(messageData.createdAt).toLocaleTimeString('he-IL', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          senderId: messageData.senderId
        };
        
        setMessages(prev => [...prev, newMsg]);
        
        // Mark as read if conversation is open
        if (isVisible && messageData.senderId !== user?.id) {
          markAsRead({
            variables: { conversationId }
          });
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('websocket-chat-message', handleWebSocketMessage as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('websocket-chat-message', handleWebSocketMessage as EventListener);
      }
    };
  }, [conversationId, user?.id, isVisible, markAsRead]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user?.id) return;

    try {
      // Send message via GraphQL
      await sendMessage({
        variables: {
          conversationId,
          message: newMessage.trim(),
          messageType: 'text'
        }
      });

      // Send real-time notification via WebSocket
      if (isConnected && user) {
        sendWebSocketMessage({
          type: 'chat_message',
          data: {
            conversationId,
            receiverId: participantId,
            senderId: user.id,
            senderName: user.displayName || 'משתמש',
            content: newMessage.trim(),
            timestamp: new Date().toISOString()
          }
        });
      }

    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card 
        className="w-full max-w-2xl h-96 flex flex-col"
        title={
          <div className="flex items-center justify-between">
            <span>צ'אט עם {participantName}</span>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <span className="text-green-500 text-xs">● מחובר</span>
              ) : (
                <span className="text-red-500 text-xs">● לא מחובר</span>
              )}
              <Button 
                type="text" 
                icon={<CloseOutlined />} 
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400"
              />
            </div>
          </div>
        }
        styles={{ 
          body: { 
            padding: 0, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column' 
          } 
        }}
      >
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-500 dark:text-gray-400">טוען הודעות...</div>
          ) : messages.length === 0 ? (
            <Empty 
              description="אין הודעות עדיין"
              imageStyle={{ height: 60 }}
            />
          ) : (
            <div>
              <List
                dataSource={messages}
                renderItem={(msg) => (
                  <List.Item key={msg.id} className="border-none">
                    <List.Item.Meta
                      avatar={<Avatar icon={<UserOutlined />} />}
                      title={
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{msg.user}</span>
                          <Text type="secondary" className="text-xs">
                            {msg.timestamp}
                          </Text>
                        </div>
                      }
                      description={
                        <div className={`p-2 rounded mt-1 ${
                          msg.senderId === user?.id 
                            ? 'bg-blue-50 text-blue-900' 
                            : 'bg-gray-50'
                        }`}>
                          {msg.message}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <TextArea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="הקלד הודעה..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              className="flex-1"
              disabled={!user?.id}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || !user?.id}
              loading={loading}
            >
              שלח
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
} 