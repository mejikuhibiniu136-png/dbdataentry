'use client';
import { motion } from 'motion/react';
import { Boxes, ChartColumn, LayoutDashboard, LogOut, Radar, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { Pill } from '@/components/ui/Pill';

export type ViewId = 'overview' | 'logs' | 'games' | 'accounts' | 'analytics' | 'system';

export const VIEWS: { id: ViewId; label: string; icon: typeof Radar; admin?: boolean }[] = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'logs', label: 'Log', icon: ScrollText },
  { id: 'games', label: 'Tabel Game', icon: Boxes },
  { id: 'accounts', label: 'Akun', icon: Users },
  { id: 'analytics', label: 'Analitik', icon: ChartColumn },
  { id: 'system', label: 'Sistem', icon: ShieldCheck, admin: true },
];

export function Sidebar({ view, onView, isAdmin, username, onLogout }: { view: ViewId; onView: (v: ViewId) => void; isAdmin: boolean; username: string; onLogout: () => void }) {
  const items = VIEWS.filter((v) => !v.admin || isAdmin);
  return (
    <>
      {/* Desktop */}
      <aside className="glass sticky top-4 hidden h-[calc(100dvh-2rem)] w-60 flex-none flex-col p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_24px_-6px_rgb(34_211_238/0.7)]"><Radar className="size-5" aria-hidden /></span>
          <span className="text-base font-semibold text-white">dbdataentry</span>
        </div>
        <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
          {items.map((v) => {
            const active = v.id === view;
            return (
              <button key={v.id} onClick={() => onView(v.id)} aria-current={active ? 'page' : undefined} className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${active ? 'text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'}`}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-cyan-300/25 bg-gradient-to-r from-cyan-300/15 to-violet-400/10" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <v.icon className="relative size-4" aria-hidden /><span className="relative">{v.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
          <div className="px-1"><div className="truncate text-sm font-medium text-white">{username}</div><Pill tone={isAdmin ? 'violet' : 'neutral'} className="mt-1">{isAdmin ? 'admin' : 'user'}</Pill></div>
          <button onClick={onLogout} className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white"><LogOut className="size-4" aria-hidden />Keluar</button>
        </div>
      </aside>

      {/* Mobile: bar bawah */}
      <nav aria-label="Navigasi utama" className="glass fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl p-1.5 lg:hidden">
        {items.map((v) => (
          <button key={v.id} onClick={() => onView(v.id)} aria-current={v.id === view ? 'page' : undefined} aria-label={v.label} className={`grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-xl px-2 ${v.id === view ? 'bg-cyan-300/15 text-cyan-200' : 'text-slate-400'}`}>
            <v.icon className="size-5" aria-hidden />
          </button>
        ))}
        <button onClick={onLogout} aria-label="Keluar" className="grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-xl px-2 text-slate-400"><LogOut className="size-5" aria-hidden /></button>
      </nav>
    </>
  );
}
