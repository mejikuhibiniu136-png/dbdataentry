'use client';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Pill } from '@/components/ui/Pill';
import { timeAgo } from '@/lib/logStats';
import type { Category } from '@/lib/logInsights';

// Satu tabel otomatis = satu jenis event yang dikirim webhook. Kolom diambil dari pasangan "Kunci: nilai" yang sering muncul.
export function AutoTable({ cat, fresh, nowMs }: { cat: Category; fresh: boolean; nowMs: number }) {
  const { tr, n: fmt, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const rows = open ? cat.rows : cat.rows.slice(0, 5);
  const last = Date.parse(cat.lastAt);
  return (
    <section className="glass p-5" aria-label={tr('Tabel {name}', { name: cat.label })}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-white" title={cat.label}>{cat.label}</h3>
        <Pill tone="accent">{tr('{n} event', { n: fmt(cat.count) })}</Pill>
        {fresh && <Pill tone="ok" dot="live">{tr('Baru')}</Pill>}
        <span className="ml-auto text-xs text-slate-500">{Number.isFinite(last) ? timeAgo(last, nowMs, locale) : '-'}</span>
      </div>
      {cat.players.length > 0 && (
        <p className="mt-1 truncate text-xs text-slate-500">{tr('Pemain: {list}', { list: cat.players.map((p) => `${p.name} (${p.count})`).join(', ') })}</p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1.5 pr-3 font-medium">{tr('Waktu')}</th>
              <th className="py-1.5 pr-3 font-medium">{tr('Pemain')}</th>
              {cat.columns.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody className="text-slate-300">
            {rows.map((r) => {
              const t = Date.parse(r.at);
              return (
                <tr key={r.id} className="border-t border-white/[0.06]">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">{Number.isFinite(t) ? timeAgo(t, nowMs, locale) : '-'}</td>
                  <td className="max-w-[9rem] truncate py-1.5 pr-3" title={r.user}>{r.user || '-'}</td>
                  {cat.columns.map((c) => <td key={c} className="max-w-[12rem] truncate py-1.5 pr-3" title={r.cells[c]}>{r.cells[c] || '-'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cat.rows.length > 5 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-xs text-cyan-300 hover:underline">
          {open ? tr('Ringkas') : tr('Lihat {n} terbaru', { n: cat.rows.length })}
        </button>
      )}
    </section>
  );
}
