'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type ConversationHandler = (user: { id: string; fullName: string; email?: string; department?: string; role?: string; status?: string }, conversationId?: string) => void;

type ChatContextValue = {
  registerConversationHandler: (handler: ConversationHandler) => void;
  openConversation: (user: { id: string; fullName: string; email?: string; department?: string; role?: string; status?: string }, conversationId?: string) => void;
};

const ChatContext = createContext<ChatContextValue>({
  registerConversationHandler: () => {},
  openConversation: () => {},
});

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handlerRef = useRef<ConversationHandler | null>(null);

  const registerConversationHandler = useCallback((handler: ConversationHandler) => {
    handlerRef.current = handler;
  }, []);

  const openConversation = useCallback<ChatContextValue['openConversation']>((user, conversationId) => {
    handlerRef.current?.(user, conversationId);
  }, []);

  const value = useMemo<ChatContextValue>(() => ({ registerConversationHandler, openConversation }), [registerConversationHandler, openConversation]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);


