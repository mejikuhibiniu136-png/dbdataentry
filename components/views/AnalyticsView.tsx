'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { BarList } from '@/components/charts/Charts';
import { StatCard } from '@/components/dashboard/StatCard';
import { AutoTable } from '@/components/views/analytics/AutoTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { computeInsights, formatMetric } from '@/lib/logInsights';
import { Activity, Layers, Trophy } from 'lucide-react';
import type { LogEntry } from '@/types';

const FRESH_MS = 10_000;

// Analitik universal: tidak ada metrik khusus satu game. Tabel muncul otomatis per jenis event yang dikirim webhook.
export function AnalyticsView({ loading, logs, gameLabel }: { loading: boolean; logs: LogEntry[]; gameLabel: string }) {
  const { tr, n: fmt } = useI18n();
  const s = useMemo(() => computeInsights(logs), [logs]);

  // Tabel yang baru muncul setelah tampilan pertama diberi lencana "Baru" selama beberapa detik.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  useEffect(() => {
    const keys = s.categories.map((c) => c.key);
    if (loading) return;
    if (seen.current === null) { seen.current = new Set(keys); return; }
    const added = keys.filter((k) => !seen.current!.has(k));
    if (!added.length) return;
    const now = Date.now();
    added.forEach((k) => seen.current!.add(k));
    setFresh((f) => ({ ...f, ...Object.fromEntries(added.map((k) => [k, now])) }));
    const t = setTimeout(() => setFresh((f) => Object.fromEntries(Object.entries(f).filter(([, at]) => Date.now() - at < FRESH_MS))), FRESH_MS + 200);
    return () => clearTimeout(t);
  }, [s.categories, loading]);

  if (loading) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-56" delay={i * 80} />)}</div>;
  const nowMs = Date.now();
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">{tr('Dihitung dari {n} log yang dimuat · {name}', { n: fmt(logs.length), name: gameLabel })}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard index={0} label={tr('Event game')} value={s.gameEvents} hint={s.systemEvents ? tr('{n} log status akun dikecualikan', { n: fmt(s.systemEvents) }) : undefined} icon={<Activity className="size-4" />} />
        <StatCard index={1} label={tr('Tabel otomatis')} value={s.categories.length + s.hiddenCategories} hint={tr('Jenis event terdeteksi')} icon={<Layers className="size-4" />} tone="violet" />
        <StatCard index={2} label={tr('Pemain teratas')} value={s.players[0]?.count ?? 0} hint={s.players[0]?.name ?? '-'} icon={<Trophy className="size-4" />} tone="amber" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="glass p-5"><h3 className="mb-4 text-sm font-semibold text-white">{tr('Event terbanyak')}</h3><BarList items={s.events} /></section>
        <section className="glass p-5"><h3 className="mb-4 text-sm font-semibold text-white">{tr('Pengguna teraktif')}</h3><BarList items={s.players} /></section>
      </div>
      {s.metrics.length > 0 && (
        <section className="glass p-5">
          <h3 className="mb-1 text-sm font-semibold text-white">{tr('Metrik angka terdeteksi')}</h3>
          <p className="mb-3 text-xs text-slate-500">{tr('Dibaca otomatis dari pasangan "Kunci: angka" di payload webhook, apa pun game-nya.')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[18rem] text-left text-xs">
              <thead><tr className="text-slate-500"><th className="py-1.5 pr-3 font-medium">{tr('Metrik')}</th><th className="py-1.5 pr-3 font-medium">{tr('Maks')}</th><th className="py-1.5 pr-3 font-medium">{tr('Total')}</th><th className="py-1.5 pr-3 font-medium">{tr('Rata-rata')}</th><th className="py-1.5 font-medium">{tr('Data')}</th></tr></thead>
              <tbody className="text-slate-300">
                {s.metrics.map((m) => (
                  <tr key={m.name} className="border-t border-white/[0.06]">
                    <td className="max-w-[10rem] truncate py-1.5 pr-3" title={m.name}>{m.name}</td>
                    <td className="tabular py-1.5 pr-3">{formatMetric(m.max, fmt)}</td>
                    <td className="tabular py-1.5 pr-3">{formatMetric(m.sum, fmt)}</td>
                    <td className="tabular py-1.5 pr-3">{formatMetric(m.avg, fmt)}</td>
                    <td className="tabular py-1.5">{fmt(m.samples)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{tr('Tabel otomatis per jenis event')}</h3>
          <p className="text-xs text-slate-500">{tr('Tabel baru dibuat sendiri begitu webhook mengirim jenis event baru, real-time tanpa konfigurasi.')}</p>
        </div>
        {s.categories.length === 0
          ? <section className="glass p-5 text-sm text-slate-500">{tr('Belum ada event game. Tabel muncul otomatis saat webhook mengirim payload di luar status akun (heartbeat / online / offline).')}</section>
          : <div className="grid gap-4 lg:grid-cols-2">{s.categories.map((c) => <AutoTable key={c.key} cat={c} fresh={c.key in fresh} nowMs={nowMs} />)}</div>}
        {s.hiddenCategories > 0 && <p className="text-xs text-slate-500">{tr('+{n} jenis event lain dengan jumlah lebih sedikit tidak ditampilkan.', { n: s.hiddenCategories })}</p>}
      </div>
    </div>
  );
}
