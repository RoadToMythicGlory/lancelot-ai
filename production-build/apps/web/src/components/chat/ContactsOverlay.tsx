'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Users, Circle } from 'lucide-react';
import { Input, Button, Avatar, Card, Empty } from 'antd/es';

interface User {
  id: string;
  fullName: string;
  displayName?: string;
  email: string;
  department?: string;
  role?: string;
  status: string;
}



interface ContactsOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onlineUsers: User[];
  onStartConversation: (user: User, conversationId?: string) => void;
}

const ContactsOverlay: React.FC<ContactsOverlayProps> = ({
  isVisible,
  onClose,
  onlineUsers,
  onStartConversation
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Filter and group users
  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return onlineUsers.filter(user =>
      (user.fullName || '').toLowerCase().includes(query) ||
      (user.email || '').toLowerCase().includes(query) ||
      (user.department && user.department.toLowerCase().includes(query))
    );
  }, [onlineUsers, searchQuery]);

  // Group users by department
  const usersByDepartment = useMemo(() => {
    const departments: { [key: string]: User[] } = {};
    
    filteredUsers.forEach(user => {
      const dept = user.department || 'Other';
      if (!departments[dept]) {
        departments[dept] = [];
      }
      departments[dept].push(user);
    });

    // Sort users within each department
    Object.keys(departments).forEach(dept => {
      departments[dept].sort((a, b) => {
        const nameA = a.fullName || '';
        const nameB = b.fullName || '';
        return nameA.localeCompare(nameB);
      });
    });

    return departments;
  }, [filteredUsers]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        // Check if the click is on the chat bubble
        const chatBubble = document.querySelector('[data-chat-bubble]');
        if (!chatBubble?.contains(event.target as Node)) {
          onClose();
        }
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };



  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      {/* Sidebar */}
      <div 
        ref={overlayRef}
        className={`fixed left-0 bottom-0 z-50 transition-all duration-300 ease-out ${
          isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        }`}
        style={{ bottom: '90px', left: '90px' }} // Position next to chat bubble
      >
        <Card
          className="w-80 h-[450px] shadow-2xl border-0 overflow-hidden"
          styles={{ 
            body: { 
              padding: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff'
            } 
          }}
          style={{
            borderRadius: '16px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-500 rounded-full">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  צ'אטים
                </h3>
                <p className="text-xs text-gray-500">
                  {onlineUsers.filter(u => u.status === 'online').length} מחוברים
                </p>
              </div>
            </div>
            <Button
              type="text"
              size="small"
              icon={<X size={20} />}
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            />
          </div>

          {/* Search */}
          <div className="px-4 pt-4">
            <Input
              placeholder="חפש אנשי קשר או שיחות..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefix={<Search size={16} className="text-gray-400" />}
              className="rounded-full bg-gray-100 border-0 hover:bg-gray-200 focus:bg-gray-200"
              style={{ height: '40px' }}
            />
          </div>
          


          {/* Content */}
          <div className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
            <div className="space-y-4 mt-3">
              {Object.keys(usersByDepartment).length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="לא נמצאו אנשי קשר"
                  className="py-12"
                />
              ) : (
                Object.entries(usersByDepartment).map(([department, users]) => (
                  <div key={department}>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
                      {department} ({users.length})
                    </h4>
                    <div className="space-y-1">
                      {users.map((user) => (
                        <div
                          key={user.id}
                          data-user-id={user.id}
                          onClick={() => onStartConversation(user)}
                          className="flex items-center space-x-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-all duration-200 group mx-2"
                        >
                          <div className="relative">
                            <Avatar 
                              size={40} 
                              className="bg-gradient-to-br from-indigo-400 to-purple-600 font-semibold group-hover:scale-105 transition-transform"
                            >
                              {user.fullName?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                            </Avatar>
                            <div
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(user.status)}`}
                            />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium text-gray-900 truncate">
                                {user.fullName || 'Unknown User'}
                              </span>
                              <Circle 
                                size={8} 
                                className={`${
                                  user.status === 'online' 
                                    ? 'text-green-500 fill-green-500' 
                                    : 'text-gray-300 fill-gray-300'
                                }`}
                              />
                            </div>
                            <span className="text-sm text-gray-500 truncate">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
};

export default ContactsOverlay; 