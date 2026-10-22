'use client';
import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react';
import { gsap, prefersReducedMotion, EASE_OUT } from '@/lib/motion/gsap';

// Menampilkan anak bertanda `data-reveal` berurutan (stagger). "Kurangi gerakan": tidak ada animasi, konten
// langsung terlihat. Konten tidak pernah dibiarkan tersembunyi: clearProps menghapus gaya setelah selesai.
export function GsapReveal({
  as: Tag = 'div', selector = '[data-reveal]', stagger = 0.07, y = 18, className, children,
}: { as?: ElementType; selector?: string; stagger?: number; y?: number; className?: string; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>(selector);
      if (!items.length) return;
      gsap.from(items, { autoAlpha: 0, y, duration: 0.6, ease: EASE_OUT, stagger, clearProps: 'opacity,visibility,transform' });
    }, el);
    return () => ctx.revert();
  }, [selector, stagger, y]);

  return <Tag ref={root} className={className}>{children}</Tag>;
}
