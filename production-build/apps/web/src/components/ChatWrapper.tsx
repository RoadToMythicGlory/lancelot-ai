'use client';

import dynamic from 'next/dynamic';

const ChatManager = dynamic(() => import('./chat/ChatManager'), { 
  ssr: false,
  loading: () => null 
});

export default function ChatWrapper() {
  return <ChatManager />;
}
