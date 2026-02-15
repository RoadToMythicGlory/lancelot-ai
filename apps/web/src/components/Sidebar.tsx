'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { 
  HomeIcon, 
  UsersIcon, 
  CalendarIcon, 
  CubeIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const navigation = [
    { name: 'דף הבית', href: '/', icon: HomeIcon },
    { name: 'משתמשים', href: '/users', icon: UsersIcon },
    { name: 'משמרות', href: '/shifts', icon: CalendarIcon },
    { name: 'תכנונית', href: '/broadcast-planning', icon: CalendarIcon },
    { name: 'MCR', href: '/MCR', icon: ChartBarIcon },
    { name: 'מחסן', href: '/warehouse', icon: CubeIcon },
  ]

  const isActiveRoute = (href: string) => {
    return pathname === href
  }

  if (!user) return null

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 rounded-md bg-white shadow-lg text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {isMobileOpen ? (
            <XMarkIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed top-0 right-0 h-full bg-white shadow-xl z-40 transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-20' : 'w-64'}
        ${isMobileOpen ? 'translate-x-0' : 'translate-x-full'}
        lg:translate-x-0 lg:relative lg:z-0
      `}>
        <div className="h-full flex flex-col">
          {/* Logo and brand */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center justify-center">
                <Image 
                  src={isCollapsed ? "/lancelot-small-logo.png" : "/lancelot-logo.png"} 
                  alt="Lancelot Logo" 
                  width={isCollapsed ? 40 : 180} 
                  height={40}
                  priority
                  className="h-auto w-full max-w-[180px] flex-shrink-0"
                  style={{ width: 'auto', height: 'auto' }}
                />
              </Link>
              
              {/* Collapse button - desktop only */}
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="hidden lg:block p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                {isCollapsed ? (
                  <ChevronDoubleLeftIcon className="h-5 w-5" />
                ) : (
                  <ChevronDoubleRightIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center px-3 py-2 rounded-lg transition-colors
                  ${isActiveRoute(item.href)
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
              >
                <item.icon className={`h-5 w-5 flex-shrink-0 ${!isCollapsed && 'ml-3'}`} />
                {!isCollapsed && (
                  <span className="mr-3">{item.name}</span>
                )}
                {isCollapsed && (
                  <span className="sr-only">{item.name}</span>
                )}
              </Link>
            ))}
          </nav>

          {/* User info and logout */}
          <div className="p-4 border-t border-gray-200">
            {!isCollapsed && (
              <div className="mb-3 px-3 py-2">
                <p className="text-sm font-medium text-gray-900">
                  {user.displayName || user.email}
                </p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              className={`
                w-full flex items-center px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors
                ${isCollapsed ? 'justify-center' : ''}
              `}
            >
              <ArrowRightOnRectangleIcon className={`h-5 w-5 flex-shrink-0 ${!isCollapsed && 'ml-3'}`} />
              {!isCollapsed && (
                <span className="mr-3">יציאה</span>
              )}
              {isCollapsed && (
                <span className="sr-only">יציאה</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
} 