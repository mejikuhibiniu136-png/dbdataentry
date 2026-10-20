'use client';
import { ShieldAlert } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Explainer } from '@/components/ui/Explainer';
import type { SecurityStats } from '@/types';

const TILES: { key: 'hmacFail' | 'authFail' | 'rateLimited'; label: string; hint: string }[] = [
  { key: 'hmacFail', label: 'Signature HMAC gagal', hint: 'Payload ditolak: tanda tangan salah atau tidak ada' },
  { key: 'authFail', label: 'Kredensial ditolak', hint: 'API Key / token tidak valid atau tidak dikirim' },
  { key: 'rateLimited', label: 'Kena rate limit', hint: 'Request melebihi batas per menit' },
];

// Kejadian penolakan di receiver, 24 jam terakhir. Angka 0 = tenang; angka naik = ada yang mencoba.
export function SecurityPanel({ stats }: { stats: SecurityStats }) {
  const { tr, n: fmt } = useI18n();
  return (
    <section className="glass p-5" aria-label={tr('Kesehatan keamanan receiver')}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white"><ShieldAlert className="size-4 text-slate-400" aria-hidden />{tr('Keamanan receiver')}</h3>
      <p className="mb-4 text-xs text-slate-500">{tr('{n} jam terakhir', { n: stats.windowHours })}</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        {TILES.map((t) => {
          const n = stats[t.key];
          return (
            <div key={t.key} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" title={tr(t.hint)}>
              <dt className="text-xs text-slate-400">{tr(t.label)}</dt>
              <dd className={`mt-1 text-2xl font-semibold tabular-nums ${n > 0 ? 'text-amber-300' : 'text-slate-200'}`}>{fmt(n)}</dd>
            </div>
          );
        })}
      </dl>
      <Explainer className="mt-4" title={tr('Cara membaca angka ini')} items={[
        tr('Angka menghitung request yang ditolak receiver dalam {n} jam terakhir. Angka 0 berarti tenang, angka yang naik berarti ada yang mencoba.', { n: stats.windowHours }),
        tr('Signature HMAC gagal: payload ditolak karena tanda tangan salah atau tidak ada. Kredensial ditolak: API Key atau token tidak valid atau tidak dikirim. Kena rate limit: request melebihi batas per menit.'),
      ]} />
    </section>
  );
}
