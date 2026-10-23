'use client';
import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';

// Angka berjalan: bergerak halus dari nilai sebelumnya ke nilai baru (mis. total log naik lewat SSE).
export function AnimatedNumber({ value, suffix = '', duration = 0.9, className = '' }: { value: number; suffix?: string; duration?: number; className?: string }) {
  const n = Number.isFinite(value) ? value : 0;
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const reduce = useReducedMotion();
  const { n: fmtNumber, locale } = useI18n();
  const first = useRef(true);
  const fmt = (v: number) => `${fmtNumber(Math.round(v))}${suffix}`;

  useEffect(() => mv.on('change', (v) => { if (ref.current) ref.current.textContent = fmt(v); }), [mv, suffix]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reduce) { mv.set(n); return undefined; }
    const c = animate(mv, n, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [n, reduce, duration, mv]);

  // Denyut + cahaya singkat setiap nilai berubah (bukan saat pertama tampil).
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const node = ref.current;
    if (!node || reduce) return undefined;
    node.classList.remove('num-bump');
    void node.offsetWidth; // paksa reflow supaya animasi diputar ulang
    node.classList.add('num-bump');
    return undefined;
  }, [n, reduce]);

  return <span ref={ref} className={`tabular ${className}`} onAnimationEnd={(e) => e.currentTarget.classList.remove('num-bump')}>{fmt(n)}</span>;
}
