'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Activity, Boxes, Clock, Gauge, Radio, Users, Zap } from 'lucide-react';
import { ActivityChart } from '@/components/charts/Charts';
import { EndpointCards } from '@/components/dashboard/EndpointCards';
import { StatCard } from '@/components/dashboard/StatCard';
import { Duration } from '@/components/ui/Duration';
import { Skeleton } from '@/components/ui/Skeleton';
import { Pill, STATE_TONE } from '@/components/ui/Pill';
import { computeLiveMetrics } from '@/lib/liveMetrics';
import { getAccountState } from '@/lib/accounts';
import { buildActivity, computeLogStats, eventLabel, timeAgo } from '@/lib/logStats';
import type { GameTable, LogEntry, TrackedAccount } from '@/types';

interface Props { loading: boolean; logs: LogEntry[]; games: GameTable[]; accounts: TrackedAccount[]; now: number; gameLabel: string; onCopyResult: (ok: boolean, label: string) => void }

export function OverviewView({ loading, logs, games, accounts, now, gameLabel, onCopyResult }: Props) {
  const { tr, locale } = useI18n();
  const total = games.reduce((s, g) => s + g.total, 0);
  const states = accounts.map((a) => getAccountState(a, now));
  const online = states.filter((s) => s === 'ONLINE').length;
  const stats = computeLogStats(logs);
  const live = computeLiveMetrics(logs, now);
  const problems = accounts.map((a, i) => ({ a, s: states[i] })).filter((x) => x.s !== 'ONLINE').slice(0, 6);

  return (
    <div className="space-y-6">
      <EndpointCards onResult={onCopyResult} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" delay={i * 80} />) : (
          <>
            <StatCard index={0} label={tr('Total log diterima')} value={total} hint={tr('Seluruh tabel game')} icon={<Radio className="size-4" />} />
            <StatCard index={1} label={tr('Tabel game')} value={games.length} hint={tr('Dibuat otomatis atau manual')} icon={<Boxes className="size-4" />} tone="violet" />
            <StatCard index={2} label={tr('Akun online')} value={online} hint={tr('dari {n} akun dilacak', { n: accounts.length })} icon={<Users className="size-4" />} tone="emerald" />
            <StatCard index={3} label={tr('Rata-rata proses')} value={stats.avgProcessingMs} suffix="ms" hint={tr('maks {n} ms', { n: stats.maxProcessingMs })} icon={<Gauge className="size-4" />} tone="amber" />
          </>
        )}
      </div>

      <section aria-labelledby="live-title" className="space-y-3">
        <h3 id="live-title" className="flex items-center gap-2 text-sm font-semibold text-white"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>{tr('Waktu nyata · 5 menit terakhir')}<span className="text-xs font-normal text-slate-500">· {gameLabel}</span></h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {loading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" delay={i * 80} />) : (
            <>
              <StatCard index={0} label={tr('Event masuk')} value={live.events} hint={tr('{n} per menit', { n: (live.events / 5).toFixed(1) })} icon={<Zap className="size-4" />} />
              <StatCard index={1} label={tr('Event game')} value={live.gameEvents} hint={tr('Tanpa status akun')} icon={<Activity className="size-4" />} tone="violet" />
              <StatCard index={2} label={tr('Latensi proses p95')} value={live.p95Ms} suffix="ms" hint={tr('Dari event 5 menit')} icon={<Gauge className="size-4" />} tone="amber" />
              <StatCard index={3} label={tr('Terakhir masuk')} value={live.lastAgeSec ?? 0} display={live.lastAgeSec === null ? '—' : <Duration seconds={live.lastAgeSec} />} hint={live.lastAgeSec === null ? tr('Belum ada data') : tr('yang lalu')} icon={<Clock className="size-4" />} tone="emerald" />
            </>
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="glass p-5 xl:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Activity className="size-4 text-cyan-300" aria-hidden />{tr('Aktivitas · {name}', { name: gameLabel })}</h3>
          {loading ? <Skeleton className="h-48" /> : <ActivityChart data={buildActivity(logs, now)} />}
        </section>

        <section className="glass p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{tr('Perlu perhatian')}</h3>
          {loading ? <Skeleton className="h-40" /> : problems.length === 0 ? <p className="text-sm text-slate-500">{tr('Semua akun online.')}</p> : (
            <ul className="space-y-2.5">
              {problems.map(({ a, s }) => (
                <li key={a.username} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-200">{a.displayName || a.username}</span>
                  <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{timeAgo(new Date(a.lastUpdate).getTime(), now, locale)}</span><Pill tone={STATE_TONE[s]}>{s}</Pill></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">{tr('Event terbaru · {name}', { name: gameLabel })}</h3>
        {loading ? <Skeleton className="h-32" /> : logs.length === 0 ? <p className="text-sm text-slate-500">{tr('Belum ada log. Kirim data ke Universal Webhook Endpoint di atas.')}</p> : (
          <ul className="divide-y divide-white/5">
            {logs.slice(0, 6).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Pill tone="accent">{eventLabel(l)}</Pill><span className="truncate text-slate-400">{l.gameName}</span></span>
                <time className="flex-none text-xs text-slate-500" dateTime={l.receivedAt}>{timeAgo(new Date(l.receivedAt).getTime(), now, locale)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
