'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
// Kontras (WCAG AA): teks primer slate-950 di atas gradien cyan/violet >= 7:1; teks ghost slate-100 di atas latar gelap >= 12:1.
const STYLES: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-cyan-300 to-violet-400 text-slate-950 font-semibold hover:brightness-110',
  ghost: 'border border-white/15 bg-white/[0.05] text-slate-100 hover:border-white/30 hover:bg-white/[0.1]',
  subtle: 'text-slate-200 hover:bg-white/[0.08]',
  danger: 'border border-rose-300/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25',
};

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: 'sm' | 'md';
  children: ReactNode;
}

// Tombol tanpa library animasi: transisi warna 150 ms lewat CSS, umpan balik tekan lewat active:scale.
// Tinggi minimal 40px (44px pada layar sentuh) dan cincin fokus global dari :focus-visible.
export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = 'ghost', size = 'md', className = '', children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`touch-target inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-sm transition-[background-color,border-color,filter,transform] duration-150 select-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${size === 'sm' ? 'min-h-9 px-3 py-1.5 text-xs' : 'min-h-10 px-4 py-2'} ${STYLES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
