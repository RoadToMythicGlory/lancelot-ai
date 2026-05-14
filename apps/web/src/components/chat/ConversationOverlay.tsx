'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Minus, X, Phone, Video, MoreHorizontal, Maximize2, Lock, Bot, Sparkles } from 'lucide-react';
import { Input, Button, Avatar, Card, Badge, Dropdown, MenuProps } from 'antd/es';
import { Socket } from 'socket.io-client';
import { useQuery, useMutation } from '@apollo/client';
import { 
  GET_CONVERSATION_MESSAGES, 
  SEND_PRIVATE_MESSAGE, 
  MARK_MESSAGES_AS_READ 
} from '../../graphql/chat-queries';
import { MessageCircle, CheckCheck } from 'lucide-react';

const { TextArea } = Input;

interface User {
  id: string;
  fullName: string;
  displayName?: string;
  email: string;
  department?: string;
  role?: string;
  status: string;
  publicKey?: string;
  publicKeyFingerprint?: string;
  isAIAgent?: boolean;
}

interface PrivateMessage {
  id: string;
  message: string;
  messageType: string;
  fromUserId: string;
  fromUserName: string;
  conversationId: string;
  isRead: boolean;
  createdAt: string;
}

interface TypingUser {
  userId: string;
  userName: string;
  conversationId: string;
}

interface ConversationOverlayProps {
  conversationId: string;
  otherUser: User;
  position: { x: number; y: number };
  isConnected: boolean;
  currentUser: User | null;
  socket: Socket | null;
  typingUsers: TypingUser[];
  onClose: () => void;
  onMinimize: () => void;
  onSendMessage: (conversationId: string, message: string) => void;
  onTyping: (conversationId: string, isTyping: boolean) => void;
}

