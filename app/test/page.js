'use client';

export default function TestErrorPage() {
  const triggerError = () => {
    throw new Error('Tes Error Sentry dari /test page!');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#020617',
      color: '#fff',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ color: '#38bdf8' }}>Sentry Test Diagnostic Page</h1>
      <p style={{ color: '#94a3b8' }}>Halaman ini khusus untuk menguji pengiriman error ke Sentry.</p>
      
      <button 
        onClick={triggerError}
        style={{
          marginTop: '20px',
          backgroundColor: '#dc2626',
          color: '#fff',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        Picu Test Error Sekarang
      </button>
    </div>
  );
}
