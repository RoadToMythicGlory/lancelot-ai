'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Table, Tag, Input, Select, Button, Upload, Modal, Form, Space, Spin, Image, Empty } from 'antd'
import {
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { GET_MEDIA_ASSETS, GET_MEDIA_FOLDERS } from '@/graphql/saasQueries'
import { CREATE_MEDIA_ASSET, DELETE_MEDIA_ASSET, CREATE_MEDIA_FOLDER } from '@/graphql/saasMutations'

const typeIcons: Record<string, React.ReactNode> = {
  video: <VideoCameraIcon className="h-5 w-5 text-purple-500" />,
  audio: <MusicalNoteIcon className="h-5 w-5 text-green-500" />,
  image: <PhotoIcon className="h-5 w-5 text-blue-500" />,
  document: <DocumentIcon className="h-5 w-5 text-orange-500" />,
  graphic: <PhotoIcon className="h-5 w-5 text-pink-500" />,
}

const typeLabels: Record<string, string> = {
  VIDEO: 'וידאו',
  AUDIO: 'אודיו',
  IMAGE: 'תמונה',
  DOCUMENT: 'מסמך',
  GRAPHIC: 'גרפיקה',
  OTHER: 'אחר',
}

const statusLabels: Record<string, { label: string; color: string }> = {
  ready: { label: 'מוכן', color: 'green' },
  uploading: { label: 'מעלה', color: 'blue' },
  processing: { label: 'מעבד', color: 'orange' },
  archived: { label: 'בארכיון', color: 'default' },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function MediaPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<any>({})
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [page, setPage] = useState(0)
  const [createFolderModal, setCreateFolderModal] = useState(false)

  const { data, loading, refetch } = useQuery(GET_MEDIA_ASSETS, {
    variables: { filter, limit: 24, offset: page * 24 },
  })
  const { data: foldersData } = useQuery(GET_MEDIA_FOLDERS, {
    variables: { parentFolderId: null },
  })

  const [deleteAsset] = useMutation(DELETE_MEDIA_ASSET)
  const [createFolder] = useMutation(CREATE_MEDIA_FOLDER)

  const assets = data?.mediaAssets?.items || []
  const totalCount = data?.mediaAssets?.totalCount || 0
  const folders = foldersData?.mediaFolders || []

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: 'מחיקת קובץ',
      content: 'האם אתה בטוח?',
      okText: 'מחק',
      cancelText: 'ביטול',
      okType: 'danger',
      onOk: async () => {
        await deleteAsset({ variables: { id } })
        refetch()
      },
    })
  }

  const handleCreateFolder = async (values: any) => {
    try {
      await createFolder({ variables: values })
      setCreateFolderModal(false)
      refetch()
    } catch (err: any) {
      console.error(err)
    }
  }

  const columns = [
    {
      title: 'סוג',
      dataIndex: 'type',
      key: 'type',
      width: 50,
      render: (type: string) => typeIcons[type?.toLowerCase()] || <DocumentIcon className="h-5 w-5" />,
    },
    {
      title: 'שם',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: any) => (
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-gray-500">{record.originalFilename}</p>
        </div>
      ),
    },
    {
      title: 'סוג קובץ',
      dataIndex: 'type',
      key: 'typeLabel',
      render: (type: string) => <Tag>{typeLabels[type] || type}</Tag>,
    },
    {
      title: 'גודל',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (size: number) => formatFileSize(size),
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = statusLabels[status] || { label: status, color: 'default' }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: 'תגיות',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) => tags?.map((t: string) => <Tag key={t}>{t}</Tag>),
    },
    {
      title: 'הועלה על ידי',
      dataIndex: 'uploadedByName',
      key: 'uploadedByName',
    },
    {
      title: 'תאריך',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString('he-IL'),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button type="link" danger size="small" onClick={() => handleDelete(record.id)}>
          מחק
        </Button>
      ),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול מדיה (DAM)</h1>
          <p className="text-gray-500">ניהול קבצי מדיה, תמונות, וידאו ומסמכים</p>
        </div>
        <Space>
          <Button icon={<FolderIcon className="h-4 w-4" />} onClick={() => setCreateFolderModal(true)}>
            תיקיה חדשה
          </Button>
          <Upload showUploadList={false} onChange={() => {}}>
            <Button type="primary" icon={<CloudArrowUpIcon className="h-4 w-4" />}>
              העלאת קובץ
            </Button>
          </Upload>
        </Space>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          {folders.map((folder: any) => (
            <Card key={folder.id} size="small" className="cursor-pointer hover:shadow-md transition-shadow" style={{ width: 150 }}>
              <div className="flex flex-col items-center">
                <FolderIcon className="h-10 w-10 text-yellow-500 mb-2" />
                <p className="text-sm font-medium text-center">{folder.name}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="חיפוש מדיה..."
            prefix={<MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />}
            onChange={e => setFilter({ ...filter, searchTerm: e.target.value || undefined })}
            style={{ width: 250 }}
            allowClear
          />
          <Select
            placeholder="סוג"
            allowClear
            style={{ width: 120 }}
            onChange={val => setFilter({ ...filter, type: val })}
          >
            {Object.entries(typeLabels).map(([key, label]) => (
              <Select.Option key={key} value={key}>{label}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="סטטוס"
            allowClear
            style={{ width: 120 }}
            onChange={val => setFilter({ ...filter, status: val })}
          >
            {Object.entries(statusLabels).map(([key, info]) => (
              <Select.Option key={key} value={key.toUpperCase()}>{info.label}</Select.Option>
            ))}
          </Select>
          <div className="mr-auto">
            <span className="text-sm text-gray-500">{totalCount} קבצים</span>
          </div>
        </div>
      </Card>

      {/* Assets */}
      <Card>
        {loading ? (
          <div className="flex justify-center p-12">
            <Spin size="large" />
          </div>
        ) : assets.length === 0 ? (
          <Empty description="אין קבצי מדיה" />
        ) : (
          <Table
            dataSource={assets}
            columns={columns}
            rowKey="id"
            pagination={{
              total: totalCount,
              pageSize: 24,
              current: page + 1,
              onChange: p => setPage(p - 1),
            }}
            scroll={{ x: 1000 }}
          />
        )}
      </Card>

      {/* Create Folder Modal */}
      <Modal
        title="יצירת תיקיה חדשה"
        open={createFolderModal}
        onCancel={() => setCreateFolderModal(false)}
        footer={null}
      >
        <Form layout="vertical" onFinish={handleCreateFolder}>
          <Form.Item name="name" label="שם תיקיה" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nameHe" label="שם בעברית">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit">צור תיקיה</Button>
        </Form>
      </Modal>
    </div>
  )
}
