'use client';
import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';

const MAX_S = 0.15;

// Angka berjalan: bergerak dari nilai sebelumnya ke nilai baru, maksimal 150 ms.
// Lebar dikunci dengan tabular-nums sehingga tidak ada pergeseran tata letak saat angka berubah.
export function AnimatedNumber({ value, suffix = '', duration = MAX_S, className = '' }: { value: number; suffix?: string; duration?: number; className?: string }) {
  const n = Number.isFinite(value) ? value : 0;
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(n);
  const reduce = useReducedMotion();
  const { n: fmtNumber } = useI18n();
  const fmt = (v: number) => `${fmtNumber(Math.round(v))}${suffix}`;

  useEffect(() => mv.on('change', (v) => { if (ref.current) ref.current.textContent = fmt(v); }), [mv, suffix]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reduce) { mv.set(n); return undefined; }
    const c = animate(mv, n, { duration: Math.min(duration, MAX_S), ease: [0.2, 0, 0, 1] });
    return () => c.stop();
  }, [n, reduce, duration, mv]);

  return <span ref={ref} className={`tabular ${className}`}>{fmt(n)}</span>;
}
