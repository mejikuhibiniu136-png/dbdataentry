'use client';

import { useEffect } from 'react';

// Batas error untuk seluruh halaman: tampilkan pesan ramah dan tombol coba lagi.
export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="login-page">
      <div className="card login-card" style={{ textAlign: 'center' }} role="alert">
        <div className="brand-logo" aria-hidden="true">⚠️</div>
        <h2>Terjadi kesalahan</h2>
        <p className="sub">Halaman gagal dimuat. Coba muat ulang; data Anda aman.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => reset()}>Coba lagi</button>
          <button className="btn" onClick={() => { window.location.href = '/'; }}>Ke beranda</button>
        </div>
      </div>
    </main>
  );
}
