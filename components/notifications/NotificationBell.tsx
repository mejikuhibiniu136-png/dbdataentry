'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellRing, CheckCheck, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { apiJson } from '@/lib/client';
import { timeAgo } from '@/lib/logStats';
import type { NotificationFeed, NotificationItem } from '@/lib/announcements';

const LEVEL: Record<NotificationItem['level'], { dot: string; ring: string; label: string }> = {
  info: { dot: 'bg-cyan-400', ring: 'border-cyan-300/30', label: 'Info' },
  warn: { dot: 'bg-amber-400', ring: 'border-amber-300/40', label: 'Penting' },
  critical: { dot: 'bg-rose-500', ring: 'border-rose-400/50', label: 'Kritis' },
};
const POLL_MS = 60_000;
const ALERT_MS = 9000;


// Lonceng di bilah atas: lencana merah = jumlah belum dibaca, menu tarik turun = riwayat pesan.
// Setelah masuk, pengumuman baru sejak login sebelumnya muncul sebagai peringatan melayang (sekali per login).
export function NotificationBell({ username }: { username: string }) {
  const { tr, locale, dt } = useI18n();
  const ago = (iso: string): string => (Date.now() - Date.parse(iso) > 7 * 86_400_000 ? dt(iso, { day: 'numeric', month: 'short' }) : timeAgo(Date.parse(iso), Date.now(), locale));
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [alert, setAlert] = useState<NotificationItem[] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const welcomed = useRef(false);

  const load = useCallback(async () => {
    try {
      const f = (await apiJson<{ data: NotificationFeed }>('/api/notifications', 'GET')).data;
      setFeed(f);
      if (!welcomed.current) {
        welcomed.current = true;
        const mark = `notif-welcome:${username}:${f.currentLoginAt ?? 'none'}`;
        let shown = false;
        try { shown = sessionStorage.getItem(mark) === '1'; sessionStorage.setItem(mark, '1'); } catch { /* penyimpanan diblokir: tampilkan saja */ }
        if (!shown && f.newSinceLogin.length) setAlert(f.newSinceLogin.slice(0, 3));
      }
    } catch { /* polling: galat sesaat tidak perlu ditampilkan */ }
  }, [username]);

  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  useEffect(() => {
    if (!alert) return undefined;
    const t = setTimeout(() => setAlert(null), ALERT_MS);
    return () => clearTimeout(t);
  }, [alert]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Panel `fixed` yang dijepit ke dalam layar: di lebar sedang (tablet / mode desktop di HP) lonceng tidak
  // berada di tepi kanan, sehingga panel `absolute right-0` lebar 24rem terpotong di tepi kiri layar.
  const place = useCallback(() => {
    const b = btn.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(384, vw - 24);
    const left = Math.min(Math.max(12, r.right - width), vw - width - 12);
    const top = Math.min(r.bottom + 8, vh - 120);
    setPos({ left, top, width, maxHeight: Math.max(160, Math.min(vh * 0.7, vh - top - 12)) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);

  const markRead = async (ids?: string[]) => {
    // Optimistis: lencana turun seketika, lalu disinkronkan dari server.
    setFeed((f) => f && { ...f, items: f.items.map((i) => (!ids || ids.includes(i.id) ? { ...i, read: true } : i)), unread: ids ? Math.max(0, f.unread - ids.filter((id) => f.items.some((i) => i.id === id && !i.read)).length) : 0 });
    try { setFeed((await apiJson<{ data: NotificationFeed }>('/api/notifications', 'POST', ids ? { ids } : {})).data); } catch { void load(); }
  };

  const unread = feed?.unread ?? 0;
  return (
    <div ref={wrap} className="relative">
      <button ref={btn} type="button" onClick={() => { setOpen((v) => !v); setAlert(null); }} aria-haspopup="true" aria-expanded={open} aria-label={unread ? tr('Notifikasi, {n} belum dibaca', { n: unread }) : tr('Notifikasi')}
        className="relative grid size-9 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]">
        {unread ? <motion.span key={unread} className="grid origin-top place-items-center" animate={{ rotate: [0, -16, 14, -10, 6, 0] }} transition={{ duration: 0.8, delay: 0.2 }}><BellRing className="size-4" aria-hidden /></motion.span> : <Bell className="size-4" aria-hidden />}
        <AnimatePresence>
          {unread > 0 && (
            <motion.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-1.5 -top-1.5 grid min-w-[1.15rem] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-[1.15rem] text-white ring-2 ring-[#070a12]">
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && pos && (
          <motion.div style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }} initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="glass glass-solid fixed z-50 overflow-hidden" role="region" aria-label={tr('Riwayat notifikasi')}>
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">{tr('Notifikasi')}</h2>
              <button type="button" disabled={!unread} onClick={() => void markRead()} className="flex cursor-pointer items-center gap-1.5 text-xs text-cyan-300 hover:underline disabled:cursor-not-allowed disabled:text-slate-600 disabled:no-underline"><CheckCheck className="size-3.5" aria-hidden />{tr('Tandai semua dibaca')}</button>
            </div>
            <ul style={{ maxHeight: pos.maxHeight - 48 }} className="divide-y divide-white/5 overflow-y-auto">
              {!feed ? <li className="px-4 py-6 text-center text-sm text-slate-500">{tr('Memuat…')}</li> : feed.items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-slate-500">{tr('Belum ada notifikasi.')}</li> : feed.items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { if (!n.read) void markRead([n.id]); }} className={`flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] ${n.read ? '' : 'bg-cyan-300/[0.05]'}`}>
                    <span className={`mt-1.5 size-2 flex-none rounded-full ${n.read ? 'bg-slate-600' : LEVEL[n.level].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2"><span className={`truncate text-sm ${n.read ? 'text-slate-300' : 'font-medium text-white'}`}>{n.title}</span><time className="flex-none text-[11px] text-slate-500" dateTime={n.at}>{ago(n.at)}</time></span>
                      {n.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line break-words text-xs text-slate-400">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-slate-600">{tr(LEVEL[n.level].label)} · {n.by}{n.audience === 'staff' ? ` · ${tr('khusus staf')}` : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {alert && !open && (
          <motion.div role="alert" initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }}
            className={`glass fixed inset-x-3 top-3 z-[60] border p-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[22rem] ${LEVEL[alert[0].level].ring}`}>
            <div className="flex items-start gap-3">
              <BellRing className="mt-0.5 size-4 flex-none text-cyan-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{alert.length > 1 ? tr('{n} pengumuman baru', { n: alert.length }) : tr('Pengumuman baru')}</p>
                <p className="mt-0.5 truncate text-xs text-slate-300">{alert[0].title}</p>
                <button type="button" onClick={() => { setAlert(null); setOpen(true); }} className="mt-2 cursor-pointer text-xs text-cyan-300 hover:underline">{tr('Lihat semua')}</button>
              </div>
              <button type="button" onClick={() => setAlert(null)} aria-label={tr('Tutup peringatan')} className="grid size-7 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/[0.08]"><X className="size-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
