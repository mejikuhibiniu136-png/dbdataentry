'use client';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DateRangeCalendar } from '@/components/ui/DateRangeCalendar';
import { Explainer } from '@/components/ui/Explainer';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiJson } from '@/lib/client';
import { formatRange, toQuery, type DayRange } from '@/lib/dateRange';
import { formatWhen, type Notify } from '@/components/views/system/format';
import type { AuditAction, AuditEntry } from '@/types';

const LABEL: Record<AuditAction, string> = {
  'settings.update': 'Ubah pengaturan',
  'apikey.create': 'Buat API Key',
  'apikey.revoke': 'Cabut API Key',
  'receiver.toggle': 'Saklar receiver',
  'user.update': 'Ubah pengguna',
  'logs.clear': 'Hapus log',
  'game.delete': 'Hapus tabel game',
  'game.rename': 'Ganti nama tabel',
  'account.delete': 'Hapus akun tracker',
  'encryption.rotate': 'Enkripsi ulang secret',
  'retention.purge': 'Pembersihan retensi',
  'notify.update': 'Ubah saluran notifikasi',
  'notify.test': 'Uji notifikasi',
  'session.revoke': 'Cabut sesi',
  'queue.drain': 'Kuras antrean ingest',
  'queue.setting': 'Ubah mode antrean',
  'crypto.sweep': 'Sapuan rotasi KEK',
  'control.issue': 'Perintah kontrol skrip',
  'hwid.reset': 'Reset HWID',
  'hwid.revoke': 'Cabut perangkat HWID',
  'queue.pause': 'Jeda / lanjut antrean',
  'announce.post': 'Terbitkan pengumuman',
  'announce.delete': 'Tarik pengumuman',
};

// Jejak aksi sensitif dengan filter rentang tanggal. Teks berasal dari input pengguna, jadi hanya dirender sebagai teks.
export function AuditPanel({ toast }: { toast: Notify }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DayRange>({ from: null, to: null });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filtered = Boolean(range.from);
  // Rentang setengah jadi (baru klik awal) tetap dipakai sebagai satu hari penuh; hasilnya langsung terlihat.
  const rangeKey = `${range.from?.getTime() ?? ''}-${range.to?.getTime() ?? ''}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: filtered ? '200' : '50', ...toQuery(range) });
      setRows((await apiJson<{ data: AuditEntry[] }>(`/api/admin/audit?${q}`, 'GET')).data);
    } catch (e) { toast(e instanceof Error ? e.message : 'Gagal memuat audit', 'error'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range diwakili rangeKey agar tidak memuat ulang pada tiap render
  }, [toast, rangeKey, filtered]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="glass relative overflow-hidden p-4 sm:p-5" aria-busy={loading}>
      <AnimatePresence>
        {loading && <motion.div key="bar" className="absolute inset-x-0 top-0 h-0.5 origin-left bg-gradient-to-r from-cyan-400 to-violet-500" initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 0.85 }} exit={{ scaleX: 1, opacity: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }} />}
      </AnimatePresence>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Audit log</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={filtered ? 'primary' : 'ghost'} onClick={() => setCalendarOpen((v) => !v)} aria-expanded={calendarOpen}><CalendarDays className="size-3.5" aria-hidden />{formatRange(range)}</Button>
          {filtered && <Button size="sm" variant="subtle" onClick={() => setRange({ from: null, to: null })} aria-label="Hapus filter tanggal"><X className="size-3.5" /></Button>}
          <Button size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang</Button>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">Siapa mengubah apa dan kapan. Nilai rahasia tidak pernah dicatat. Disimpan maksimal 1.000 entri terbaru.</p>

      <AnimatePresence initial={false}>
        {calendarOpen && (
          <motion.div key="cal" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
              <DateRangeCalendar value={range} onChange={setRange} />
              <p className="mt-3 text-xs text-slate-500">{range.from && !range.to ? 'Pilih tanggal akhir, atau biarkan untuk satu hari penuh.' : 'Klik tanggal awal lalu tanggal akhir.'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!rows ? (
        <div className="space-y-2" aria-label="Memuat audit">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" delay={i * 70} />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">{filtered ? 'Tidak ada aktivitas pada rentang tanggal ini.' : 'Belum ada aktivitas tercatat.'}</p>
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {filtered && <p className="mb-2 text-xs text-slate-400">{rows.length} entri pada {formatRange(range)}</p>}
          <ul className="divide-y divide-white/5">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-x-4 gap-y-0.5 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
                <span className="text-xs text-slate-500">{formatWhen(r.at)}</span>
                <div className="min-w-0">
                  <span className="text-slate-100">{LABEL[r.action] ?? r.action}</span>
                  {r.target && <span className="break-all text-slate-300"> · {r.target}</span>}
                  <div className="break-words text-xs text-slate-500">{r.actor} ({r.role}){r.ip ? ` · ${r.ip}` : ''}{r.detail ? ` · ${r.detail}` : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {loading && rows && <div className="mt-2 flex items-center gap-2 text-xs text-slate-400" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden />Mengambil data…</div>}
      <Explainer className="mt-4" title="Cara membaca audit log" items={[
        'Setiap baris memuat waktu, aksi, target, lalu pelaku beserta role, IP, dan detail.',
        'Tanpa filter, panel menampilkan 50 aksi terbaru. Pilih rentang di kalender untuk menelusuri hingga 200 entri pada tanggal itu.',
        'Pakai untuk menelusuri siapa mengubah pengaturan, mencabut key, atau menghapus tabel.',
      ]} />
    </section>
  );
}
