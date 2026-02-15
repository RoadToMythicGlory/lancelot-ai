'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button, Tooltip } from 'antd';
import ContactsOverlay from './ContactsOverlay';
import ConversationOverlay from './ConversationOverlay';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useChat } from '@/contexts/ChatContext';
import { useQuery, useMutation } from '@apollo/client';
import { GET_USERS } from '@/graphql/queries';
import { GET_MY_CONVERSATIONS as GET_PRIVATE_CONVERSATIONS, CREATE_PRIVATE_CONVERSATION } from '@/graphql/chat-queries';
import { toast } from 'react-hot-toast';

interface User {
  id: string;
  fullName: string;
  displayName?: string;
  email: string;
  department?: string;
  role?: string;
  status: string;
}

interface PrivateConversation {
  id: string;
  participant1: User;
  participant2: User;
  unreadCount: number;
  lastMessageAt?: string;
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

interface OpenConversation {
  conversationId: string;
  otherUser: User;
  position: { x: number; y: number };
  isMinimized: boolean;
}

interface TypingUser {
  userId: string;
  userName: string;
  conversationId: string;
}

const ChatManager: React.FC = () => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const isAuthenticated = !!currentUser && !authLoading;
  const { socket, isConnected } = useWebSocket(); // Use socket from context
  const { registerConversationHandler } = useChat();
  
  // State
  const [showContacts, setShowContacts] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [openConversations, setOpenConversations] = useState<OpenConversation[]>([]);
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Refs
  const nextPositionRef = useRef({ x: 0, y: 0 });
  const isCleaningUpRef = useRef(false);
  
  // GraphQL queries
  const { data: usersData } = useQuery(GET_USERS, {
    variables: { isActive: true },
    skip: !isAuthenticated || !currentUser?.id,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  const { data: conversationsData, refetch: refetchConversations } = useQuery(GET_PRIVATE_CONVERSATIONS, {
    skip: !isAuthenticated || !currentUser?.id,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    onError: (error) => {
      // Only log error in development to avoid cluttering the console
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Chat] Failed to fetch conversations:', error.message);
      }
    }
  });

  const [createOrGetConversation] = useMutation(CREATE_PRIVATE_CONVERSATION, {
    errorPolicy: 'all',
    onError: (error) => {
      console.error('Error creating conversation:', error);
      toast.error('Failed to start conversation');
    }
  });
  
  // Computed values
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
  
  // Socket event handlers - using the shared WebSocket connection
  useEffect(() => {
    if (!socket || !isConnected || !currentUser) {
      console.log('💬 Socket not available or user not logged in');
      return;
    }

    console.log('💬 Setting up chat event handlers');

    const handleNewMessage = (message: PrivateMessage) => {
      console.log('📨 New private message received:', message);
      
      // Update the conversations list to reflect the new message
      setConversations(prev => {
        const updated = prev.map(conv => {
          if (conv.id === message.conversationId) {
            return {
              ...conv,
              lastMessage: message.message,
              lastMessageTime: message.createdAt,
              lastMessageSenderId: message.fromUserId,
              updatedAt: message.createdAt,
              unreadCount: conv.unreadCount + (message.fromUserId !== currentUser?.id ? 1 : 0)
            };
          }
          return conv;
        });
        return updated;
      });
      
      // Refresh conversations to get accurate data
      refetchConversations();
    };

    const handleUserTyping = (data: TypingUser) => {
      setTypingUsers(prev => {
        // Check if user is already typing in this conversation
        const exists = prev.find(u => u.userId === data.userId && u.conversationId === data.conversationId);
        if (!exists) {
          return [...prev, data];
        }
        return prev;
      });
    };

    const handleUserStopTyping = (data: { conversationId: string; userId: string }) => {
      setTypingUsers(prev => prev.filter(
        u => !(u.userId === data.userId && u.conversationId === data.conversationId)
      ));
    };

    // Register event handlers
    socket.on('new-private-message', handleNewMessage);
    socket.on('user-private-typing', handleUserTyping);
    socket.on('user-private-stop-typing', handleUserStopTyping);

    // Cleanup
    return () => {
      console.log('💬 Cleaning up chat event handlers');
      socket.off('new-private-message', handleNewMessage);
      socket.off('user-private-typing', handleUserTyping);
      socket.off('user-private-stop-typing', handleUserStopTyping);
    };
  }, [socket, isConnected, currentUser?.id, refetchConversations]);

