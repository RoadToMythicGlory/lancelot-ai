"use client";
'use client';

import React from 'react';
import { Card, Typography, Button } from 'antd';
import { CalendarOutlined, SwapOutlined, FileTextOutlined, ClockCircleOutlined, DashboardOutlined } from '@ant-design/icons';
import UpcomingShifts from '@/components/shifts/UpcomingShifts';
import ShiftSwap from '@/components/shifts/ShiftSwap';
import IncomingSwapRequests from '@/components/shifts/IncomingSwapRequests';
import VacationRequest from '@/components/shifts/VacationRequest';
import VacationHistory from '@/components/shifts/VacationHistory';
import AvailabilityConstraints from '@/components/shifts/AvailabilityConstraints';
import WeekShiftsView from '@/components/shifts/WeekShiftsView';
import dynamic from 'next/dynamic';
const AdminDashboardLazy = dynamic(() => import('@/components/shifts/admin/ShiftsAdminDashboard'), { ssr: false });
import { useAuth } from '@/contexts/AuthContext';

const { Title } = Typography;

export default function ShiftsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = React.useState<string | null>(null);

  // Check if user is admin (you may need to adjust this based on your permission system)
  const isAdmin = user?.systemRole === 'DEPARTMENT_ADMIN' || user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN' || user?.permissions?.includes('shift_admin');

  const sections = [
    {
      key: 'upcoming',
      title: 'המשמרות שלי',
      icon: <CalendarOutlined className="text-2xl" />,
      description: 'צפה במשמרות המתוכננות שלך',
      component: <UpcomingShifts />
    },
    {
      key: 'swap',
      title: 'החלפת משמרת',
      icon: <SwapOutlined className="text-2xl" />,
      description: 'בקש החלפת משמרת עם עובד אחר',
      component: <ShiftSwap />
    },
    {
      key: 'incomingSwaps',
      title: 'בקשות החלפה נכנסות',
      icon: <SwapOutlined className="text-2xl" />,
      description: 'בקשות החלפה שהתקבלו ממתינות לתגובתך',
      component: <IncomingSwapRequests />
    },
    {
      key: 'vacation',
      title: 'בקשת חופשה',
      icon: <FileTextOutlined className="text-2xl" />,
      description: 'הגש בקשה לחופשה',
      component: <VacationRequest />
    },
    {
      key: 'vacationHistory',
      title: 'היסטוריית חופשות',
      icon: <FileTextOutlined className="text-2xl" />,
      description: 'צפה בהיסטוריית בקשות החופשה שלך',
      component: <VacationHistory />
    },
    {
      key: 'availability',
      title: 'אילוצי זמינות',
      icon: <ClockCircleOutlined className="text-2xl" />,
      description: 'עדכן את הזמינות שלך למשמרות',
      component: <AvailabilityConstraints />
    },
    {
      key: 'weekView',
      title: 'צפה במשמרות השבוע',
      icon: <CalendarOutlined className="text-2xl" />,
      description: 'צפה בכל המשמרות של השבוע בטבלה',
      component: <WeekShiftsView />
    }
  ];

  // Add admin section if user is admin
  if (isAdmin) {
    sections.push({
      key: 'admin',
      title: 'ניהול משמרות',
      icon: <DashboardOutlined className="text-2xl" />,
      description: 'לוח בקרה למנהלים - ניהול משמרות ועובדים',
      component: <AdminDashboardLazy />
    });
  }

  // If no section is active, show the home page
  if (!activeSection) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <Title level={2}>ניהול משמרות</Title>
          <p className="text-gray-600 text-lg">ברוך הבא, {user?.displayName || 'משתמש'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map((section) => (
            <Card
              key={section.key}
              hoverable
              className="cursor-pointer transition-all hover:shadow-lg"
              onClick={() => setActiveSection(section.key)}
            >
              <div className="flex items-center gap-4">
                <div className="text-blue-500">
                  {section.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{section.title}</h3>
                  <p className="text-gray-600 text-sm">{section.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Show the active section
  const activeComponent = activeSection === 'admin'
    ? (isAdmin ? <AdminDashboardLazy /> : null)
    : sections.find(s => s.key === activeSection)?.component;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <Button
          type="link"
          onClick={() => setActiveSection(null)}
          className="p-0"
        >
          ← חזרה לדף הבית
        </Button>
      </div>
      
      {activeComponent}
    </div>
  );
} 