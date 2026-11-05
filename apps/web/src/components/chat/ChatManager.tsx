'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { GET_AI_AGENT_USER, GET_AI_AGENT_STATUS } from '@/graphql/ai-queries';
import { Permission } from '@/rbac';
import { toast } from 'react-hot-toast';
import { computeFingerprint } from '@/utils/crypto/keys';
import {
  createMessageId,
  createReplayDetector,
  decryptChatPayload,
  encryptChatPayload,
  getOrCreateKeyPair,
  getStoredFingerprint,
  storeFingerprint,
} from '@/utils/crypto/e2ee';

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
  encryption?: {
    enabled: boolean;
    version: 1;
    senderPublicKeyFingerprint?: string;
  };
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
  const { user: currentUser, loading: authLoading, hasPermission } = useAuth();
  const isAuthenticated = !!currentUser && !authLoading;
  // The contacts list relies on the `users` query, which requires USERS_VIEW.
  // Roles without that permission (e.g. regular users) would otherwise hit the
  // server only to receive "Missing permission: USERS_VIEW" — skip the call
  // entirely so chat falls back to existing conversations + AI agent only.
  const canListUsers = isAuthenticated && hasPermission(Permission.USERS_VIEW);
  const { socket, isConnected } = useWebSocket(); // Use socket from context
  const { registerConversationHandler } = useChat();
  
  // State
  const [showContacts, setShowContacts] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [openConversations, setOpenConversations] = useState<OpenConversation[]>([]);
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const replayDetector = useMemo(() => createReplayDetector(), []);
  const e2eeEnabled = process.env.NEXT_PUBLIC_ENABLE_E2EE_CHAT === 'true';
  const e2eeFallbackWarning = process.env.NEXT_PUBLIC_E2EE_FALLBACK_WARNING === 'true';
  
  // Refs
  const nextPositionRef = useRef({ x: 0, y: 0 });
  const isCleaningUpRef = useRef(false);
  
  // GraphQL queries
  const { data: usersData } = useQuery(GET_USERS, {
    variables: { isActive: true },
    skip: !canListUsers || !currentUser?.id,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    onError: (error) => {
      // Silently handle permission errors — many roles (e.g. MCR Operator)
      // don't have USERS_VIEW; the chat list is just empty for them.
      if (
        error.message.includes('Unauthorized') ||
        error.message.includes('Missing permission') ||
        error.message.includes('Not authenticated')
      ) {
        return;
      }
      console.error('Error fetching users:', error);
    }
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

  // Fetch AI Agent user
  const { data: aiUserData } = useQuery(GET_AI_AGENT_USER, {
    skip: !isAuthenticated,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  // Fetch AI Agent status
  const { data: aiStatusData } = useQuery(GET_AI_AGENT_STATUS, {
    skip: !isAuthenticated,
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000, // Poll every 30 seconds
    errorPolicy: 'all',
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

    const handleNewMessage = async (message: PrivateMessage) => {
      console.log('📨 New private message received:', message);

      if (message.encryption?.enabled && message.messageType === 'encrypted') {
        try {
          const keyPair = await getOrCreateKeyPair(currentUser.id);
          const encrypted = JSON.parse(message.message) as { senderPublicKey: string };

          if (message.encryption.senderPublicKeyFingerprint) {
            const storedFingerprint = await getStoredFingerprint(message.fromUserId);
            const currentFingerprint = await computeFingerprint(encrypted.senderPublicKey);

            if (storedFingerprint && storedFingerprint !== currentFingerprint) {
              if (e2eeFallbackWarning) {
                toast.error('זוהתה החלפת מפתח. ההודעה נחסמה.');
              }
              return;
            }

            if (!storedFingerprint) {
              await storeFingerprint(message.fromUserId, currentFingerprint);
            }
          }

          const payload = decryptChatPayload({
            encrypted: JSON.parse(message.message),
            recipientSecretKey: keyPair.secretKey,
            expectedSenderId: message.fromUserId,
            expectedConversationId: message.conversationId,
          });

          if (payload.senderId !== message.fromUserId || payload.conversationId !== message.conversationId) {
            console.error('[E2EE] Envelope mismatch for message', message.id);
            return;
          }

          const isReplay = await replayDetector.checkReplay(payload.conversationId, payload.messageId);
          if (isReplay) {
            console.warn('[E2EE] Replay detected:', payload.messageId);
            return;
          }

          message.message = payload.text;
          message.id = payload.messageId;
          message.createdAt = payload.createdAt;
        } catch (error) {
          console.error('[E2EE] Failed to decrypt message:', error);
          return;
        }
      }

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
  }, [socket, isConnected, currentUser?.id, refetchConversations, replayDetector, e2eeFallbackWarning]);

  // Load users from database (including AI agent)
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const users: User[] = [];
      
      // Add AI agent user first if available
      if (aiUserData?.aiAgentUser) {
        const aiUser = aiUserData.aiAgentUser;
        const isAIOnline = aiStatusData?.aiAgentStatus?.isOnline ?? false;
        
        users.push({
          id: aiUser.id,
          fullName: aiUser.displayName || 'Lancelot AI',
          displayName: aiUser.displayName || 'Lancelot AI',
          email: aiUser.email,
          department: 'AI_ASSISTANT',
          role: 'AI Agent',
          status: isAIOnline ? 'online' : 'offline',
          isAIAgent: true,
        });
      }
      
      // Add regular users
      if (usersData?.users) {
        const regularUsers = usersData.users
          .filter((user: any) => user.id !== currentUser.id && user.email !== 'lancelot-ai@internal.system')
          .map((user: any) => ({
            id: user.id,
            fullName: user.displayName || `${user.firstName} ${user.lastName}`,
            displayName: user.displayName || `${user.firstName} ${user.lastName}`,
            email: user.email,
            department: user.department,
            role: user.role,
            publicKey: user.publicKey,
            publicKeyFingerprint: user.publicKeyFingerprint,
            status: user.lastLogin && new Date(user.lastLogin) > new Date(Date.now() - 24 * 60 * 60 * 1000) 
              ? 'online' 
              : 'offline',
            isAIAgent: false,
          }));
        users.push(...regularUsers);
      }
      
      setOnlineUsers(users);
    }
  }, [usersData, aiUserData, aiStatusData, isAuthenticated, currentUser]);

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
  const handleSendMessage = useCallback(async (conversationId: string, message: string) => {
    if (!socket || !isConnected || !currentUser) return;

    const targetConversation = openConversations.find(conv => conv.conversationId === conversationId);
    const recipient = targetConversation?.otherUser;

    // Track E2EE fallback reason so the server can log a tripwire
    let e2eeFallbackReason: string | undefined;

    if (e2eeEnabled && recipient?.publicKey) {
      try {
        const keyPair = await getOrCreateKeyPair(currentUser.id);
        const storedFingerprint = await getStoredFingerprint(recipient.id);
        const recipientFingerprint = recipient.publicKeyFingerprint;

        if (storedFingerprint && recipientFingerprint && storedFingerprint !== recipientFingerprint) {
          e2eeFallbackReason = 'key_fingerprint_mismatch';
          if (e2eeFallbackWarning) {
            toast.error('מפתח הצפנה השתנה. עברנו לצ\'אט לא מוצפן.');
          }
        } else {
          const payload = {
            text: message,
            conversationId,
            senderId: currentUser.id,
            messageId: createMessageId(),
            createdAt: new Date().toISOString(),
          };

          const encrypted = encryptChatPayload({
            payload,
            recipientPublicKey: recipient.publicKey,
            senderSecretKey: keyPair.secretKey,
            senderPublicKey: keyPair.publicKey,
          });

          if (!storedFingerprint && recipientFingerprint) {
            await storeFingerprint(recipient.id, recipientFingerprint);
          }

          const senderFingerprint = await computeFingerprint(keyPair.publicKey);

          socket.emit('send-private-message', {
            conversationId,
            message: JSON.stringify(encrypted),
            messageType: 'encrypted',
            messageId: payload.messageId,
            encryption: {
              enabled: true,
              version: 1,
              senderPublicKeyFingerprint: senderFingerprint,
            },
          });
          return;
        }
      } catch (error) {
        console.error('[E2EE] Failed to encrypt message:', error);
        e2eeFallbackReason = 'encryption_error';
        if (e2eeFallbackWarning) {
          toast.error('שגיאת הצפנה. שולח הודעה רגילה.');
        }
      }
    } else if (e2eeEnabled && e2eeFallbackWarning && recipient) {
      e2eeFallbackReason = 'recipient_no_public_key';
      toast.error('המשתמש לא תומך בהצפנה. שולח הודעה רגילה.');
    }

    socket.emit('send-private-message', {
      conversationId,
      message,
      messageType: 'text',
      // Include fallback metadata so the server can log a tripwire
      ...(e2eeFallbackReason ? { encryption: { enabled: false, version: 0, fallbackReason: e2eeFallbackReason } } : {}),
    });
  }, [
    socket,
    isConnected,
    currentUser,
    openConversations,
    e2eeEnabled,
    e2eeFallbackWarning,
  ]);

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
    registerConversationHandler((u, conversationId) => { void handleStartConversation(u as User, conversationId); });
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
              role: currentUser.systemRole,
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