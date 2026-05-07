import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ClientProviders from './client-providers'
import { Toaster } from 'react-hot-toast'
import Sidebar from '@/components/Sidebar'
import ChatWrapper from '@/components/ChatWrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lancelot - Broadcast Operations Platform',
  description: 'Enterprise broadcast operations ERP - planning, MCR, shifts, equipment, and more',
  icons: {
    icon: '/lancelot-small-logo.png',
    apple: '/lancelot-small-logo.png',
  },
  manifest: '/manifest.json',
  themeColor: '#3B82F6',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lancelot',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={inter.className}>
        <ClientProviders>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-gray-50">
              <div className="p-4 lg:p-8">
                {children}
              </div>
            </main>
          </div>
          {/* Toast notifications */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
                direction: 'rtl',
              },
              success: {
                iconTheme: {
                  primary: '#4ade80',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#f87171',
                  secondary: '#fff',
                },
              },
            }}
          />
          {/* Floating chat */}
          <ChatWrapper />
        </ClientProviders>
      </body>
    </html>
  )
} 