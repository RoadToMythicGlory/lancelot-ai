'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import CalendarWidget from './components/CalendarWidget';
import ButtonsWidget from './components/ButtonsWidget';
import BulletinWidget from './components/BulletinWidget';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';

export default function MCRPage() {
  const { t } = useTranslation();

  return (
    <ProtectedRoute requires={Permission.MCR_VIEW}>
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto">
        {/* Page Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-6">דאשבורד MCR</h1>
        
        {/* Main Layout */}
        <div className="space-y-4">
          {/* Calendar Widget - 60% height, 100% width */}
          <div className="h-[60vh] w-full">
            <CalendarWidget />
          </div>
          
          {/* Buttons Widget - 10% height, 100% width */}
          <div className="h-[10vh] w-full">
            <ButtonsWidget />
          </div>
          
          {/* Bulletin Widget - 30% height, 100% width */}
          <div className="h-[30vh] w-full">
            <BulletinWidget />
          </div>
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}






