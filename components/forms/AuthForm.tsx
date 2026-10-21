'use client';
import { motion, useReducedMotion } from 'motion/react';
import { Eye, EyeOff, Radar } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { PulseBackdrop } from '@/components/three/PulseBackdrop';
import { PULSE_EVENT } from '@/components/three/pulse';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n();
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
  const [leaving, setLeaving] = useState(false);
  const reduce = useReducedMotion();
  // Hamparan titik di latar bereaksi pada interaksi: riak kecil saat mengetik (maks. ~3x/dtk), gelombang besar saat berhasil masuk.
  const lastPing = useRef(0);
  const ping = (count = 1) => {
    const now = performance.now();
    if (count === 1 && now - lastPing.current < 350) return;
    lastPing.current = now;
    window.dispatchEvent(new CustomEvent(PULSE_EVENT, { detail: { count } }));
  };
  const registered = params.get('registered') === '1';

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (loading || leaving) return;
    setError('');
    if (!isLogin && password !== confirm) { setError(t('auth.mismatch')); return; }
    setLoading(true);
    try {
      const res = await fetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setError(data.message || t('auth.errorGeneric')); return; }
      if (isLogin) {
        // Adegan 3D "melompat" (warp) sebentar sebelum masuk dashboard.
        setLeaving(true);
        ping(8); setTimeout(() => ping(8), 140); setTimeout(() => ping(8), 300);
        await new Promise((r) => setTimeout(r, reduce ? 0 : 650));
        router.push('/'); router.refresh();
      } else router.push('/login?registered=1');
    } catch {
      setError(t('auth.errorNetwork'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden p-4">
      <PulseBackdrop />
      <div className="absolute top-4 right-4 z-10"><LanguageSwitcher align="right" /></div>
      <motion.form onSubmit={submit} aria-busy={loading} className="glass relative z-10 w-full max-w-sm space-y-5 p-7" initial={{ opacity: 0, y: 28, scale: 0.96 }} animate={leaving ? { opacity: 0, y: -12, scale: 0.94 } : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: leaving ? 0.5 : 0.7, delay: leaving ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <div className="text-center">
          <div className="ring-spin mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_32px_-6px_rgb(34_211_238/0.7)]"><Radar className="size-6" aria-hidden /></div>
          <h1 className="text-xl font-semibold text-white">{isLogin ? t('auth.loginTitle') : t('auth.registerTitle')}</h1>
          <p className="mt-1 text-sm text-slate-400">{isLogin ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}</p>
        </div>

        {registered && isLogin && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-center text-sm text-emerald-200">{t('auth.registered')}</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-center text-sm text-rose-200">{error}</div>}

        <div>
          <label htmlFor={`${uid}-u`} className="mb-1.5 block text-xs font-medium text-slate-400">{t('auth.username')}</label>
          <input id={`${uid}-u`} className="field" autoComplete="username" autoFocus value={username} onChange={(e) => { setUsername(e.target.value); ping(); }} required maxLength={64} />
        </div>

        <div>
          <label htmlFor={`${uid}-p`} className="mb-1.5 block text-xs font-medium text-slate-400">{t('auth.password')}</label>
          <div className="relative">
            <input id={`${uid}-p`} className="field pr-11" type={show ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => { setPassword(e.target.value); ping(); }} onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') === true)} onBlur={() => setCaps(false)} required minLength={isLogin ? 1 : 8} maxLength={128} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')} aria-pressed={show} className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center text-slate-400 hover:text-white">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {!isLogin && <p className="mt-1.5 text-xs text-slate-500">{t('auth.minChars')}</p>}
          {caps && <p className="mt-1.5 text-xs text-amber-300">{t('auth.capsLock')}</p>}
        </div>

        {!isLogin && (
          <div>
            <label htmlFor={`${uid}-c`} className="mb-1.5 block text-xs font-medium text-slate-400">{t('auth.confirmPassword')}</label>
            <input id={`${uid}-c`} className="field" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={128} />
          </div>
        )}

        <Button type="submit" variant="primary" disabled={loading || leaving} className="w-full py-2.5">{loading ? t('auth.processing') : isLogin ? t('auth.login') : t('auth.register')}</Button>

        <p className="text-center text-sm text-slate-400">
          {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}
          <Link href={isLogin ? '/register' : '/login'} className="text-cyan-300 underline-offset-4 hover:underline">{isLogin ? t('auth.register') : t('auth.login')}</Link>
        </p>
      </motion.form>
    </main>
  );
}
