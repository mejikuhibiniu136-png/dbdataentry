'use client';
import { useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import type { PointerEvent } from 'react';

// Miring 3D mengikuti kursor (hanya mouse; sentuh dan "kurangi gerakan" dilewati). Mengembalikan
// style + handler untuk disebar ke elemen motion.* mana pun.
export function useTilt(max = 7) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 220, damping: 20 });
  const sy = useSpring(py, { stiffness: 220, damping: 20 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);
  return {
    style: { rotateX, rotateY, transformPerspective: 900 },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (reduce || e.pointerType !== 'mouse') return;
      const r = e.currentTarget.getBoundingClientRect();
      px.set((e.clientX - r.left) / r.width - 0.5);
      py.set((e.clientY - r.top) / r.height - 0.5);
    },
    onPointerLeave: () => { px.set(0); py.set(0); },
  };
}
