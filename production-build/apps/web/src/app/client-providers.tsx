'use client';

// Optimized Ant Design imports for Next.js 15
import { ConfigProvider, App } from 'antd';
import heIL from 'antd/lib/locale/he_IL';

// Apollo Client Provider
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from '../lib/apollo-client';
import { Heebo } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ChatProvider } from '@/contexts/ChatContext';

const heebo = Heebo({ subsets: ['hebrew'] });

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider>
        <WebSocketProvider>
          <ChatProvider>
        <ConfigProvider
          locale={heIL}
          direction="rtl"
          theme={{
            token: {
              fontFamily: heebo.style.fontFamily,
              borderRadius: 8,
              colorPrimary: '#1890ff',
            },
            components: {
              Card: {
                borderRadiusLG: 12,
                paddingLG: 24,
              },
              Button: {
                borderRadius: 6,
              },
            },
          }}
        >
          <App>
            {children}
          </App>
        </ConfigProvider>
          </ChatProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ApolloProvider>
  );
} 