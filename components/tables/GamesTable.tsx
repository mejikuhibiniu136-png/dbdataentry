'use client';
import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Button } from '@/components/ui/Button';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { Pill } from '@/components/ui/Pill';
import type { GameTable } from '@/types';

const SOURCE = { builtin: { label: 'Bawaan', tone: 'violet' }, auto: { label: 'Otomatis', tone: 'accent' }, manual: { label: 'Manual', tone: 'neutral' } } as const;
const PAGE_SIZE = 10;

interface Props { games: GameTable[]; isAdmin: boolean; onOpen: (g: GameTable) => void; onRename: (g: GameTable) => void; onDelete: (g: GameTable) => void }

function Actions({ g, isAdmin, onOpen, onRename, onDelete }: Props & { g: GameTable }) {
  const { tr } = useI18n();
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" onClick={() => onOpen(g)}>{tr('Buka')}<ArrowUpRight className="size-3.5" aria-hidden /></Button>
      {isAdmin && !g.builtin && <Button size="sm" onClick={() => onRename(g)} aria-label={tr('Ganti nama {name}', { name: g.name })}><Pencil className="size-3.5" aria-hidden /></Button>}
      {isAdmin && !g.builtin && <Button size="sm" variant="danger" onClick={() => onDelete(g)} aria-label={tr('Hapus {name}', { name: g.name })}><Trash2 className="size-3.5" aria-hidden /></Button>}
    </div>
  );
}

// Desktop: tabel. Ponsel (< md): daftar kartu, sehingga tidak ada gulir horizontal. Paginasi 10 baris per halaman.
export function GamesTable(props: Props) {
  const { games } = props;
  const { tr, locale } = useI18n();
  const pg = usePagination(games, PAGE_SIZE);
  if (!games.length) return <div className="glass p-8 text-center text-sm text-slate-300">{tr('Belum ada tabel. Tabel dibuat otomatis saat webhook pertama dari sebuah game/sumber masuk.')}</div>;
  const created = (g: GameTable) => `${new Date(g.createdAt).toLocaleDateString(locale)}${g.createdBy ? ` · ${g.createdBy}` : ''}`;
  return (
    <div className="space-y-2">
      <div className="glass hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{tr('Daftar tabel game')}</caption>
          <thead className="border-b border-white/10 text-xs text-slate-300">
            <tr><th scope="col" className="px-4 py-3 font-medium">{tr('Tabel')}</th><th scope="col" className="px-4 py-3 font-medium">{tr('Asal')}</th><th scope="col" className="px-4 py-3 text-right font-medium">{tr('Log diterima')}</th><th scope="col" className="px-4 py-3 font-medium">{tr('Dibuat')}</th><th scope="col" className="px-4 py-3"><span className="sr-only">{tr('Aksi')}</span></th></tr>
          </thead>
          <tbody>
            {pg.slice.map((g) => (
              <tr key={g.slug} className="h-[4.25rem] border-b border-white/5 last:border-0 hover:bg-white/[0.04]">
                <td className="px-4 py-3"><div className="font-medium text-white">{g.name}</div><div className="font-mono text-[11px] text-slate-400">game:{g.slug}:logs</div></td>
                <td className="px-4 py-3"><Pill tone={SOURCE[g.source].tone}>{tr(SOURCE[g.source].label)}</Pill></td>
                <td className="px-4 py-3 text-right font-semibold text-white"><AnimatedNumber value={g.total} /></td>
                <td className="px-4 py-3 text-xs text-slate-300">{created(g)}</td>
                <td className="px-4 py-3"><Actions g={g} {...props} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={tr('Daftar tabel game')}>
        {pg.slice.map((g) => (
          <li key={g.slug} className="glass space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-medium text-white">{g.name}</div><div className="truncate font-mono text-[11px] text-slate-400">game:{g.slug}:logs</div></div>
              <Pill tone={SOURCE[g.source].tone}>{tr(SOURCE[g.source].label)}</Pill>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300"><span>{tr('Log diterima')}: <b className="text-white"><AnimatedNumber value={g.total} /></b></span><span>{created(g)}</span></div>
            <Actions g={g} {...props} />
          </li>
        ))}
      </ul>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} />
    </div>
  );
}
