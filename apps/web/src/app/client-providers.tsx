'use client';

// Optimized Ant Design imports for Next.js 15
import { ConfigProvider, App, unstableSetRender } from 'antd';
import { createRoot, type Root } from 'react-dom/client';
import heIL from 'antd/lib/locale/he_IL';

// React 19 compatibility shim for antd v5.
// Next.js 15 ships a bundled React 19 that antd v5 detects at runtime, which
// produces the "[antd: compatible] antd v5 support React is 16 ~ 18" warning
// and routes portal/Wave/static-method renders through the legacy
// ReactDOM.render path. Swapping antd's internal renderer for createRoot
// (the documented fix at https://ant.design/docs/react/v5-for-19) silences
// the warning and uses the modern, concurrent-safe rendering path on both
// React 18 and React 19.
type ReactRootContainer = Element | DocumentFragment | (Element & { _reactRoot?: Root });
unstableSetRender((node, container) => {
  const target = container as ReactRootContainer & { _reactRoot?: Root };
  target._reactRoot ||= createRoot(target);
  const root = target._reactRoot;
  root.render(node);
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.unmount();
  };
});

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