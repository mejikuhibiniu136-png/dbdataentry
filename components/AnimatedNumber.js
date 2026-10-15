'use client';

import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

// Angka yang bergerak halus ke nilai barunya (mis. latensi). Nilai tidak valid -> `fallback`.
export function AnimatedNumber({ value, suffix = '', fallback = '-', duration = 0.5 }) {
  const n = Number(value);
  const valid = value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n > 0;
  const ref = useRef(null);
  const motionValue = useMotionValue(valid ? n : 0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const unsubscribe = motionValue.on('change', (v) => {
      if (ref.current) ref.current.textContent = `${Math.round(v)}${suffix}`;
    });
    return unsubscribe;
  }, [motionValue, suffix]);

  useEffect(() => {
    if (!valid) return undefined;
    if (reduce) {
      motionValue.set(n);
      return undefined;
    }
    const controls = animate(motionValue, n, { duration, ease: 'easeOut' });
    return () => controls.stop();
  }, [valid, n, reduce, duration, motionValue]);

  return (
    <span ref={ref} className="tabular">
      {valid ? `${Math.round(n)}${suffix}` : fallback}
    </span>
  );
}
