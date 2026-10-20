'use client';
import { useEffect } from 'react';

// Cahaya yang mengikuti kursor di semua panel `.glass-hover`. Satu listener untuk seluruh aplikasi,
// hanya aktif di perangkat dengan kursor (hover + pointer halus); layar sentuh tidak terpengaruh.
export function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('.glass-hover');
      if (!el) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => { document.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
