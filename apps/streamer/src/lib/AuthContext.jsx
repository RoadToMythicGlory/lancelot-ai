import React, { createContext, useContext, useState, useEffect } from 'react';
import { useMutation } from '@apollo/client';
import { LOGIN, REGISTER_STREAMER } from '@/graphql/mutations';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginMutation] = useMutation(LOGIN);
  const [registerMutation] = useMutation(REGISTER_STREAMER);

  useEffect(() => {
    const token = localStorage.getItem('streamer-token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.userId,
          email: payload.email,
          displayName: payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
          full_name: payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
          accountType: payload.accountType || 'streamer',
        });
      } catch {
        localStorage.removeItem('streamer-token');
      }
    }
    setLoading(false);
  }, []);

  // Handle OAuth callback token from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('streamer-token', token);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.userId,
          email: payload.email,
          displayName: payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
          full_name: payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
          accountType: payload.accountType || 'streamer',
        });
      } catch { /* ignore */ }
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const login = async (email, password) => {
    const { data } = await loginMutation({ variables: { email, password } });
    if (data?.login?.token) {
      localStorage.setItem('streamer-token', data.login.token);
      const payload = JSON.parse(atob(data.login.token.split('.')[1]));
      setUser({
        id: payload.userId,
        email: payload.email,
        displayName: payload.displayName || `${payload.firstName} ${payload.lastName}`.trim(),
        full_name: payload.displayName || `${payload.firstName} ${payload.lastName}`.trim(),
        accountType: 'streamer',
      });
    }
  };

  const register = async (email, password, displayName) => {
    const { data } = await registerMutation({ variables: { email, password, displayName } });
    if (data?.registerStreamer?.token) {
      localStorage.setItem('streamer-token', data.registerStreamer.token);
      const u = data.registerStreamer.user;
      setUser({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        full_name: u.displayName,
        accountType: 'streamer',
      });
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('streamer-token');
  };

  const startOAuth = (provider) => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    window.location.href = `${apiBase}/auth/${provider}`;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, startOAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
