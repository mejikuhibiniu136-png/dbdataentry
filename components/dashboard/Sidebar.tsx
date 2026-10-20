'use client';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Boxes, ChartColumn, Ellipsis, LayoutDashboard, LogOut, MapPinned, MonitorSmartphone, Radar, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useEscape } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { ROLE_LABEL_KEY } from '@/lib/rbac/permissions';
import type { MessageKey } from '@/lib/i18n/dictionaries/en';
import type { Role } from '@/types';

export type ViewId = 'overview' | 'logs' | 'games' | 'accounts' | 'live' | 'analytics' | 'users' | 'sessions' | 'system';

const ROLE_TONE: Record<Role, 'violet' | 'accent' | 'neutral'> = { superadmin: 'violet', admin: 'accent', viewer: 'neutral' };

// `staffOnly`: admin + superadmin. `superadminOnly`: hanya superadmin (akun permanen dari .env Vercel).
export const VIEWS: { id: ViewId; labelKey: MessageKey; icon: typeof Radar; staffOnly?: boolean; superadminOnly?: boolean }[] = [
  { id: 'overview', labelKey: 'nav.overview', icon: LayoutDashboard },
  { id: 'logs', labelKey: 'nav.logs', icon: ScrollText },
  { id: 'games', labelKey: 'nav.games', icon: Boxes },
  { id: 'accounts', labelKey: 'nav.accounts', icon: Users },
  { id: 'live', labelKey: 'nav.live', icon: MapPinned },
  { id: 'analytics', labelKey: 'nav.analytics', icon: ChartColumn },
  { id: 'users', labelKey: 'nav.users', icon: Users, staffOnly: true },
  { id: 'sessions', labelKey: 'nav.sessions', icon: MonitorSmartphone },
  { id: 'system', labelKey: 'nav.system', icon: ShieldCheck, superadminOnly: true },
];

export function Sidebar({
  view, onView, role, username, onLogout, pendingCount = 0,
}: { view: ViewId; onView: (v: ViewId) => void; role: Role; username: string; onLogout: () => void; pendingCount?: number }) {
  const { t, tr } = useI18n();
  const [more, setMore] = useState(false);
  const isStaff = role === 'admin' || role === 'superadmin';
  const isSuperadmin = role === 'superadmin';
  const items = VIEWS.filter((v) => (!v.staffOnly || isStaff) && (!v.superadminOnly || isSuperadmin));

  const badge = (id: ViewId) => (id === 'users' && isSuperadmin && pendingCount > 0 ? pendingCount : null);

  // Mobile: bar bawah maksimal 5 slot (4 menu utama + "Lainnya"). Sisanya, bahasa, dan keluar ada di panel.
  const primary = items.slice(0, 4);
  const rest = items.slice(4);
  const restActive = rest.some((v) => v.id === view);
  const restBadge = rest.reduce((sum, v) => sum + (badge(v.id) ?? 0), 0);
  useEscape(more, () => setMore(false));

  return (
    <>
      {/* Desktop */}
      <aside className="glass sticky top-4 hidden h-[calc(100dvh-2rem)] w-60 flex-none flex-col p-4 lg:flex">
        <div className="mb-4 flex shrink-0 items-center gap-2.5 px-2 [@media(max-height:720px)]:mb-2">
          <span className="ring-spin grid size-9 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_24px_-6px_rgb(34_211_238/0.7)]"><Radar className="size-5" aria-hidden /></span>
          <span className="text-base font-semibold text-white">dbdataentry</span>
        </div>
        <nav data-tour="nav" aria-label={t('nav.main')} className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-1">
          {items.map((v, i) => {
            const active = v.id === view;
            const count = badge(v.id);
            return (
              <motion.button key={v.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.05 }} whileHover={active ? undefined : { x: 3 }} onClick={() => onView(v.id)} aria-current={active ? 'page' : undefined} className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors [@media(max-height:720px)]:py-1.5 ${active ? 'text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'}`}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-cyan-300/25 bg-gradient-to-r from-cyan-300/15 to-violet-400/10 shadow-[0_0_20px_-6px_rgb(34_211_238/0.55)]" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
                <v.icon className="relative size-4" aria-hidden /><span className="relative flex-1">{t(v.labelKey)}</span>
                {count !== null && <span className="relative grid min-w-5 place-items-center rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900">{count}</span>}
              </motion.button>
            );
          })}
        </nav>
        <div className="mt-2 shrink-0 space-y-2 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between gap-2 px-1"><span className="truncate text-sm font-medium text-white">{username}</span><Pill tone={ROLE_TONE[role]}>{t(ROLE_LABEL_KEY[role])}</Pill></div>
          <LanguageSwitcher dropUp />
          <button onClick={onLogout} className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white"><LogOut className="size-4" aria-hidden />{t('nav.logout')}</button>
        </div>
      </aside>

      {/* Mobile: bar bawah (maks 5 slot) + panel "Lainnya" */}
      {more && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div id="more-menu" role="dialog" aria-label={tr('Menu lainnya')} className="glass glass-solid absolute inset-x-3 bottom-[5.25rem] max-h-[70dvh] overflow-y-auto p-2">
            {rest.map((v) => {
              const count = badge(v.id);
              return (
                <button key={v.id} onClick={() => { onView(v.id); setMore(false); }} aria-current={v.id === view ? 'page' : undefined} className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm ${v.id === view ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-300 hover:bg-white/[0.05]'}`}>
                  <v.icon className="size-4" aria-hidden /><span className="flex-1">{t(v.labelKey)}</span>
                  {count !== null && <span className="grid min-w-5 place-items-center rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900">{count}</span>}
                </button>
              );
            })}
            <div className="mt-2 space-y-2 border-t border-white/10 px-1 pt-3">
              <div className="flex items-center justify-between gap-2 px-2"><span className="truncate text-sm font-medium text-white">{username}</span><Pill tone={ROLE_TONE[role]}>{t(ROLE_LABEL_KEY[role])}</Pill></div>
              <LanguageSwitcher dropUp />
              <button onClick={onLogout} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-slate-300 hover:bg-white/[0.05]"><LogOut className="size-4" aria-hidden />{t('nav.logout')}</button>
            </div>
          </div>
        </div>
      )}
      <nav data-tour="nav" aria-label={t('nav.main')} className="glass fixed inset-x-3 bottom-3 z-40 flex justify-around gap-1 rounded-2xl p-1.5 lg:hidden">
        {primary.map((v) => {
          const active = v.id === view;
          return (
            <button key={v.id} onClick={() => { setMore(false); onView(v.id); }} aria-current={active ? 'page' : undefined} className={`relative flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs ${active ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-400'}`}>
              <v.icon className="size-5" aria-hidden /><span className="max-w-full truncate">{t(v.labelKey)}</span>
            </button>
          );
        })}
        {rest.length > 0 && (
          <button onClick={() => setMore((m) => !m)} aria-expanded={more} aria-controls="more-menu" aria-haspopup="dialog" className={`relative flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs ${restActive || more ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-400'}`}>
            <Ellipsis className="size-5" aria-hidden /><span className="max-w-full truncate">{tr('Lainnya')}</span>
            {restBadge > 0 && <span className="absolute right-2 top-1 grid min-w-4 place-items-center rounded-full bg-amber-400/90 px-1 text-[10px] font-semibold text-slate-900">{restBadge}</span>}
          </button>
        )}
      </nav>
    </>
  );
}
