'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { AccountState } from '@/lib/accounts';

const TONES = {
  neutral: 'border-white/15 bg-white/[0.06] text-slate-200',
  ok: 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200',
  warn: 'border-amber-300/40 bg-amber-400/10 text-amber-200',
  bad: 'border-rose-300/40 bg-rose-400/10 text-rose-200',
  accent: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100',
  violet: 'border-violet-300/40 bg-violet-400/10 text-violet-100',
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone = 'neutral', children, dot, className = '' }: { tone?: Tone; children: ReactNode; dot?: 'live' | 'static'; className?: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {dot && <span aria-hidden className={`size-1.5 rounded-full bg-current ${dot === 'live' ? 'animate-pulse-dot' : ''}`} />}
      {children}
    </span>
  );
}

export const STATE_TONE: Record<AccountState, Tone> = { ONLINE: 'ok', STALLED: 'warn', OFFLINE: 'bad' };
export const STATE_COLOR: Record<AccountState, string> = { ONLINE: '#34d399', STALLED: '#fbbf24', OFFLINE: '#fb7185' };

// Label status bertukar dengan crossfade; titik berdenyut hanya saat ONLINE.
export function StatusPill({ state }: { state: AccountState }) {
  const { tr } = useI18n();
  return (
    <Pill tone={STATE_TONE[state]}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} className="inline-flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
          <span aria-hidden className={`size-1.5 rounded-full bg-current ${state === 'ONLINE' ? 'animate-pulse-dot' : ''}`} />
          {tr(state === 'ONLINE' ? 'Online' : state === 'STALLED' ? 'Stalled' : 'Offline')}
        </motion.span>
      </AnimatePresence>
    </Pill>
  );
}
