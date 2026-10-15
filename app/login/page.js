'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.message || (res.status === 429 ? 'Terlalu banyak percobaan, coba lagi nanti' : 'Gagal masuk'));
      }
    } catch (err) {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <form onSubmit={handleLogin} className="card login-card" aria-busy={loading}>
        <div className="brand-logo" aria-hidden="true">🔒</div>
        <h2>Access Control</h2>
        <p className="sub">Masukkan kredensial dbdataentry</p>

        {error && <div className="banner banner-bad" role="alert" style={{ justifyContent: 'center' }}>{error}</div>}

        <div className="form-group">
          <label htmlFor="username">USERNAME</label>
          <input
            id="username"
            className="field"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">PASSWORD</label>
          <div className="pw-wrap">
            <input
              id="password"
              className="field"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') === true)}
              onBlur={() => setCapsLock(false)}
              required
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>
          {capsLock && <div className="hint" style={{ color: 'var(--warn)', marginTop: 6 }}>⚠ Caps Lock sedang aktif</div>}
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 12 }}>
          {loading ? 'Verifikasi...' : 'Masuk Dashboard'}
        </button>
      </form>
    </main>
  );
}