  // Load users from database
  useEffect(() => {
    if (usersData?.users && isAuthenticated && currentUser) {
      // Filter out current user and set status
      const filteredUsers = usersData.users
        .filter((user: any) => user.id !== currentUser.id)
        .map((user: any) => ({
          id: user.id,
          fullName: user.displayName || `${user.firstName} ${user.lastName}`,
          displayName: user.displayName || `${user.firstName} ${user.lastName}`,
          email: user.email,
          department: user.department,
          role: user.role,
          status: user.lastLogin && new Date(user.lastLogin) > new Date(Date.now() - 24 * 60 * 60 * 1000) 
            ? 'online' 
            : 'offline'
        }));
      setOnlineUsers(filteredUsers);
    }
  }, [usersData, isAuthenticated, currentUser]);

  // Load conversations from database
  useEffect(() => {
    if (conversationsData?.privateConversations && currentUser) {
      const formattedConversations = conversationsData.privateConversations.map((conv: any) => {
        // Determine which participant is the other user
        const otherParticipant = conv.participant1.id === currentUser.id 
          ? conv.participant2 
          : conv.participant1;
          
        return {
          id: conv.id,
          participant1: {
            id: conv.participant1.id,
            fullName: conv.participant1.displayName || `${conv.participant1.firstName} ${conv.participant1.lastName}`,
            displayName: conv.participant1.displayName,
            email: conv.participant1.email,
            department: conv.participant1.department,
            status: 'online' // You can implement real online status here
          },
          participant2: {
            id: conv.participant2.id,
            fullName: conv.participant2.displayName || `${conv.participant2.firstName} ${conv.participant2.lastName}`,
            displayName: conv.participant2.displayName,
            email: conv.participant2.email,
            department: conv.participant2.department,
            status: 'online' // You can implement real online status here
          },
          unreadCount: conv.unreadCount,
          lastMessageAt: conv.lastMessageAt
        };
      });
      setConversations(formattedConversations);
    }
  }, [conversationsData, currentUser]);

  // Calculate position for new conversation windows (Facebook Messenger style)
  const calculateNextPosition = useCallback(() => {
    const WINDOW_WIDTH = 350;
    const WINDOW_HEIGHT = 500;
    const OFFSET = 30;
    const MARGIN = 20;
    
    // Start from bottom-right corner, moving left and up
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = viewportWidth - WINDOW_WIDTH - MARGIN - (openConversations.length * (WINDOW_WIDTH + MARGIN));
    let y = viewportHeight - WINDOW_HEIGHT - MARGIN;
    
    // If we run out of horizontal space, start a new row
    if (x < MARGIN) {
      x = viewportWidth - WINDOW_WIDTH - MARGIN;
      y -= WINDOW_HEIGHT + MARGIN;
    }
    
    // Make sure we don't go above the screen
    if (y < MARGIN) {
      // Stack with offset
      x = nextPositionRef.current.x + OFFSET;
      y = nextPositionRef.current.y + OFFSET;
      
      // Reset if we're getting too far
      if (x > viewportWidth - WINDOW_WIDTH || y > viewportHeight - WINDOW_HEIGHT) {
        x = MARGIN;
        y = MARGIN;
      }
    }
    
    nextPositionRef.current = { x, y };
    return { x, y };
  }, [openConversations.length]);

  // Handle starting a conversation
  const handleStartConversation = useCallback(async (user: User, conversationId?: string) => {
    // If no conversation ID, create or get one from the database
    if (!conversationId) {
      try {
        const { data } = await createOrGetConversation({
          variables: { userId: user.id }
        });
        
        if (data?.createOrGetConversation) {
          conversationId = data.createOrGetConversation.id;
        }
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast.error('Failed to start conversation');
        return;
      }
    }
    
    // Check if conversation is already open
    const existing = openConversations.find(c => c.conversationId === conversationId);
    if (existing) {
      // Un-minimize if minimized
      setOpenConversations(prev => prev.map(c => 
        c.conversationId === conversationId ? { ...c, isMinimized: false } : c
      ));
      return;
    }
    
    // Calculate position for new window
    const position = calculateNextPosition();
    
    // Add new conversation
    setOpenConversations(prev => [...prev, {
      conversationId: conversationId!,
      otherUser: user,
      position,
      isMinimized: false
    }]);
    
    // Clear unread count for this conversation
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
    ));
    
