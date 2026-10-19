'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellRing, CheckCheck, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson } from '@/lib/client';
import type { NotificationFeed, NotificationItem } from '@/lib/announcements';

const LEVEL: Record<NotificationItem['level'], { dot: string; ring: string; label: string }> = {
  info: { dot: 'bg-cyan-400', ring: 'border-cyan-300/30', label: 'Info' },
  warn: { dot: 'bg-amber-400', ring: 'border-amber-300/40', label: 'Penting' },
  critical: { dot: 'bg-rose-500', ring: 'border-rose-400/50', label: 'Kritis' },
};
const POLL_MS = 60_000;
const ALERT_MS = 9000;

const ago = (iso: string): string => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

// Lonceng di bilah atas: lencana merah = jumlah belum dibaca, menu tarik turun = riwayat pesan.
// Setelah masuk, pengumuman baru sejak login sebelumnya muncul sebagai peringatan melayang (sekali per login).
export function NotificationBell({ username }: { username: string }) {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [alert, setAlert] = useState<NotificationItem[] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
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

  const markRead = async (ids?: string[]) => {
    // Optimistis: lencana turun seketika, lalu disinkronkan dari server.
    setFeed((f) => f && { ...f, items: f.items.map((i) => (!ids || ids.includes(i.id) ? { ...i, read: true } : i)), unread: ids ? Math.max(0, f.unread - ids.filter((id) => f.items.some((i) => i.id === id && !i.read)).length) : 0 });
    try { setFeed((await apiJson<{ data: NotificationFeed }>('/api/notifications', 'POST', ids ? { ids } : {})).data); } catch { void load(); }
  };

  const unread = feed?.unread ?? 0;
  return (
    <div ref={wrap} className="relative">
      <button type="button" onClick={() => { setOpen((v) => !v); setAlert(null); }} aria-haspopup="true" aria-expanded={open} aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        className="relative grid size-9 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]">
        {unread ? <BellRing className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
        <AnimatePresence>
          {unread > 0 && (
            <motion.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-1.5 -top-1.5 grid min-w-[1.15rem] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-[1.15rem] text-white ring-2 ring-[#070a12]">
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="glass fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[24rem]" role="region" aria-label="Riwayat notifikasi">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Notifikasi</h2>
              <button type="button" disabled={!unread} onClick={() => void markRead()} className="flex cursor-pointer items-center gap-1.5 text-xs text-cyan-300 hover:underline disabled:cursor-not-allowed disabled:text-slate-600 disabled:no-underline"><CheckCheck className="size-3.5" aria-hidden />Tandai semua dibaca</button>
            </div>
            <ul className="max-h-[calc(70vh-3rem)] divide-y divide-white/5 overflow-y-auto">
              {!feed ? <li className="px-4 py-6 text-center text-sm text-slate-500">Memuat…</li> : feed.items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-slate-500">Belum ada notifikasi.</li> : feed.items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { if (!n.read) void markRead([n.id]); }} className={`flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] ${n.read ? '' : 'bg-cyan-300/[0.05]'}`}>
                    <span className={`mt-1.5 size-2 flex-none rounded-full ${n.read ? 'bg-slate-600' : LEVEL[n.level].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2"><span className={`truncate text-sm ${n.read ? 'text-slate-300' : 'font-medium text-white'}`}>{n.title}</span><time className="flex-none text-[11px] text-slate-500" dateTime={n.at}>{ago(n.at)}</time></span>
                      {n.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line break-words text-xs text-slate-400">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-slate-600">{LEVEL[n.level].label} · {n.by}{n.audience === 'staff' ? ' · khusus staf' : ''}</span>
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
                <p className="text-sm font-semibold text-white">{alert.length > 1 ? `${alert.length} pengumuman baru` : 'Pengumuman baru'}</p>
                <p className="mt-0.5 truncate text-xs text-slate-300">{alert[0].title}</p>
                <button type="button" onClick={() => { setAlert(null); setOpen(true); }} className="mt-2 cursor-pointer text-xs text-cyan-300 hover:underline">Lihat semua</button>
              </div>
              <button type="button" onClick={() => setAlert(null)} aria-label="Tutup peringatan" className="grid size-7 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/[0.08]"><X className="size-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
