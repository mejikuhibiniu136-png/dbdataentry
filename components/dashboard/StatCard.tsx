'use client';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

const RING = {
  cyan: 'text-cyan-200 bg-cyan-300/10 border-cyan-300/30',
  violet: 'text-violet-200 bg-violet-400/10 border-violet-300/30',
  emerald: 'text-emerald-200 bg-emerald-400/10 border-emerald-300/30',
  amber: 'text-amber-200 bg-amber-400/10 border-amber-300/30',
};

// Tinggi kartu dikunci (7.25rem, sama dengan SIZE.stat di Skeleton) agar pergantian skeleton -> data tidak menggeser tata letak.
// Tanpa animasi masuk: angka berjalan (<= 150 ms) sudah cukup sebagai umpan balik.
export function StatCard({ label, value, suffix, display, hint, icon, tone = 'cyan' }: { index?: number; label: string; value: number; suffix?: string; /** Isi kustom menggantikan angka berjalan (mis. durasi). */ display?: React.ReactNode; hint?: string; icon: React.ReactNode; tone?: 'cyan' | 'violet' | 'emerald' | 'amber' }) {
  return (
    <div className="glass glass-hover flex h-[7.25rem] flex-col justify-between overflow-hidden p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-slate-300">{label}</span>
        <span className={`grid size-8 flex-none place-items-center rounded-lg border ${RING[tone]}`} aria-hidden>{icon}</span>
      </div>
      <div className={`truncate font-semibold text-white ${display ? 'text-2xl sm:text-3xl' : 'text-3xl'}`}>{display ?? <AnimatedNumber value={value} suffix={suffix} />}</div>
      <div className="h-4 truncate text-xs text-slate-400">{hint ?? '\u00a0'}</div>
    </div>
  );
}