    // Close contacts overlay
    setShowContacts(false);
  }, [openConversations, calculateNextPosition, createOrGetConversation]);

  // Handle sending message
  const handleSendMessage = useCallback((conversationId: string, message: string) => {
    if (!socket || !isConnected) return;
    
    socket.emit('send-private-message', {
      conversationId,
      message,
      messageType: 'text'
    });
  }, [socket, isConnected]);

  // Handle typing
  const handleTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (!socket || !isConnected) return;
    
    if (isTyping) {
      socket.emit('private-typing-start', { conversationId });
    } else {
      socket.emit('private-typing-stop', { conversationId });
    }
  }, [socket, isConnected]);

  // Handle closing conversation
  const handleCloseConversation = useCallback((conversationId: string) => {
    setOpenConversations(prev => prev.filter(c => c.conversationId !== conversationId));
  }, []);

  // Handle minimizing conversation
  const handleMinimizeConversation = useCallback((conversationId: string) => {
    setOpenConversations(prev => prev.map(c => 
      c.conversationId === conversationId ? { ...c, isMinimized: !c.isMinimized } : c
    ));
  }, []);

  const handleContactsClick = useCallback(() => {
    if (isConnected) {
      setShowContacts(true);
    } else {
      toast.error('Chat server not connected');
    }
  }, [isConnected]);

  // Register the conversation handler
  useEffect(() => {
    registerConversationHandler(handleStartConversation);
  }, [registerConversationHandler, handleStartConversation]);

  // Only render if user is authenticated
  if (!isAuthenticated || !currentUser) {
    return null;
  }

  return (
    <>
      {/* Chat Bubble - Always visible when logged in */}
      <div className="fixed bottom-6 left-6 z-50" data-chat-bubble>
        <Tooltip title={isConnected ? "פתח צ'אט" : "מתחבר..."} placement="right">
          <div className="relative">
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<MessageCircle size={28} />}
              onClick={handleContactsClick}
              disabled={!isConnected}
              className={`w-16 h-16 flex items-center justify-center shadow-2xl transform transition-all duration-200 hover:scale-110 ${
                isConnected 
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-0' 
                  : 'bg-gray-400 cursor-not-allowed border-0'
              }`}
              style={{
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
              }}
            />
            {totalUnreadCount > 0 && (
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-1.5 shadow-lg animate-pulse">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </div>
            )}
          </div>
        </Tooltip>
        
        {/* Connection status indicator */}
        <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-3 border-white shadow-sm ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
      </div>

      {/* Contacts Overlay */}
      <ContactsOverlay
        isVisible={showContacts}
        onClose={() => setShowContacts(false)}
        onlineUsers={onlineUsers}
        onStartConversation={handleStartConversation}
      />

      {/* Conversation Windows */}
      {openConversations.map((conv) => (
        !conv.isMinimized && (
          <ConversationOverlay
            key={conv.conversationId}
            conversationId={conv.conversationId}
            otherUser={conv.otherUser}
            position={conv.position}
            isConnected={isConnected}
            currentUser={currentUser ? {
              id: currentUser.id,
              email: currentUser.email,
              fullName: currentUser.displayName,
              displayName: currentUser.displayName,
              role: currentUser.role,
              department: currentUser.department,
              status: 'online' // Current user is always online
            } : null}
            socket={socket}
            typingUsers={typingUsers.filter(u => u.conversationId === conv.conversationId)}
            onClose={() => handleCloseConversation(conv.conversationId)}
            onMinimize={() => handleMinimizeConversation(conv.conversationId)}
            onSendMessage={handleSendMessage}
            onTyping={handleTyping}
          />
        )
      ))}

      {/* Minimized Conversations Bar (Facebook Messenger style) */}
      {openConversations.some(c => c.isMinimized) && (
        <div className="fixed bottom-6 right-20 flex items-end space-x-3 z-40">
          {openConversations
            .filter(c => c.isMinimized)
            .map((conv) => (
              <Tooltip key={conv.conversationId} title={conv.otherUser.fullName || 'Unknown User'} placement="top">
                <div className="relative group">
                  <Button
                    shape="circle"
                    size="large"
                    onClick={() => handleMinimizeConversation(conv.conversationId)}
                    className="w-14 h-14 flex items-center justify-center shadow-xl transform transition-all duration-200 hover:scale-110 bg-white hover:bg-gray-50 border border-gray-200"
                    style={{
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <span className="text-lg font-semibold text-gray-700">
                      {conv.otherUser.fullName ? conv.otherUser.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'}
                    </span>
                  </Button>
                  {/* Online status indicator */}
                  <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                    conv.otherUser.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  {/* Unread indicator */}
                  {(conversations.find(c => c.id === conv.conversationId)?.unreadCount || 0) > 0 && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
              </Tooltip>
            ))}
        </div>
      )}

      {/* Connection status notification */}
      {!isConnected && isAuthenticated && (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-300 text-yellow-800 px-5 py-3 rounded-xl shadow-lg backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            <div className="animate-spin w-5 h-5 border-3 border-yellow-600 border-t-transparent rounded-full" />
            <span className="font-medium">מתחבר לשרת הצ'אט...</span>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatManager; 