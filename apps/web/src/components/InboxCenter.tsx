'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Badge, Popover, List, Avatar, Empty, Spin, Tag } from 'antd'
import { InboxIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useChat } from '@/contexts/ChatContext'
import { gql } from '@apollo/client'

const GET_INBOX = gql`
  query GetInbox {
    privateConversations {
      id
      participant1 {
        id
        firstName
        lastName
        displayName
        email
        department
      }
      participant2 {
        id
        firstName
        lastName
        displayName
        email
        department
      }
      unreadCount
      lastMessageAt
    }
  }
`

const MARK_MESSAGES_READ = gql`
  mutation MarkMessagesRead($conversationId: ID!) {
    markMessagesAsRead(conversationId: $conversationId)
  }
`

interface ConversationItem {
  id: string
  participant1: any
  participant2: any
  unreadCount: number
  lastMessageAt: string | null
}

export default function InboxCenter() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const { openConversation } = useChat()

  const { data, loading, refetch } = useQuery(GET_INBOX, {
    pollInterval: 15000,
  })

  const [markRead] = useMutation(MARK_MESSAGES_READ)

  const conversations: ConversationItem[] = data?.privateConversations || []
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)

  const getOtherParticipant = (convo: ConversationItem) => {
    if (!user) return convo.participant1
    return convo.participant1?.id === user.id ? convo.participant2 : convo.participant1
  }

  const getInitials = (p: any) => {
    if (p?.firstName && p?.lastName) return `${p.firstName[0]}${p.lastName[0]}`
    return p?.displayName?.[0]?.toUpperCase() || '?'
  }

  const getDisplayName = (p: any) => {
    return p?.displayName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || p?.email || 'Unknown'
  }

  const timeAgo = (date: string | null) => {
    if (!date) return ''
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'עכשיו'
    if (minutes < 60) return `${minutes}ד`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}ש`
    const days = Math.floor(hours / 24)
    return `${days}י`
  }

  const handleOpenChat = async (convo: ConversationItem) => {
    const other = getOtherParticipant(convo)

    // Open the real chat window via ChatContext
    openConversation(
      {
        id: other.id,
        fullName: getDisplayName(other),
        email: other.email,
        department: other.department,
        status: 'online',
      },
      convo.id
    )

    // Mark as read
    if (convo.unreadCount > 0) {
      await markRead({ variables: { conversationId: convo.id } })
      refetch()
    }

    // Close the popover
    setOpen(false)
  }

  const content = (
    <div style={{ width: 340, maxHeight: 460, overflow: 'auto' }}>
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold">תיבת הודעות</h3>
        {totalUnread > 0 && (
          <Tag color="blue">{totalUnread} לא נקראו</Tag>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <Spin />
        </div>
      ) : conversations.length === 0 ? (
        <Empty description="אין שיחות" className="py-8" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={[...conversations].sort((a, b) => {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1
            if (a.unreadCount === 0 && b.unreadCount > 0) return 1
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
            return bTime - aTime
          })}
          renderItem={(convo: ConversationItem) => {
            const other = getOtherParticipant(convo)
            return (
              <List.Item
                className={`cursor-pointer hover:bg-gray-50 px-3 transition-colors ${
                  convo.unreadCount > 0 ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleOpenChat(convo)}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar className="bg-blue-500 flex-shrink-0">
                      {getInitials(other)}
                    </Avatar>
                  }
                  title={
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${convo.unreadCount > 0 ? 'font-bold' : 'font-medium'}`}>
                        {getDisplayName(other)}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 mr-2">
                        {timeAgo(convo.lastMessageAt)}
                      </span>
                    </div>
                  }
                  description={
                    convo.unreadCount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-600 font-medium">
                          {convo.unreadCount} {convo.unreadCount === 1 ? 'הודעה חדשה' : 'הודעות חדשות'}
                        </span>
                        <Badge
                          count={convo.unreadCount}
                          size="small"
                          className="flex-shrink-0"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">לחץ לפתיחת השיחה</span>
                    )
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
        <InboxIcon className="h-5 w-5 text-gray-600" />
        {totalUnread > 0 && (
          <Badge
            count={totalUnread}
            size="small"
            className="absolute -top-1 -left-1"
          />
        )}
      </button>
    </Popover>
  )
}
