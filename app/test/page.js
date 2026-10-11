'use client';

export default function TestErrorPage() {
  // Instruksi resmi dari layar Verify Sentry
  myUndefinedFunction();

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h1>Sentry Test Page</h1>
    </div>
  );
}
