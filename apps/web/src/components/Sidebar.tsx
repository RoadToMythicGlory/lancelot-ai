'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Permission } from '@/rbac'
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
  ChartBarIcon,
  PresentationChartLineIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  PhotoIcon,
  DocumentCheckIcon,
  ArrowPathIcon,
  QuestionMarkCircleIcon,
  UserCircleIcon,
  GlobeAltIcon,
  LifebuoyIcon,
} from '@heroicons/react/24/outline'
import NotificationCenter from './NotificationCenter'
import InboxCenter from './InboxCenter'
import GlobalSearch from './GlobalSearch'

interface NavItem {
  name: string
  href: string
  icon: React.ForwardRefExoticComponent<any>
  requires?: Permission
  /** If set, the user needs at least one of these to see the link. */
  requiresAny?: Permission[]
}

export default function Sidebar() {
  const { user, logout, hasPermission } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const mainNavigation: NavItem[] = [
    { name: 'דף הבית', href: '/', icon: HomeIcon, requires: Permission.DASHBOARD_VIEW },
    {
      name: 'משתמשים',
      href: '/users',
      icon: UsersIcon,
      // Only show to admins who can actually manage users. Plain USERS_VIEW
      // (e.g. an MCR Operator with a stale token) no longer surfaces the link.
      requiresAny: [Permission.USERS_MANAGE_DEPT, Permission.USERS_MANAGE_ALL],
    },
    { name: 'משמרות', href: '/shifts', icon: CalendarIcon, requires: Permission.SHIFTS_VIEW_OWN },
    { name: 'תכנונית', href: '/broadcast-planning', icon: CalendarIcon, requires: Permission.BROADCAST_VIEW },
    { name: 'שידורי חוץ', href: '/external-broadcasts', icon: GlobeAltIcon, requires: Permission.BROADCAST_VIEW },
    { name: 'מערך השידורים', href: '/broadcast-array', icon: GlobeAltIcon, requires: Permission.BROADCAST_ARRAY_VIEW },
    { name: 'MCR', href: '/MCR', icon: ChartBarIcon, requires: Permission.MCR_VIEW },
    { name: 'לוח טיסות', href: '/flight-board', icon: PresentationChartLineIcon, requires: Permission.FLIGHT_BOARD_VIEW },
    { name: 'לוח טיסות MCR', href: '/MCR/flight-board', icon: PresentationChartLineIcon, requires: Permission.MCR_FLIGHT_BOARD_VIEW },
    { name: 'מחסן', href: '/warehouse', icon: CubeIcon, requires: Permission.WAREHOUSE_VIEW },
  ]

  const managementNavigation: NavItem[] = [
    { name: 'מדיה (DAM)', href: '/media', icon: PhotoIcon, requires: Permission.MEDIA_VIEW },
    { name: 'זכויות שידור', href: '/rights', icon: DocumentCheckIcon, requires: Permission.RIGHTS_VIEW },
    { name: 'תהליכים', href: '/workflows', icon: ArrowPathIcon, requires: Permission.WORKFLOWS_VIEW },
  ]

  const bottomNavigation: NavItem[] = [
    { name: 'הגדרות', href: '/settings', icon: Cog6ToothIcon, requires: Permission.SETTINGS_VIEW },
    { name: 'תמיכת IT', href: '/it-support', icon: LifebuoyIcon, requires: Permission.IT_SUPPORT_MANAGE },
    { name: 'יומן ביקורת', href: '/audit-log', icon: ShieldCheckIcon, requires: Permission.AUDIT_VIEW },
    { name: 'עזרה', href: '/help', icon: QuestionMarkCircleIcon },
  ]

  const passesGate = (item: NavItem) => {
    if (item.requires && !hasPermission(item.requires)) return false
    if (item.requiresAny && !item.requiresAny.some((p) => hasPermission(p))) return false
    return true
  }

  const filteredMain = useMemo(
    () => mainNavigation.filter(passesGate),
    [hasPermission],
  )
  const filteredManagement = useMemo(
    () => managementNavigation.filter(passesGate),
    [hasPermission],
  )
  const filteredBottom = useMemo(
    () => bottomNavigation.filter(passesGate),
    [hasPermission],
  )

  const isActiveRoute = (href: string) => {
    return pathname === href
  }

  if (!user) return null

  const renderNavItem = (item: NavItem) => (
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
  )

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
                  className="flex-shrink-0"
                  style={{ width: 'auto', height: 'auto', maxWidth: 180 }}
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

          {/* Search, Inbox & Notifications */}
          {!isCollapsed && (
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1">
              <GlobalSearch />
              <InboxCenter />
              <NotificationCenter />
            </div>
          )}

          {/* Navigation links */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {/* Main navigation */}
            {filteredMain.map(renderNavItem)}

            {/* Management features separator */}
            {filteredManagement.length > 0 && !isCollapsed && (
              <div className="pt-3 pb-1">
                <p className="px-3 text-xs font-semibold text-gray-400 uppercase">ניהול</p>
              </div>
            )}

            {/* Management navigation */}
            {filteredManagement.map(renderNavItem)}

            {/* Bottom separator */}
            {filteredBottom.length > 0 && !isCollapsed && (
              <div className="pt-3 pb-1">
                <p className="px-3 text-xs font-semibold text-gray-400 uppercase">מערכת</p>
              </div>
            )}

            {/* Bottom navigation */}
            {filteredBottom.map(renderNavItem)}
          </nav>

          {/* User info and logout */}
          <div className="p-4 border-t border-gray-200">
            {!isCollapsed && (
              <Link href="/profile" className="block mb-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <UserCircleIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.displayName || user.email}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
              </Link>
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
