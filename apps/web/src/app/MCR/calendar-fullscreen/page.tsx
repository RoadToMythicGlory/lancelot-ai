'use client';

import React from 'react';
import CalendarWidget from '../components/CalendarWidget';
import '../styles/calendar-fullscreen.css';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';

export default function CalendarFullscreenPage() {
  return (
    <ProtectedRoute requires={Permission.MCR_VIEW}>
      <div className="mcr-calendar-fullscreen h-screen w-screen bg-gray-100 overflow-hidden">
        <CalendarWidget />
      </div>
    </ProtectedRoute>
  );
}
