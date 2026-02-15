'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMutation } from '@apollo/client';
import { LOGIN } from '../graphql/mutations';

interface User {
  id: string;
  displayName: string;
  email: string;
  department?: string;
  permissions?: string[];
  systemRole?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginMutation] = useMutation(LOGIN);

  console.log('🔑 AuthProvider mounted, initial state:', { user, loading });

  // Log to sessionStorage for persistence
  if (typeof window !== 'undefined') {
    const authLog = {
      timestamp: new Date().toISOString(),
      event: 'AUTH_PROVIDER_MOUNTED',
      user: user ? { id: user.id, email: user.email } : null,
      loading
    };
    const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
    logs.push(authLog);
    if (logs.length > 30) logs.shift();
    sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
  }

  useEffect(() => {
    // Check for stored auth token and validate
    const checkAuth = async () => {
      console.log('🔑 checkAuth started');
      
      // Log checkAuth start
      if (typeof window !== 'undefined') {
        const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
        logs.push({
          timestamp: new Date().toISOString(),
          event: 'CHECK_AUTH_START',
          pathname: window.location.pathname
        });
        sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
      }
      
      try {
        const token = localStorage.getItem('auth-token');
        console.log('🔑 Token from localStorage:', token ? token.substring(0, 50) + '...' : 'null');
        
        // Log token status
        if (typeof window !== 'undefined') {
          const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
          logs.push({
            timestamp: new Date().toISOString(),
            event: 'TOKEN_CHECK',
            hasToken: !!token,
            tokenPreview: token ? token.substring(0, 50) + '...' : null
          });
          sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
        }
        
        if (token && token !== 'mock-jwt-token') {
          // In a real app, validate token with the server
          // For now, decode the JWT payload to get user info
          const payload = JSON.parse(atob(token.split('.')[1]));
          console.log('JWT Payload decoded:', payload);
          
          // Build permissions array based on role and systemRole
          const permissions = [payload.role || 'user'];
          
          // Add admin permission for system/IT admins
          if (['SYSTEM_ADMIN', 'IT_ADMIN'].includes(payload.systemRole)) {
            permissions.push('admin');
            permissions.push('shift_admin');
          } else if (payload.systemRole === 'DEPARTMENT_ADMIN') {
            permissions.push('shift_admin');
          }
          
          const userObject = {
            id: payload.userId,
            displayName: payload.displayName || `${payload.firstName || 'User'} ${payload.lastName || ''}`.trim() || payload.email,
            email: payload.email,
            department: payload.department || (payload.departments && payload.departments.length > 0 ? payload.departments[0].departmentName : ''),
            permissions,
            systemRole: payload.systemRole
          };
          console.log('Setting user object:', userObject);
          setUser(userObject);
          
          // Log successful auth
          if (typeof window !== 'undefined') {
            const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
            logs.push({
              timestamp: new Date().toISOString(),
              event: 'USER_SET',
              user: { id: userObject.id, email: userObject.email, displayName: userObject.displayName }
            });
            sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
          }
        } else {
          console.log('🔑 No valid token found, user remains null');
          
          // Log no token found
          if (typeof window !== 'undefined') {
            const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
            logs.push({
              timestamp: new Date().toISOString(),
              event: 'NO_VALID_TOKEN',
              token: token ? 'exists but invalid' : 'null'
            });
            sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
          }
        }
      } catch (error) {
        console.error('🔑 Auth check failed:', error);
        
        // Only remove token if it's actually invalid (jwt malformed, expired, etc)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('jwt malformed') || 
            errorMessage.includes('jwt expired') || 
            errorMessage.includes('invalid token')) {
          console.error('🔑 Token is invalid, removing it');
          localStorage.removeItem('auth-token');
        } else {
          console.warn('🔑 Auth check error but keeping token:', errorMessage);
        }
        
        // Log error
        if (typeof window !== 'undefined') {
          const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
          logs.push({
            timestamp: new Date().toISOString(),
            event: 'AUTH_ERROR',
            error: errorMessage,
            tokenRemoved: errorMessage.includes('jwt malformed') || errorMessage.includes('jwt expired')
          });
          sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
        }
      } finally {
        console.log('🔑 Setting loading to false');
        setLoading(false);
        
        // Log loading complete
        if (typeof window !== 'undefined') {
          const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
          logs.push({
            timestamp: new Date().toISOString(),
            event: 'AUTH_CHECK_COMPLETE',
            hasUser: !!user
          });
          sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
        }
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    console.log('🔑 Login attempt for:', email);
    try {
      const { data } = await loginMutation({
        variables: { email, password }
      });

      console.log('🔑 Login response:', data);

      if (data?.login) {
        const { token, user: loginUser } = data.login;
        
        console.log('🔑 Login successful, token:', token?.substring(0, 50) + '...');
        console.log('🔑 Login user data:', loginUser);
        
        // Store the real JWT token
        localStorage.setItem('auth-token', token);
        console.log('🔑 Token stored in localStorage');
        
        // Log to sessionStorage for debugging
        if (typeof window !== 'undefined') {
          const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
          logs.push({
            timestamp: new Date().toISOString(),
            event: 'LOGIN_SUCCESS',
            user: loginUser,
            tokenStored: true,
            tokenPreview: token?.substring(0, 50) + '...'
          });
          sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
        }
        
        // Force page reload to ensure Apollo picks up the new token
        window.location.href = '/';
        
        // Decode JWT to get full user info
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // Build permissions array based on role and systemRole
        const permissions = [payload.role || 'user'];
        
        // Add admin permission for system/IT admins
        if (['SYSTEM_ADMIN', 'IT_ADMIN'].includes(payload.systemRole || loginUser.systemRole)) {
          permissions.push('admin');
          permissions.push('shift_admin');
        } else if ((payload.systemRole || loginUser.systemRole) === 'DEPARTMENT_ADMIN') {
          permissions.push('shift_admin');
        }
        
        // Set user data
        setUser({
          id: loginUser.id,
          displayName: `${loginUser.firstName} ${loginUser.lastName}`.trim(),
          email: payload.email,
          department: loginUser.departments && loginUser.departments.length > 0 ? loginUser.departments[0].departmentName : '',
          permissions,
          systemRole: payload.systemRole || loginUser.systemRole
        });
      } else {
        console.error('🔑 Login failed: No data returned');
        
        // Log to sessionStorage
        if (typeof window !== 'undefined') {
          const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
          logs.push({
            timestamp: new Date().toISOString(),
            event: 'LOGIN_FAILED',
            reason: 'No data returned',
            email
          });
          sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
        }
        
        // Throw error to ensure the login page catches it
        throw new Error('שגיאה בהתחברות - לא התקבלו נתונים מהשרת');
      }
    } catch (error: any) {
      console.error('🔑 Login failed:', error);
      
      // Log to sessionStorage
      if (typeof window !== 'undefined') {
        const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
        logs.push({
          timestamp: new Date().toISOString(),
          event: 'LOGIN_ERROR',
          error: error.message,
          email
        });
        sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
      }
      
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth-token');
  };

  console.log('🔑 AuthProvider rendering with:', { user: !!user, loading });

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}; 