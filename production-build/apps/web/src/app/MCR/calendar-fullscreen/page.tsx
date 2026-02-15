'use client';

import React from 'react';
import CalendarWidget from '../components/CalendarWidget';
import '../styles/calendar-fullscreen.css';

export default function CalendarFullscreenPage() {
  return (
    <div className="mcr-calendar-fullscreen h-screen w-screen bg-gray-100 overflow-hidden">
      <CalendarWidget />
    </div>
  );
}
