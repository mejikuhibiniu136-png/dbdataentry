'use client';

export default function SentryExamplePage() {
  const triggerError = () => {
    // Memanggil fungsi tak terdefinisi saat tombol diklik sesuai instruksi Sentry
    window.myUndefinedFunction();
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
      fontFamily: 'sans-serif',
      padding: '20px'
    }}>
      <h1 style={{ color: '#38bdf8' }}>Sentry Example Page</h1>
      <p style={{ color: '#94a3b8' }}>Klik tombol di bawah untuk mengirim sampel error ke Sentry.</p>

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
        Trigger Test Error
      </button>
    </div>
  );
}
