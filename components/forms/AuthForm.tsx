'use client';
import { motion } from 'motion/react';
import { Eye, EyeOff, Radar } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const router = useRouter();
  const params = useSearchParams();
  const uid = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const registered = params.get('registered') === '1';

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (!isLogin && password !== confirm) { setError('Konfirmasi password tidak sama'); return; }
    setLoading(true);
    try {
      const res = await fetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setError(data.message || 'Terjadi kesalahan'); return; }
      if (isLogin) { router.push('/'); router.refresh(); } else router.push('/login?registered=1');
    } catch {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <motion.form onSubmit={submit} aria-busy={loading} className="glass w-full max-w-sm space-y-5 p-7" initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
        <div className="text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_32px_-6px_rgb(34_211_238/0.7)]"><Radar className="size-6" aria-hidden /></div>
          <h1 className="text-xl font-semibold text-white">{isLogin ? 'Masuk ke dbdataentry' : 'Buat akun'}</h1>
          <p className="mt-1 text-sm text-slate-400">{isLogin ? 'Pantau webhook dan status akun secara real-time.' : 'Akun baru memiliki akses lihat (role user).'}</p>
        </div>

        {registered && isLogin && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-center text-sm text-emerald-200">Akun dibuat. Silakan masuk.</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-center text-sm text-rose-200">{error}</div>}

        <div>
          <label htmlFor={`${uid}-u`} className="mb-1.5 block text-xs font-medium text-slate-400">Username</label>
          <input id={`${uid}-u`} className="field" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={64} />
        </div>

        <div>
          <label htmlFor={`${uid}-p`} className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
          <div className="relative">
            <input id={`${uid}-p`} className="field pr-11" type={show ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') === true)} onBlur={() => setCaps(false)} required minLength={isLogin ? 1 : 8} maxLength={128} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={show} className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center text-slate-400 hover:text-white">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {!isLogin && <p className="mt-1.5 text-xs text-slate-500">Minimal 8 karakter.</p>}
          {caps && <p className="mt-1.5 text-xs text-amber-300">Caps Lock sedang aktif</p>}
        </div>

        {!isLogin && (
          <div>
            <label htmlFor={`${uid}-c`} className="mb-1.5 block text-xs font-medium text-slate-400">Ulangi password</label>
            <input id={`${uid}-c`} className="field" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={128} />
          </div>
        )}

        <Button type="submit" variant="primary" disabled={loading} className="w-full py-2.5">{loading ? 'Memproses…' : isLogin ? 'Masuk' : 'Daftar'}</Button>

        <p className="text-center text-sm text-slate-400">
          {isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <Link href={isLogin ? '/register' : '/login'} className="text-cyan-300 underline-offset-4 hover:underline">{isLogin ? 'Daftar' : 'Masuk'}</Link>
        </p>
      </motion.form>
    </main>
  );
}
