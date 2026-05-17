'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';

export default function TestPage() {
  console.log('🧪 Test page rendered!');
  
  return (
    <ProtectedRoute requires={Permission.SETTINGS_MANAGE}>
    <div>
      <h1>Test Page</h1>
      <p>If you can see this, routing works!</p>
      <p>Token: {typeof window !== 'undefined' ? localStorage.getItem('auth-token')?.substring(0, 50) + '...' : 'SSR'}</p>
    </div>
    </ProtectedRoute>
  );
}