const ConversationOverlay: React.FC<ConversationOverlayProps> = ({
  conversationId,
  otherUser,
  position,
  isConnected,
  currentUser,
  socket,
  typingUsers,
  onClose,
  onMinimize,
  onSendMessage,
  onTyping
}) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(position);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isTyping = typingUsers.some(user => user.conversationId === conversationId && user.userId !== currentUser?.id);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const e2eeEnabled = process.env.NEXT_PUBLIC_ENABLE_E2EE_CHAT === 'true';
  const e2eeAvailable = e2eeEnabled && !!otherUser.publicKey;
  const isAIConversation = otherUser.isAIAgent || otherUser.department === 'AI_ASSISTANT' || otherUser.email === 'lancelot-ai@internal.system';

  // GraphQL queries and mutations
  const { data, loading: isLoading, refetch } = useQuery(GET_CONVERSATION_MESSAGES, {
    variables: { conversationId, limit: 50, offset: 0 },
    skip: !conversationId,
    fetchPolicy: 'cache-and-network'
  });

  const [markAsRead] = useMutation(MARK_MESSAGES_AS_READ, {
    variables: { conversationId }
  });

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load messages from GraphQL query
  useEffect(() => {
    if (data?.conversationMessages) {
      setMessages(data.conversationMessages.map((msg: any) => ({
        id: msg.id,
        message: msg.message,
        messageType: msg.messageType,
        fromUserId: msg.fromUser.id,
        fromUserName: msg.fromUser.displayName || msg.fromUser.fullName,
        conversationId,
        isRead: msg.isRead,
        createdAt: msg.createdAt
      })));
      setTimeout(scrollToBottom, 100);
    }
  }, [data, conversationId, scrollToBottom]);

  // Mark messages as read when conversation opens
  useEffect(() => {
    if (conversationId && !isLoading && messages.length > 0) {
      // Mark messages as read after a short delay
      const timer = setTimeout(() => {
        markAsRead().catch(console.error);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [conversationId, isLoading, messages.length, markAsRead]);

  // Join conversation room when component mounts
  useEffect(() => {
    if (socket && conversationId) {
      socket.emit('join-private-conversation', conversationId);
    }

    return () => {
      if (socket && conversationId) {
        socket.emit('leave-private-conversation', conversationId);
      }
    };
  }, [socket, conversationId]);

  // Listen for new messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMessage: PrivateMessage) => {
      if (newMessage.conversationId === conversationId) {
        setMessages(prev => [...prev, newMessage]);
        setTimeout(scrollToBottom, 100);
        
        // Mark as read if conversation is open and message is from other user
        if (newMessage.fromUserId !== currentUser?.id) {
          setTimeout(() => {
            markAsRead().catch(console.error);
          }, 500);
        }
      }
    };

    socket.on('new-private-message', handleNewMessage);

    return () => {
      socket.off('new-private-message', handleNewMessage);
    };
  }, [socket, conversationId, currentUser?.id, scrollToBottom, markAsRead]);

  // Handle sending messages
  const handleSendMessage = useCallback(() => {
    if (!message.trim() || !isConnected) return;

    onSendMessage(conversationId, message);
    setMessage('');
    
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    onTyping(conversationId, false);
  }, [message, isConnected, conversationId, onSendMessage, onTyping]);

  // Handle typing indicators
  const handleTyping = useCallback(() => {
    if (!isConnected) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Start typing
    onTyping(conversationId, true);

    // Auto-stop typing after 2 seconds
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(conversationId, false);
      typingTimeoutRef.current = null;
    }, 2000);
  }, [isConnected, conversationId, onTyping]);

  // Handle key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else {
      handleTyping();
    }
  }, [handleSendMessage, handleTyping]);

  // Custom dragging implementation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging from the header
    if ((e.target as HTMLElement).closest('.chat-header')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - currentPosition.x,
        y: e.clientY - currentPosition.y
      });
      e.preventDefault();
    }
  }, [currentPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Keep window within viewport bounds
      const maxX = window.innerWidth - 384; // 384px = w-96
      const maxY = window.innerHeight - 500;
      
      setCurrentPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, dragStart]);

  // Focus text area when component mounts
  useEffect(() => {
    setTimeout(() => {
      textAreaRef.current?.focus();
    }, 100);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('he-IL', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const isMyMessage = (msg: PrivateMessage) => {
    return msg.fromUserId === currentUser?.id;
  };

  // Dropdown menu items
  const menuItems: MenuProps['items'] = [
    {
      key: 'call',
      icon: <Phone size={16} />,
      label: 'התקשר',
      disabled: true
    },
    {
      key: 'video',
      icon: <Video size={16} />,
      label: 'שיחת וידאו',
      disabled: true
    },
    {
      type: 'divider'
    },
    {
      key: 'block',
      label: 'חסום משתמש',
      danger: true,
      disabled: true
    }
  ];

  const handleMinimize = () => {
    setIsMinimized(true);
  };

  return (
    <div 
      ref={overlayRef}
      className={`fixed z-50 ${isMinimized ? 'w-auto' : 'w-96'} ${isMinimized ? 'h-auto' : 'h-[500px]'} bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300`}
      style={{
        left: `${currentPosition.x}px`,
        top: `${currentPosition.y}px`,
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
        border: '1px solid rgba(0, 0, 0, 0.08)'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className={`chat-header cursor-move ${
        isAIConversation 
          ? 'bg-gradient-to-r from-purple-500 to-indigo-600' 
          : 'bg-gradient-to-r from-blue-500 to-blue-600'
      } text-white p-4 rounded-t-2xl flex items-center justify-between select-none`}>
        <div className="flex items-center space-x-3">
          <div className="relative">
            {isAIConversation ? (
              <Avatar 
                size={40} 
                className="bg-white text-purple-600 font-semibold shadow-md"
                icon={<Bot size={24} />}
              />
            ) : (
              <Avatar 
                size={40} 
                className="bg-white text-blue-600 font-semibold shadow-md"
              >
                {otherUser.fullName ? otherUser.fullName.split(' ').map(n => n[0]).join('').toUpperCase() : '?'}
              </Avatar>
            )}
            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
              otherUser.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
            }`} />
          </div>
          <div>
            <h3 className="font-semibold text-base">{otherUser.fullName || 'Unknown User'}</h3>
            <p className="text-xs opacity-90 flex items-center gap-2">
              <span>{isTyping ? 'מקליד...' : otherUser.status === 'online' ? 'פעיל עכשיו' : 'לא פעיל'}</span>
              <span className="inline-flex items-center gap-1">
                <Lock size={12} className={e2eeAvailable ? 'text-white' : 'text-white/60'} />
                <span>{e2eeAvailable ? 'E2EE פעיל' : 'ללא הצפנה'}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <Button
            type="text"
            size="small"
            icon={isMinimized ? <Maximize2 size={18} /> : <Minus size={18} />}
            onClick={handleMinimize}
            className="text-white hover:bg-white/20 rounded-lg"
          />
          <Button
            type="text"
            size="small"
            icon={<X size={18} />}
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg"
          />
        </div>
      </div>

      {/* Messages Container */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  {isAIConversation ? (
                    <>
                      <div className="relative mx-auto mb-3">
                        <Bot size={48} className="text-purple-400" />
                        <Sparkles size={20} className="absolute -top-1 -right-1 text-yellow-400" />
                      </div>
                      <p className="text-gray-600 font-medium">שלום! אני Lancelot AI</p>
                      <p className="text-gray-400 text-sm mt-1">
                        אפשר לשאול אותי איך עובדת המערכת או על מידע חי מהמסד.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-[300px] mx-auto">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">בניית רנדאון</span>
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">גרפיקה</span>
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">משמרות</span>
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">חדשות</span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">איך משהו עובד?</span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">איזה ציוד למשחק מרכזי?</span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">כמה מצלמות פנויות?</span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">מתי המשמרת שלי?</span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">מה משדרים היום?</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <MessageCircle size={48} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500">התחל שיחה עם {otherUser.fullName || 'Unknown User'}</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isOwnMessage = message.fromUserId === currentUser?.id;
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                  >
                    <div className={`max-w-[70%] ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                      <div
                        className={`px-4 py-2.5 rounded-2xl shadow-sm ${
                          isOwnMessage
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-sm'
                            : isAIConversation
                              ? 'bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-gray-800 rounded-bl-sm'
                              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                        }`}
                      >
                        {isAIConversation && !isOwnMessage && (
                          <div className="flex items-center gap-1 mb-1 text-purple-600">
                            <Bot size={12} />
                            <span className="text-xs font-medium">Lancelot AI</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
                      </div>
                      <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-xs text-gray-400">
                          {new Date(message.createdAt).toLocaleTimeString('he-IL', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {isOwnMessage && message.isRead && (
                          <CheckCheck size={14} className="text-blue-500" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-100 bg-white rounded-b-2xl">
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-end space-x-2">
              <Input.TextArea
                ref={textAreaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="הקלד הודעה..."
                autoSize={{ minRows: 1, maxRows: 4 }}
                className="flex-1 resize-none rounded-2xl bg-gray-100 border-0 px-4 py-2.5 text-sm hover:bg-gray-200 focus:bg-gray-200"
                style={{ 
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}
              />
              <Button
                type="primary"
                htmlType="submit"
                disabled={!message.trim()}
                icon={<Send size={18} />}
                className={`rounded-full h-10 w-10 flex items-center justify-center shadow-lg transform transition-all ${
                  message.trim() 
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 scale-100' 
                    : 'bg-gray-300 scale-95'
                }`}
                style={{ border: 'none' }}
              />
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default ConversationOverlay; 