'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Spin, Alert } from 'antd';

// Permission enums
export enum PermissionCategory {
  DASHBOARD = 'dashboard',
  USERS = 'users',
  BROADCAST = 'broadcast',
  SHIFTS = 'shifts',
  WAREHOUSE = 'warehouse',
  TICKETS = 'tickets',
  CHAT = 'chat',
  ADMIN = 'admin'
}

export enum PermissionType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  ADMIN = 'admin'
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  category?: PermissionCategory;
  type?: PermissionType;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  category,
  type = PermissionType.READ,
  fallback 
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Persistent logging to sessionStorage
  if (typeof window !== 'undefined') {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      pathname: window.location.pathname,
      user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
      loading,
      category,
      type,
      hasUser: !!user,
      token: localStorage.getItem('auth-token')?.substring(0, 50) + '...'
    };
    
    // Get existing logs
    const existingLogs = JSON.parse(sessionStorage.getItem('protectedRouteDebug') || '[]');
    existingLogs.push(debugInfo);
    
    // Keep only last 20 logs
    if (existingLogs.length > 20) {
      existingLogs.shift();
    }
    
    sessionStorage.setItem('protectedRouteDebug', JSON.stringify(existingLogs));
    console.log('🔐 ProtectedRoute Debug:', debugInfo);
  }

  useEffect(() => {
    console.log('🔐 ProtectedRoute useEffect:', { 
      loading, 
      hasUser: !!user,
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'SSR',
      token: typeof window !== 'undefined' ? localStorage.getItem('auth-token')?.substring(0, 50) + '...' : 'SSR'
    });
    
    // IMPORTANT: Only redirect if we're NOT loading AND there's no user
    // This prevents redirects during the initial auth check
    if (!loading && !user) {
      // Double-check if there's a token before redirecting
      const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('auth-token');
      
      if (hasToken) {
        console.log('⚠️ Token exists but no user - auth still loading, not redirecting');
        return; // Don't redirect if token exists
      }
      
      console.log('⚠️ No user and no token, redirecting to login');
      
      // Log redirect event WITH TOKEN STATUS
      if (typeof window !== 'undefined') {
        const redirectLog = {
          timestamp: new Date().toISOString(),
          event: 'REDIRECT_TO_LOGIN',
          from: window.location.pathname,
          reason: 'No authenticated user and no token',
          tokenAtRedirect: localStorage.getItem('auth-token')?.substring(0, 50) + '...',
          hasToken
        };
        const logs = JSON.parse(sessionStorage.getItem('protectedRouteDebug') || '[]');
        logs.push(redirectLog);
        sessionStorage.setItem('protectedRouteDebug', JSON.stringify(logs));
      }
      
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // For now, we'll allow all authenticated users to access the dashboard
  // In a real implementation, you would check actual permissions here
  const hasPermission = true;

  if (!hasPermission && category) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert
          message="אין הרשאה"
          description="אין לך הרשאה לצפות בעמוד זה"
          type="error"
          showIcon
        />
      </div>
    );
  }

  return <>{children}</>;
}
