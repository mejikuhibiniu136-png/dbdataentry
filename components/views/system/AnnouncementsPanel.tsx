'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Megaphone, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiJson } from '@/lib/client';
import { formatWhen, type Notify } from '@/components/views/system/format';
import type { Announcement, NotificationFeed } from '@/lib/announcements';

// Superadmin: terbitkan pengumuman ke lonceng semua pengguna (atau hanya staf) dan tarik kembali bila salah.
export function AnnouncementsPanel({ toast }: { toast: Notify }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'staff'>('all');
  const [level, setLevel] = useState<'info' | 'warn' | 'critical'>('info');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await apiJson<{ data: NotificationFeed }>('/api/notifications', 'GET')).data.items); } catch (e) { setItems([]); toast(e instanceof Error ? e.message : 'Gagal memuat pengumuman', 'error'); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!title.trim()) return;
    setSending(true);
    try { await apiJson('/api/admin/announcements', 'POST', { title, body, audience, level }); setTitle(''); setBody(''); toast('Pengumuman diterbitkan', 'success'); await load(); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal menerbitkan', 'error'); } finally { setSending(false); }
  };
  const remove = async (id: string) => {
    try { await apiJson(`/api/admin/announcements?id=${id}`, 'DELETE'); setItems((l) => l?.filter((a) => a.id !== id) ?? l); toast('Pengumuman ditarik', 'success'); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal menarik', 'error'); }
  };

  return (
    <section className="glass p-4 sm:p-5" aria-labelledby="ann-title">
      <h3 id="ann-title" className="mb-1 flex items-center gap-2 text-sm font-semibold text-white"><Megaphone className="size-4 text-violet-300" aria-hidden />Pengumuman</h3>
      <p className="mb-4 text-xs text-slate-500">Tampil di lonceng notifikasi dan sebagai peringatan melayang saat pengguna masuk.</p>
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs text-slate-400">Judul<input className="field" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mis. Pemeliharaan Jumat malam" /></label>
        <label className="grid gap-1 text-xs text-slate-400">Isi (opsional)<textarea className="field min-h-20 resize-y" maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-slate-400">Penerima<select className="field py-1.5" value={audience} onChange={(e) => setAudience(e.target.value as 'all' | 'staff')}><option value="all">Semua pengguna</option><option value="staff">Hanya staf</option></select></label>
          <label className="grid gap-1 text-xs text-slate-400">Tingkat<select className="field py-1.5" value={level} onChange={(e) => setLevel(e.target.value as 'info' | 'warn' | 'critical')}><option value="info">Info</option><option value="warn">Penting</option><option value="critical">Kritis</option></select></label>
          <Button variant="primary" disabled={!title.trim() || sending} onClick={() => void send()}>{sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}Terbitkan</Button>
        </div>
      </div>
      <div className="mt-5">
        {!items ? <Skeleton className="h-16" /> : items.length === 0 ? <p className="text-xs text-slate-500">Belum ada pengumuman.</p> : (
          <ul className="divide-y divide-white/5">
            <AnimatePresence initial={false}>
              {items.map((a) => (
                <motion.li key={a.id} layout exit={{ opacity: 0, x: 20 }} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-100"><span className="break-words">{a.title}</span><Pill tone={a.level === 'critical' ? 'bad' : a.level === 'warn' ? 'warn' : 'accent'}>{a.level}</Pill>{a.audience === 'staff' && <Pill tone="neutral">staf</Pill>}</div>
                    <div className="text-xs text-slate-500">{formatWhen(a.at)} · {a.by}</div>
                  </div>
                  <button type="button" onClick={() => void remove(a.id)} aria-label={`Tarik pengumuman ${a.title}`} className="grid size-9 flex-none cursor-pointer place-items-center rounded-lg text-rose-300 hover:bg-rose-500/15"><Trash2 className="size-4" aria-hidden /></button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
