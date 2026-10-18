'use client';
import { OctagonX, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LiveCanvas, type LivePoint } from '@/components/live/LiveCanvas';
import { Button } from '@/components/ui/Button';
import { Pill, type Tone } from '@/components/ui/Pill';
import { getAccountState, type AccountState } from '@/lib/accounts';
import { timeAgo } from '@/lib/logStats';
import type { ControlCommand, ControlState, LogEntry, TrackedAccount } from '@/types';

const STATE_TONE: Record<AccountState, Tone> = { ONLINE: 'ok', STALLED: 'warn', OFFLINE: 'neutral' };
const ORDER: Record<AccountState, number> = { ONLINE: 0, STALLED: 1, OFFLINE: 2 };

interface Props {
  loading: boolean;
  accounts: TrackedAccount[];
  logs: LogEntry[];
  controls: Record<string, ControlState>;
  now: number;
  /** Izin accounts:write (admin + superadmin): tombol kontrol aktif hanya untuk mereka. */
  canControl: boolean;
  onControl: (account: TrackedAccount, command: ControlCommand) => void;
}

function ControlBadge({ control, now }: { control?: ControlState; now: number }) {
  if (!control) return null;
  if (control.ackedAt) return <Pill tone="ok">{control.cmd} terkirim</Pill>;
  const left = Math.max(0, Math.round((Date.parse(control.expiresAt) - now) / 1000));
  return <Pill tone="warn" dot="live">{control.cmd} menunggu · {left}s</Pill>;
}

export function LiveView({ loading, accounts, logs, controls, now, canControl, onControl }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const points: LivePoint[] = useMemo(
    () => accounts.map((account) => ({ account, state: getAccountState(account, now) })).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.account.username.localeCompare(b.account.username)),
    [accounts, now]
  );
  // Pilihan yang hilang dari daftar (akun dihapus) dilepas; default ke akun online pertama.
  useEffect(() => {
    if (selected && !accounts.some((a) => a.username === selected)) setSelected(null);
  }, [accounts, selected]);

  const sel = points.find((p) => p.account.username === selected) ?? null;
  const control = sel ? controls[sel.account.username.toLowerCase()] : undefined;
  const feed = useMemo(
    () => logs.filter((l) => !selected || l.payload?.username === selected).slice(0, 30),
    [logs, selected]
  );
  const hpPct = sel?.account.health !== undefined && sel.account.maxHealth ? Math.min(1, Math.max(0, sel.account.health / sel.account.maxHealth)) : null;
  const canAct = canControl && sel !== null && sel.state !== 'OFFLINE';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <section className="glass space-y-3 p-3" aria-label="Peta langsung">
        <LiveCanvas points={points} selected={selected} onSelect={setSelected} className="h-[26rem] sm:h-[32rem]" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-400" aria-hidden />Online</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-400" aria-hidden />Stalled</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-slate-500" aria-hidden />Offline</span>
          <span className="ml-auto">Sumbu: X dan Z dunia game (studs). Cincin = health.</span>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="glass space-y-4 p-4" aria-live="polite">
          {!sel ? (
            <p className="text-sm text-slate-500">{loading ? 'Memuat…' : 'Pilih akun di peta atau daftar untuk melihat detail dan mengirim perintah.'}</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-white">{sel.account.displayName || sel.account.username}</h2>
                  <p className="truncate text-xs text-slate-500">@{sel.account.username} · {sel.account.gameName}</p>
                </div>
                <Pill tone={STATE_TONE[sel.state]} dot={sel.state === 'ONLINE' ? 'live' : 'static'}>{sel.state}</Pill>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                  <span>Health</span>
                  <span>{hpPct === null ? '-' : `${sel.account.health} / ${sel.account.maxHealth}`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpPct === null ? undefined : Math.round(hpPct * 100)}>
                  <div className={`h-full rounded-full transition-[width] duration-500 ${hpPct !== null && hpPct <= 0.3 ? 'bg-rose-400' : hpPct !== null && hpPct <= 0.6 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${(hpPct ?? 0) * 100}%` }} />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-slate-500">Posisi</dt><dd className="font-mono text-slate-200">{sel.account.pos ? `${sel.account.pos.x}, ${sel.account.pos.y}` : '-'}</dd></div>
                <div><dt className="text-slate-500">Sync terakhir</dt><dd className="text-slate-200">{timeAgo(Date.parse(sel.account.lastUpdate), now)}</dd></div>
              </dl>

              <div>
                <p className="mb-1.5 text-xs text-slate-500">Inventaris{sel.account.inventory ? ` (${sel.account.inventory.length})` : ''}</p>
                {sel.account.inventory?.length ? (
                  <ul className="flex flex-wrap gap-1.5">{sel.account.inventory.map((item, i) => <li key={`${item}-${i}`} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300">{item}</li>)}</ul>
                ) : <p className="text-xs text-slate-600">Kosong / belum dilaporkan</p>}
              </div>

              <div className="space-y-2 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">Kontrol jarak jauh</p><ControlBadge control={control} now={now} /></div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!canAct} onClick={() => onControl(sel.account, 'PAUSE')}><Pause className="size-3.5" aria-hidden />Pause</Button>
                  <Button size="sm" disabled={!canAct} onClick={() => onControl(sel.account, 'RESUME')}><Play className="size-3.5" aria-hidden />Resume</Button>
                  <Button size="sm" variant="danger" disabled={!canAct} onClick={() => onControl(sel.account, 'KILL')}><OctagonX className="size-3.5" aria-hidden />Kill</Button>
                </div>
                {!canControl && <p className="text-xs text-slate-600">Hanya Moderator / Super Admin yang boleh mengirim perintah.</p>}
              </div>
            </>
          )}
        </section>

        <section className="glass p-3" aria-label="Daftar akun">
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {points.length === 0 && <li className="p-2 text-xs text-slate-600">Belum ada akun.</li>}
            {points.map(({ account, state }) => (
              <li key={account.username}>
                <button onClick={() => setSelected(account.username === selected ? null : account.username)} aria-pressed={account.username === selected}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${account.username === selected ? 'bg-cyan-300/15 text-white' : 'text-slate-300 hover:bg-white/[0.05]'}`}>
                  <span className="truncate">{account.displayName || account.username}</span>
                  <span className="flex flex-none items-center gap-2 text-[11px] text-slate-500">{!account.pos && 'tanpa posisi'}<i className={`size-2 rounded-full ${state === 'ONLINE' ? 'bg-emerald-400' : state === 'STALLED' ? 'bg-amber-400' : 'bg-slate-500'}`} aria-hidden /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <section className="glass p-4 lg:col-span-2" aria-label="Log aktivitas">
        <h2 className="mb-2 text-sm font-medium text-slate-300">Aktivitas {sel ? `· ${sel.account.username}` : '· semua akun'}</h2>
        {feed.length === 0 ? <p className="text-xs text-slate-600">Belum ada aktivitas.</p> : (
          <ul className="max-h-60 space-y-1 overflow-y-auto font-mono text-xs">
            {feed.map((l) => (
              <li key={l.id} className="flex gap-3 text-slate-400">
                <time className="flex-none text-slate-600" dateTime={l.receivedAt}>{new Date(l.receivedAt).toLocaleTimeString()}</time>
                <span className="text-slate-300">{String(l.payload?.event ?? l.eventType)}</span>
                <span className="truncate text-slate-500">{String(l.payload?.username ?? l.gameName)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
