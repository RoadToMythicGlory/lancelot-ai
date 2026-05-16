'use client';

import React, { useState } from 'react';
import { Button, Card, Radio, DatePicker, Space, Empty, Popconfirm, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { MCRBulletinPost } from '../types';
import RichTextEditor from './RichTextEditor';
import { sanitizeMcrHtml } from '../utils/sanitizeHtml';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function BulletinWidget() {
  const [posts, setPosts] = useState<MCRBulletinPost[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [expiryType, setExpiryType] = useState<'date' | 'untilNew'>('date');
  const [expiryDate, setExpiryDate] = useState<dayjs.Dayjs | null>(null);

  // TODO: Get current user from auth context
  const currentUser = { id: '1', name: 'User', isAdmin: false };

  const handleCreatePost = () => {
    if (!newPostContent.trim()) return;

    const newPost: MCRBulletinPost = {
      id: Date.now().toString(),
      content: newPostContent,
      createdBy: currentUser.name,
      createdAt: new Date(),
      expiryDate: expiryType === 'date' && expiryDate ? expiryDate.toDate() : undefined,
      untilNewPost: expiryType === 'untilNew',
    };

    setPosts([newPost, ...posts]);
    setNewPostContent('');
    setShowNewPost(false);
    setExpiryDate(null);
  };

  const handleDeletePost = (postId: string) => {
    setPosts(posts.filter(p => p.id !== postId));
  };

  const getActivePost = () => {
    const now = new Date();
    return posts.filter(post => {
      if (post.untilNewPost) return true;
      if (post.expiryDate) return post.expiryDate > now;
      return false;
    });
  };

  const activePosts = getActivePost();

  return (
    <div className="h-full bg-white rounded-lg shadow-lg p-4 flex flex-col" dir="rtl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">הודעות חשובות</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setShowNewPost(!showNewPost)}
        >
          הודעה חדשה
        </Button>
      </div>

      {showNewPost && (
        <Card size="small" className="mb-4 bg-gray-50">
          <RichTextEditor
            value={newPostContent}
            onChange={setNewPostContent}
            placeholder="הזן תוכן הודעה..."
          />

          <div className="mt-3">
            <Radio.Group
              value={expiryType}
              onChange={(e) => setExpiryType(e.target.value)}
            >
              <Space>
                <Radio value="date">הגבל תאריך</Radio>
                <Radio value="untilNew">עד הודעה חדשה</Radio>
              </Space>
            </Radio.Group>
            {expiryType === 'date' && (
              <DatePicker
                showTime
                format="DD/MM/YYYY HH:mm"
                value={expiryDate}
                onChange={setExpiryDate}
                className="mt-2"
                placeholder="בחר תאריך תפוגה"
              />
            )}
          </div>

          <Space className="mt-3">
            <Button type="primary" onClick={handleCreatePost}>
              פרסם
            </Button>
            <Button onClick={() => { setShowNewPost(false); setNewPostContent(''); }}>
              ביטול
            </Button>
          </Space>
        </Card>
      )}

      <div className="flex-1 overflow-y-auto space-y-3">
        {activePosts.length === 0 ? (
          <Empty description="אין הודעות פעילות" />
        ) : (
          activePosts.map((post) => (
            <Card key={post.id} size="small" className="bg-yellow-50 relative">
              <div className="pr-6">
                <div
                  className="prose max-w-none prose-strong:text-inherit"
                  dangerouslySetInnerHTML={{ __html: sanitizeMcrHtml(post.content) }}
                />
                <div className="mt-2 text-xs text-gray-500">
                  <Text type="secondary">נוצר על ידי: {post.createdBy}</Text>
                  <span className="mx-2">|</span>
                  <Text type="secondary">{new Date(post.createdAt).toLocaleString('he-IL')}</Text>
                  {post.expiryDate && (
                    <>
                      <span className="mx-2">|</span>
                      <Text type="secondary">תפוגה: {new Date(post.expiryDate).toLocaleString('he-IL')}</Text>
                    </>
                  )}
                  {post.untilNewPost && (
                    <>
                      <span className="mx-2">|</span>
                      <Text type="secondary">עד הודעה חדשה</Text>
                    </>
                  )}
                </div>
              </div>

              {(currentUser.isAdmin || post.createdBy === currentUser.name) && (
                <Popconfirm
                  title="מחיקת הודעה"
                  description="האם אתה בטוח?"
                  onConfirm={() => handleDeletePost(post.id)}
                  okText="כן"
                  cancelText="לא"
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    className="absolute top-2 left-2"
                  />
                </Popconfirm>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
