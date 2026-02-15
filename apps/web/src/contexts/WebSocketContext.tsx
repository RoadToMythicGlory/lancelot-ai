'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

type WebSocketContextValue = {
  socket: Socket | null;
  isConnected: boolean;
  connected: boolean; // Alias for compatibility
  sendMessage: (payload: unknown) => void;
};

const WebSocketContext = createContext<WebSocketContextValue>({
  socket: null,
  isConnected: false,
  connected: false,
  sendMessage: () => {},
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const didPollingFallbackRef = useRef(false);

  const connectSocket = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const url = process.env.NEXT_PUBLIC_CHAT_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    try {
      // Get the auth token from localStorage
      const token = localStorage.getItem('auth-token');
      
      // Only connect if we have a token
      if (!token) {
        console.log('[WebSocket] No auth token available, skipping connection');
        return;
      }
      
      console.log('[WebSocket] Attempting to connect to:', url);
      console.log('[WebSocket] Token length:', token.length);
      console.log('[WebSocket] Token preview:', token.substring(0, 50) + '...');
      
      // Helper to create a socket with given transports
      const createClient = (transports: Array<'websocket' | 'polling'>, upgrade = true) => io(url, {
        // Use trailing slash to match Nginx location and avoid rewrite edge-cases
        path: '/socket.io/',
        withCredentials: true,
        transports,
        upgrade,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 15000,
        forceNew: true,
        auth: { token }
      });

      // Force polling-only to avoid websocket upgrade errors behind strict proxies
      let s = createClient(['polling'], false);

      socketRef.current = s;
      setSocket(s);

      const handleConnect = () => {
        console.log('[WebSocket] ✅ Connected successfully');
        console.log('[WebSocket] Socket ID:', s.id);
        setIsConnected(true);
      };
      
      const handleDisconnect = (reason: string) => {
        console.log('[WebSocket] ❌ Disconnected:', reason);
        setIsConnected(false);
      };
      
      const handleConnectError = (error: any) => {
        console.error('[WebSocket] ❌ Connection error:', error?.message || error);
        console.error('[WebSocket] Error type:', error?.type);
        // Fallback to polling-only if websocket transport fails (common behind strict proxies)
        const msg = String(error?.message || '').toLowerCase();
        const type = String(error?.type || '').toLowerCase();
        if (!didPollingFallbackRef.current && (msg.includes('websocket') || type.includes('transporterror'))) {
          try {
            console.warn('[WebSocket] Retrying with polling-only transport');
            s.off('connect', handleConnect);
            s.off('disconnect', handleDisconnect);
            s.off('connect_error', handleConnectError);
            s.close();
          } catch {}
          didPollingFallbackRef.current = true;
          s = createClient(['polling'], false);
          socketRef.current = s;
          setSocket(s);
          s.on('connect', handleConnect);
          s.on('disconnect', handleDisconnect);
          s.on('connect_error', (e: any) => {
            console.error('[WebSocket] Polling-only connection error:', e?.message || e);
          });
        }
      };

      s.on('connect', handleConnect);
      s.on('disconnect', handleDisconnect);
      s.on('connect_error', handleConnectError);

      s.on('error', (error) => {
        console.error('[WebSocket] General error:', error);
      });
      
      // Debug auth handshake
      s.io.on('upgrade', (transport: any) => {
        console.log('[WebSocket] Transport upgraded to:', transport.name);
      });
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err);
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    // Connect when user logs in, disconnect when logs out
    if (user) {
      connectSocket();
    } else if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      didPollingFallbackRef.current = false;
    };
  }, [user, connectSocket]);

  const value = useMemo<WebSocketContextValue>(() => ({
    socket,
    isConnected,
    connected: isConnected, // Alias for compatibility
    sendMessage: (payload: unknown) => {
      if (!socket) return;
      socket.emit('message', payload);
    },
  }), [socket, isConnected]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);


