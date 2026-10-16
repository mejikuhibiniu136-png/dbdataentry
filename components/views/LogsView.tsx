'use client';
import { AnimatePresence } from 'motion/react';
import { Download, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { LogBoundary, LogCard } from '@/components/tables/LogList';
import { Button } from '@/components/ui/Button';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { downloadText } from '@/lib/client';
import { RANGE_OPTIONS, computeLogStats, filterLogs, logsToCsv } from '@/lib/logStats';
import type { LogEntry } from '@/types';

const PAGE = 60;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

interface Props {
  loading: boolean; logs: LogEntry[]; newIds: Set<string>; copiedId: string | null; showGame: boolean; gameLabel: string; gameSlug: string; isAdmin: boolean;
  onOpen: (l: LogEntry) => void; onCopy: (l: LogEntry) => void; onClear: () => void;
}

export function LogsView({ loading, logs, newIds, copiedId, showGame, gameLabel, gameSlug, isAdmin, onOpen, onCopy, onClear }: Props) {
  const [search, setSearch] = useState('');
  const [user, setUser] = useState('ALL');
  const [rangeId, setRangeId] = useState('ALL');
  const [hideHeartbeat, setHideHeartbeat] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(search);

  const users = useMemo(() => computeLogStats(logs).uniqueUsers, [logs]);
  const filtered = useMemo(() => filterLogs(logs, { search: deferred, user, hideHeartbeat, rangeId }), [logs, deferred, user, hideHeartbeat, rangeId]);

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input ref={searchRef} className="field pl-9" placeholder="Cari di payload…" aria-label="Cari log" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }} />
        </div>
        <select className="field w-auto" aria-label="Filter pengguna" value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="ALL">Semua username</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className="field w-auto" aria-label="Rentang waktu" value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
          {RANGE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="size-4 accent-cyan-400" checked={hideHeartbeat} onChange={(e) => setHideHeartbeat(e.target.checked)} />Sembunyikan heartbeat</label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
        <span>{filtered.length.toLocaleString('id-ID')} dari {logs.length.toLocaleString('id-ID')} log dimuat · {gameLabel}</span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!filtered.length} onClick={() => downloadText(`logs-${stamp()}.json`, JSON.stringify(filtered, null, 2))}><Download className="size-3.5" />JSON</Button>
          <Button size="sm" disabled={!filtered.length} onClick={() => downloadText(`logs-${stamp()}.csv`, logsToCsv(filtered), 'text/csv')}><Download className="size-3.5" />CSV</Button>
          <Button size="sm" title="Semua log yang tersimpan di server, bukan hanya yang dimuat di layar" onClick={() => window.location.assign(`/api/logs/export?game=${encodeURIComponent(gameSlug)}&format=csv`)}><Download className="size-3.5" />CSV penuh</Button>
          <Button size="sm" title="Semua log yang tersimpan di server, bukan hanya yang dimuat di layar" onClick={() => window.location.assign(`/api/logs/export?game=${encodeURIComponent(gameSlug)}&format=json`)}><Download className="size-3.5" />JSON penuh</Button>
          {isAdmin && <Button size="sm" variant="danger" onClick={onClear}><Trash2 className="size-3.5" />Clear Logs</Button>}
        </div>
      </div>

      {loading ? <SkeletonRows /> : filtered.length === 0 ? (
        <div className="glass p-10 text-center text-sm text-slate-500">{logs.length === 0 ? 'Belum ada log pada tabel ini.' : 'Tidak ada log yang cocok dengan filter.'}</div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.slice(0, visible).map((log) => (
              <LogBoundary key={log.id}><LogCard log={log} isNew={newIds.has(log.id)} copied={copiedId === log.id} showGame={showGame} onOpen={onOpen} onCopy={onCopy} /></LogBoundary>
            ))}
          </AnimatePresence>
          {filtered.length > visible && <div className="text-center"><Button onClick={() => setVisible((v) => v + PAGE)}>Tampilkan lebih banyak ({filtered.length - visible})</Button></div>}
        </div>
      )}
    </div>
  );
}
