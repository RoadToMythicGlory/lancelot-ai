'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLazyQuery } from '@apollo/client'
import { Modal, Input, List, Tag, Spin, Empty } from 'antd'
import {
  MagnifyingGlassIcon,
  VideoCameraIcon,
  UserIcon,
  CubeIcon,
  PhotoIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import { GLOBAL_SEARCH } from '@/graphql/saasQueries'

const typeIcons: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  broadcasts: { icon: <VideoCameraIcon className="h-4 w-4" />, color: 'purple', label: 'שידור' },
  users: { icon: <UserIcon className="h-4 w-4" />, color: 'blue', label: 'משתמש' },
  equipment: { icon: <CubeIcon className="h-4 w-4" />, color: 'green', label: 'ציוד' },
  media: { icon: <PhotoIcon className="h-4 w-4" />, color: 'orange', label: 'מדיה' },
  shifts: { icon: <CalendarIcon className="h-4 w-4" />, color: 'cyan', label: 'משמרת' },
}

const routeMap: Record<string, string> = {
  broadcasts: '/broadcast-planning',
  users: '/users',
  equipment: '/warehouse',
  media: '/media',
  shifts: '/shifts',
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<any>(null)

  const [search, { data, loading }] = useLazyQuery(GLOBAL_SEARCH)

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) return
    const timer = setTimeout(() => {
      search({ variables: { query, limit: 5 } })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  const results = data?.globalSearch || {}
  const hasResults = Object.values(results).some((arr: any) => arr?.length > 0)

  const handleSelect = (type: string, item: any) => {
    setOpen(false)
    setQuery('')
    const route = routeMap[type] || '/'
    window.location.href = route
  }

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 text-sm"
      >
        <MagnifyingGlassIcon className="h-4 w-4" />
        <span>חיפוש...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-white rounded text-xs border border-gray-200">
          Ctrl+K
        </kbd>
      </button>

      {/* Search Modal */}
      <Modal
        open={open}
        onCancel={() => { setOpen(false); setQuery('') }}
        footer={null}
        closable={false}
        width={600}
        className="global-search-modal"
        styles={{ body: { padding: 0 } }}
      >
        <div className="p-3 border-b">
          <Input
            ref={inputRef}
            placeholder="חיפוש שידורים, משתמשים, ציוד, מדיה..."
            prefix={<MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            size="large"
            variant="borderless"
            allowClear
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <div className="flex justify-center p-8">
              <Spin />
            </div>
          )}

          {!loading && query.length >= 2 && !hasResults && (
            <Empty description="לא נמצאו תוצאות" className="py-8" />
          )}

          {!loading && hasResults && (
            <div className="py-2">
              {Object.entries(results).map(([type, items]: [string, any]) => {
                if (!items?.length) return null
                const typeInfo = typeIcons[type]
                if (!typeInfo) return null

                return (
                  <div key={type} className="mb-2">
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase">
                      {typeInfo.label} ({items.length})
                    </div>
                    {items.map((item: any) => (
                      <div
                        key={item.id}
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                        onClick={() => handleSelect(type, item)}
                      >
                        <div className={`p-1.5 rounded bg-${typeInfo.color}-100`}>
                          {typeInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {item.displayName || item.title || item.hebrewTitle || item.name}
                          </p>
                          {item.email && (
                            <p className="text-xs text-gray-400 truncate">{item.email}</p>
                          )}
                          {item.channel && (
                            <p className="text-xs text-gray-400">{item.channel}</p>
                          )}
                        </div>
                        <Tag color={typeInfo.color} className="text-xs">{typeInfo.label}</Tag>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {query.length < 2 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              הקלד לפחות 2 תווים לחיפוש
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
