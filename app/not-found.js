import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="login-page">
      <div className="card login-card" style={{ textAlign: 'center' }}>
        <div className="brand-logo" aria-hidden="true">🛰️</div>
        <h2>404 - Tidak ditemukan</h2>
        <p className="sub">Halaman yang Anda cari tidak ada.</p>
        <Link className="btn btn-primary" href="/">Kembali ke dashboard</Link>
      </div>
    </main>
  );
}
