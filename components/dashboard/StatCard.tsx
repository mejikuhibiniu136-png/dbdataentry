'use client';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

export function StatCard({ label, value, suffix, hint, icon, tone = 'cyan' }: { label: string; value: number; suffix?: string; hint?: string; icon: React.ReactNode; tone?: 'cyan' | 'violet' | 'emerald' | 'amber' }) {
  const ring = { cyan: 'text-cyan-300 bg-cyan-300/10 border-cyan-300/25', violet: 'text-violet-300 bg-violet-400/10 border-violet-400/25', emerald: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25', amber: 'text-amber-300 bg-amber-400/10 border-amber-400/25' }[tone];
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="glass glass-hover p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className={`grid size-8 place-items-center rounded-lg border ${ring}`}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-white"><AnimatedNumber value={value} suffix={suffix} /></div>
      {hint && <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>}
    </motion.div>
  );
}
