'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Badge, Popover, List, Button, Tag, Empty, Spin } from 'antd'
import { BellIcon, CheckIcon } from '@heroicons/react/24/outline'
import { GET_NOTIFICATIONS } from '@/graphql/saasQueries'
import { MARK_NOTIFICATION_READ, MARK_ALL_NOTIFICATIONS_READ, DISMISS_NOTIFICATION } from '@/graphql/saasMutations'

const typeIcons: Record<string, { color: string; label: string }> = {
  info: { color: 'blue', label: 'מידע' },
  warning: { color: 'orange', label: 'אזהרה' },
  error: { color: 'red', label: 'שגיאה' },
  success: { color: 'green', label: 'הצלחה' },
  broadcast: { color: 'purple', label: 'שידור' },
  shift: { color: 'cyan', label: 'משמרת' },
  approval: { color: 'gold', label: 'אישור' },
  system: { color: 'default', label: 'מערכת' },
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  
  const { data, loading, refetch } = useQuery(GET_NOTIFICATIONS, {
    variables: { limit: 20, unreadOnly: false },
    pollInterval: 30000, // Poll every 30 seconds
  })

  const [markRead] = useMutation(MARK_NOTIFICATION_READ)
  const [markAllRead] = useMutation(MARK_ALL_NOTIFICATIONS_READ)
  const [dismiss] = useMutation(DISMISS_NOTIFICATION)

  const notifications = data?.notifications?.items || []
  const unreadCount = data?.notifications?.unreadCount || 0

  const handleMarkRead = async (id: string) => {
    await markRead({ variables: { id } })
    refetch()
  }

  const handleMarkAllRead = async () => {
    await markAllRead()
    refetch()
  }

  const handleDismiss = async (id: string) => {
    await dismiss({ variables: { id } })
    refetch()
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'עכשיו'
    if (minutes < 60) return `לפני ${minutes} דקות`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `לפני ${hours} שעות`
    const days = Math.floor(hours / 24)
    return `לפני ${days} ימים`
  }

  const content = (
    <div style={{ width: 380, maxHeight: 500, overflow: 'auto' }}>
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold">התראות</h3>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllRead}>
            <CheckIcon className="h-4 w-4 ml-1" />
            סמן הכל כנקרא
          </Button>
        )}
      </div>
      
      {loading ? (
        <div className="flex justify-center p-8">
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <Empty description="אין התראות" className="py-8" />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(notif: any) => {
            const typeInfo = typeIcons[notif.type?.toLowerCase()] || typeIcons.info
            return (
              <List.Item
                className={`cursor-pointer hover:bg-gray-50 px-3 ${!notif.isRead ? 'bg-blue-50' : ''}`}
                onClick={() => {
                  if (!notif.isRead) handleMarkRead(notif.id)
                  if (notif.actionUrl) window.location.href = notif.actionUrl
                }}
              >
                <List.Item.Meta
                  title={
                    <div className="flex items-center gap-2">
                      {!notif.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                      <span className="text-sm font-medium">
                        {notif.titleHe || notif.title}
                      </span>
                    </div>
                  }
                  description={
                    <div>
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {notif.messageHe || notif.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Tag color={typeInfo.color} className="text-xs">{typeInfo.label}</Tag>
                        <span className="text-xs text-gray-400">{timeAgo(notif.createdAt)}</span>
                      </div>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      arrow={false}
    >
      <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <BellIcon className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <Badge
            count={unreadCount}
            size="small"
            className="absolute -top-1 -left-1"
          />
        )}
      </button>
    </Popover>
  )
}
