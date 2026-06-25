'use client';

/**
 * Legacy entry-point for the old standalone operations page.
 *
 * The calendar / worker-search / reports / reference-data views are now
 * tabs inside the main External Broadcasts page (`/external-broadcasts`).
 * Anyone hitting this URL is sent there so old bookmarks/links keep
 * working without two parallel surfaces existing in the UI.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';

export default function OperationsPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/external-broadcasts?tab=all-broadcasts');
  }, [router]);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <Spin size="large" tip="מעביר לדף שידורי חוץ..." />
    </div>
  );
}
