'use client';

import React, { useState } from 'react';
import { MCRBulletinPost } from '../types';
import RichTextEditor from './RichTextEditor';

export default function BulletinWidget() {
  const [posts, setPosts] = useState<MCRBulletinPost[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [expiryType, setExpiryType] = useState<'date' | 'untilNew'>('date');
  const [expiryDate, setExpiryDate] = useState('');
  
  // TODO: Get current user from auth context
  const currentUser = { id: '1', name: 'User', isAdmin: false };

  const handleCreatePost = () => {
    if (!newPostContent.trim()) return;

    const newPost: MCRBulletinPost = {
      id: Date.now().toString(),
      content: newPostContent,
      createdBy: currentUser.name,
      createdAt: new Date(),
      expiryDate: expiryType === 'date' && expiryDate ? new Date(expiryDate) : undefined,
      untilNewPost: expiryType === 'untilNew',
    };

    setPosts([newPost, ...posts]);
    setNewPostContent('');
    setShowNewPost(false);
    setExpiryDate('');
  };

  const handleDeletePost = (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    // Check if user can delete (admin can delete all, users can delete their own)
    if (currentUser.isAdmin || post.createdBy === currentUser.name) {
      setPosts(posts.filter(p => p.id !== postId));
    }
  };

  const getActivePost = () => {
    const now = new Date();
    return posts.filter(post => {
      if (post.untilNewPost) return true;
      if (post.expiryDate) return post.expiryDate > now;
      return false;
    });
  };

  return (
    <div className="h-full bg-white rounded-lg shadow-lg p-4 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">הודעות חשובות</h2>
        <button
          onClick={() => setShowNewPost(!showNewPost)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          הודעה חדשה +
        </button>
      </div>

      {showNewPost && (
        <div className="mb-4 p-4 border rounded-lg bg-gray-50">
          <RichTextEditor
            value={newPostContent}
            onChange={setNewPostContent}
            placeholder="הזן תוכן הודעה..."
          />
          
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="date"
                checked={expiryType === 'date'}
                onChange={(e) => setExpiryType(e.target.value as 'date' | 'untilNew')}
                className="mr-2"
              />
              הגבל תאריך
            </label>
            {expiryType === 'date' && (
              <input
                type="datetime-local"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="p-1 border rounded"
              />
            )}
            <label className="flex items-center">
              <input
                type="radio"
                value="untilNew"
                checked={expiryType === 'untilNew'}
                onChange={(e) => setExpiryType(e.target.value as 'date' | 'untilNew')}
                className="mr-2"
              />
              עד הודעה חדשה
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreatePost}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              פרסם
            </button>
            <button
              onClick={() => {
                setShowNewPost(false);
                setNewPostContent('');
              }}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3">
        {getActivePost().length === 0 ? (
          <p className="text-gray-500 text-center py-8">אין הודעות פעילות</p>
        ) : (
          getActivePost().map((post) => (
            <div key={post.id} className="p-3 border rounded-lg bg-yellow-50 relative">
              <div className="pr-8">
                <div 
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: post.content }}
                />
                <div className="mt-2 text-xs text-gray-500">
                  <span>נוצר על ידי: {post.createdBy}</span>
                  <span className="mx-2">|</span>
                  <span>{new Date(post.createdAt).toLocaleString('he-IL')}</span>
                  {post.expiryDate && (
                    <>
                      <span className="mx-2">|</span>
                      <span>תפוגה: {new Date(post.expiryDate).toLocaleString('he-IL')}</span>
                    </>
                  )}
                  {post.untilNewPost && (
                    <>
                      <span className="mx-2">|</span>
                      <span>עד הודעה חדשה</span>
                    </>
                  )}
                </div>
              </div>
              
              {(currentUser.isAdmin || post.createdBy === currentUser.name) && (
                <button
                  onClick={() => handleDeletePost(post.id)}
                  className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                  title="מחק הודעה"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

