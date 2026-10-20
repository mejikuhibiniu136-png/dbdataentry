'use client';
import { motion, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
const STYLES: Record<Variant, string> = {
  primary: 'btn-sheen bg-gradient-to-r from-cyan-400 to-violet-500 text-slate-950 font-semibold shadow-[0_0_24px_-6px_rgb(34_211_238/0.6)] hover:shadow-[0_0_32px_-4px_rgb(34_211_238/0.8)]',
  ghost: 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]',
  subtle: 'text-slate-300 hover:bg-white/[0.06]',
  danger: 'border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
};

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: 'sm' | 'md';
  children: ReactNode;
}

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

export function Button({ variant = 'ghost', size = 'md', className = '', children, disabled, style, onPointerMove, onPointerLeave, ...rest }: Props) {
  // Tombol utama "tertarik" ke kursor (hanya mouse; sentuh dan "kurangi gerakan" dilewati).
  const reduce = useReducedMotion();
  const magnet = variant === 'primary' && !disabled && !reduce;
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 300, damping: 20, mass: 0.4 });
  const sy = useSpring(my, { stiffness: 300, damping: 20, mass: 0.4 });
  return (
    <motion.button
      style={magnet ? { x: sx, y: sy, ...style } : style}
      onPointerMove={(e) => {
        if (magnet && e.pointerType === 'mouse') {
          const r = e.currentTarget.getBoundingClientRect();
          mx.set(clamp((e.clientX - (r.left + r.width / 2)) * 0.18, 8));
          my.set(clamp((e.clientY - (r.top + r.height / 2)) * 0.25, 6) - 1);
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => { mx.set(0); my.set(0); onPointerLeave?.(e); }}
      whileHover={disabled || magnet ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      disabled={disabled}
      className={`inline-flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'min-h-8 px-3 py-1.5 text-xs' : 'px-4 py-2'} ${STYLES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
