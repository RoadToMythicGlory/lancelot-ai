'use client';

export default function TestPage() {
  console.log('🧪 Test page rendered!');
  
  return (
    <div>
      <h1>Test Page</h1>
      <p>If you can see this, routing works!</p>
      <p>Token: {typeof window !== 'undefined' ? localStorage.getItem('auth-token')?.substring(0, 50) + '...' : 'SSR'}</p>
    </div>
  );
}
