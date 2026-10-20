'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, MonitorSmartphone, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Explainer } from '@/components/ui/Explainer';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiJson } from '@/lib/client';
import { formatWhen, type Notify } from '@/components/views/system/format';
import type { ApiKeyView } from '@/types';

interface Device { id: string; hw: string; first: string; last: string; ip: string }

// Identitas perangkat (HWID) per API Key: daftar perangkat terdaftar + pencabutan satu per satu lewat /api/admin/hwid.
// Perangkat yang dicabut ditolak di unduhan skrip dan kanal kontrol; "Reset semua" mengizinkan perangkat baru mendaftar lagi.
export function HwidPanel({ toast }: { toast: Notify }) {
  const { tr, locale } = useI18n();
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [keyId, setKeyId] = useState('');
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<Device | 'all' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiJson<{ data: ApiKeyView[] }>('/api/admin/apikey', 'GET')
      .then((r) => { if (!live) return; const active = r.data.filter((k) => !k.expired); setKeys(active); setKeyId((c) => c || active[0]?.id || ''); })
      .catch((e) => { if (live) { setKeys([]); toast(e instanceof Error ? e.message : tr('Gagal memuat API Key'), 'error'); } });
    return () => { live = false; };
  }, [toast, tr]);

  const load = useCallback(async () => {
    if (!keyId) { setDevices([]); return; }
    setLoading(true);
    try {
      const r = await apiJson<{ data: { bindings?: Device[] } }>(`/api/admin/hwid?keyId=${encodeURIComponent(keyId)}&limit=1`, 'GET');
      setDevices(r.data.bindings ?? []);
    } catch (e) { setDevices([]); toast(e instanceof Error ? e.message : tr('Gagal memuat perangkat'), 'error'); } finally { setLoading(false); }
  }, [keyId, toast, tr]);
  useEffect(() => { setDevices(null); void load(); }, [load]);

  const revoke = async () => {
    const t = target;
    setTarget(null);
    if (!t) return;
    const id = t === 'all' ? '*' : t.id;
    setBusyId(id);
    try {
      await apiJson(`/api/admin/hwid?keyId=${encodeURIComponent(keyId)}${t === 'all' ? '' : `&device=${t.id}`}`, 'DELETE');
      // Hapus baris dulu supaya transisi keluar terlihat, baru sinkron dari server.
      setDevices((d) => (d ? (t === 'all' ? [] : d.filter((x) => x.id !== t.id)) : d));
      toast(t === 'all' ? tr('Semua perangkat direset') : tr('Akses perangkat dicabut'), 'success');
    } catch (e) { toast(e instanceof Error ? e.message : tr('Gagal mencabut perangkat'), 'error'); void load(); } finally { setBusyId(null); }
  };

  const label = keys?.find((k) => k.id === keyId)?.label;
  return (
    <section className="glass p-4 sm:p-5" aria-labelledby="hwid-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="hwid-title" className="flex items-center gap-2 text-sm font-semibold text-white"><MonitorSmartphone className="size-4 text-cyan-300" aria-hidden />{tr('Perangkat terdaftar (HWID)')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tr('Perangkat yang terikat ke API Key. Cabut perangkat yang tidak dikenal atau bocor.')}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select className="field min-w-0 flex-1 py-1.5 text-xs sm:w-56 sm:flex-none" aria-label={tr('Pilih API Key')} value={keyId} onChange={(e) => setKeyId(e.target.value)} disabled={!keys?.length}>
            {!keys?.length && <option value="">{tr('Belum ada API Key')}</option>}
            {keys?.map((k) => <option key={k.id} value={k.id}>{k.label} · {k.hint}</option>)}
          </select>
          <Button size="sm" variant="danger" disabled={!devices?.length || busyId !== null} onClick={() => setTarget('all')}>{tr('Reset semua')}</Button>
        </div>
      </div>

      {!keys || devices === null ? <Skeleton className="h-24" /> : devices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">{keyId ? tr('Belum ada perangkat terdaftar untuk key ini.') : tr('Buat API Key dulu untuk melihat perangkat.')}</p>
      ) : (
        <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead><tr className="text-slate-500"><th className="py-2 pr-3 font-medium">{tr('Perangkat')}</th><th className="py-2 pr-3 font-medium">IP</th><th className="py-2 pr-3 font-medium">{tr('Pertama')}</th><th className="py-2 pr-3 font-medium">{tr('Terakhir')}</th><th className="w-12 py-2 text-right font-medium"><span className="sr-only">{tr('Aksi')}</span></th></tr></thead>
            <tbody className="text-slate-300">
              <AnimatePresence initial={false}>
                {devices.map((d) => (
                  <motion.tr key={d.id} exit={{ opacity: 0, backgroundColor: 'rgba(244,63,94,0.18)' }} transition={{ duration: 0.15 }} className="border-t border-white/[0.06]">
                    <td className="py-2.5 pr-3 font-mono text-slate-100">{d.hw}</td>
                    <td className="py-2.5 pr-3">{d.ip || '—'}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-slate-500">{formatWhen(d.first, locale)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-slate-500">{formatWhen(d.last, locale)}</td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => setTarget(d)} disabled={busyId !== null} aria-label={tr('Cabut perangkat {hw}', { hw: d.hw })} className="inline-grid size-9 cursor-pointer place-items-center rounded-lg text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40">
                        {busyId === d.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <Modal open={target !== null} onClose={() => setTarget(null)} title={target === 'all' ? tr('Reset semua perangkat?') : tr('Cabut akses perangkat?')}>
        <p className="mb-5 text-sm leading-relaxed text-slate-300">
          {target === 'all'
            ? tr('Semua perangkat untuk key "{label}" dihapus dan daftar cabut dikosongkan. Pengguna bisa mendaftarkan perangkat baru.', { label: label ?? '' })
            : tr('Perangkat {hw} tidak bisa lagi mengunduh skrip atau dikontrol untuk key "{label}". Skrip yang sedang berjalan di perangkat itu dihentikan pada polling berikutnya.', { hw: target ? target.hw : '', label: label ?? '' })}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setTarget(null)} autoFocus>{tr('Batal')}</Button>
          <Button variant="danger" onClick={() => void revoke()}><Trash2 className="size-4" aria-hidden />{target === 'all' ? tr('Ya, reset') : tr('Ya, cabut')}</Button>
        </div>
      </Modal>
      <Explainer className="mt-4" title={tr('Cara kerja pencabutan')} items={[
        tr('Setiap API Key hanya boleh dipakai di jumlah perangkat tertentu (env HWID_MAX_DEVICES). Perangkat tercatat saat pertama kali mengunduh skrip.'),
        tr('Mencabut satu perangkat menolaknya di unduhan dan di kanal kontrol, tanpa mengganggu perangkat lain.'),
        tr('Reset semua dipakai saat pengguna berganti perangkat: semua binding dan daftar cabut dihapus.'),
      ]} />
    </section>
  );
}
