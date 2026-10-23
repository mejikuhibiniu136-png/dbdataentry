// Watchdog heartbeat: mendeteksi akun yang berhenti mengirim TANPA event OFFLINE (skrip crash, executor ditutup,
// jaringan putus). Keluar yang disengaja (status OFFLINE tersimpan) tidak pernah dialert.
//
//   pemicu (ingest / cron) --> kunci 55 dtk --> maintenance/receiver OFF? jeda --> akun diam >= ambang
//     --> buang yang sudah dialert pada episode ini --> <=5: alert per akun, >5: satu alert massal
import { createHash } from 'node:crypto';
import { OFFLINE_AFTER_SECONDS } from '@/lib/accounts';
import { isReceiverEnabled, readAccounts } from '@/lib/ingest/store';
import { KEYS } from '@/lib/keys';
import { emitAlert } from '@/lib/notify/emit';
import type { AlertEvent } from '@/lib/notify/types';
import type { RedisLike } from '@/lib/redis';
import { readRuntimeSettings } from '@/lib/settings';
import type { TrackedAccount } from '@/types';

export const DEFAULT_SILENT_MINUTES = 5;
export const MAX_SILENT_MINUTES = 1440;
const LOOKBACK_SECONDS = 24 * 3600; // akun diam lebih lama dari ini dianggap ditinggalkan, bukan insiden baru
const MAX_INDIVIDUAL = 5; // lebih dari ini = kemungkinan gangguan massal -> satu alert ringkas
const MAX_LISTED = 10;
const LOCK_SECONDS = 55;
const NOTIFIED_TTL_SECONDS = 7 * 24 * 3600;

/** Ambang diam dalam detik; 0 = nonaktif. Nilai tak valid jatuh ke bawaan (tidak mematikan pengawasan diam-diam). */
export function silentThresholdSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.WATCHDOG_SILENT_MINUTES ?? '').trim().toLowerCase();
  if (['0', 'off', 'false'].includes(raw)) return 0;
  const n = Number.parseInt(raw, 10);
  const minutes = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_SILENT_MINUTES) : DEFAULT_SILENT_MINUTES;
  return minutes * 60;
}

/** Murni: akun yang status tersimpannya bukan OFFLINE tetapi heartbeat-nya sudah lewat ambang. `pausedAtMs` = akhir maintenance / receiver OFF terakhir (masa tenggang). */
export function findSilentAccounts(accounts: TrackedAccount[], nowMs: number, thresholdSeconds: number, pausedAtMs = 0): TrackedAccount[] {
  if (thresholdSeconds <= 0) return [];
  const limit = Math.max(thresholdSeconds, OFFLINE_AFTER_SECONDS);
  const grace = Math.min(Math.max(pausedAtMs, 0), nowMs);
  return accounts.filter((a) => {
    if (String(a.status ?? '').toUpperCase() === 'OFFLINE') return false;
    const last = Date.parse(a.lastUpdate);
    if (!Number.isFinite(last)) return false;
    return (nowMs - Math.max(last, grace)) / 1000 >= limit && (nowMs - last) / 1000 <= LOOKBACK_SECONDS;
  });
}

const ago = (nowMs: number, iso: string) => `${Math.max(1, Math.round((nowMs - Date.parse(iso)) / 60_000))} mnt`;

export function buildAlerts(silent: TrackedAccount[], nowMs: number): AlertEvent[] {
  if (silent.length > MAX_INDIVIDUAL) {
    const sorted = [...silent].sort((a, b) => Date.parse(a.lastUpdate) - Date.parse(b.lastUpdate));
    return [{
      kind: 'account.silent',
      severity: 'critical',
      title: 'Banyak akun berhenti mengirim serentak',
      message: `${silent.length} akun berhenti mengirim heartbeat tanpa event OFFLINE. Kemungkinan gangguan massal (server game, Roblox, atau jaringan).`,
      fields: [
        { name: 'Jumlah', value: String(silent.length), inline: true },
        { name: 'Diam terlama', value: ago(nowMs, sorted[0].lastUpdate), inline: true },
        { name: 'Contoh akun', value: sorted.slice(0, MAX_LISTED).map((a) => a.username).join(', '), inline: false },
      ],
      dedupeKey: `mass|${Math.floor(nowMs / 1_800_000)}`,
      dedupeSeconds: 1800,
    }];
  }
  return silent.map((a) => ({
    kind: 'account.silent' as const,
    severity: 'warning' as const,
    title: 'Akun berhenti mengirim',
    message: `Akun berhenti mengirim heartbeat tanpa event OFFLINE. Skrip mungkin crash, executor ditutup, atau jaringan putus.`,
    fields: [
      { name: 'Akun', value: a.username, inline: true },
      { name: 'Game', value: a.gameName, inline: true },
      { name: 'Diam', value: ago(nowMs, a.lastUpdate), inline: true },
      { name: 'Terakhir terlihat', value: a.lastUpdate, inline: false },
    ],
    dedupeKey: createHash('sha256').update(`${a.username.toLowerCase()}|${a.lastUpdate}`).digest('hex').slice(0, 24),
    dedupeSeconds: 0,
  }));
}

export interface WatchdogDeps {
  nowMs?: number;
  env?: Record<string, string | undefined>;
  emit?: (event: AlertEvent) => Promise<void>;
  /** false = lewati kunci pemindaian (tes). */
  lock?: boolean;
}

export interface WatchdogResult {
  status: 'disabled' | 'locked' | 'paused' | 'ok';
  silent: number;
  alerted: number;
}

export async function runWatchdog(redis: RedisLike, deps: WatchdogDeps = {}): Promise<WatchdogResult> {
  const nowMs = deps.nowMs ?? Date.now();
  const threshold = silentThresholdSeconds(deps.env);
  if (threshold === 0) return { status: 'disabled', silent: 0, alerted: 0 };

  if (deps.lock !== false && !(await redis.set(KEYS.watchdogLock, '1', { nx: true, ex: LOCK_SECONDS }))) return { status: 'locked', silent: 0, alerted: 0 };

  // Saat maintenance / receiver OFF semua klien wajar diam: jangan alert. Masa tenggang setelahnya: lib/watchdogGrace.ts.
  const settings = await readRuntimeSettings(redis, nowMs);
  if (settings.maintenanceMode || !(await isReceiverEnabled(redis, nowMs))) return { status: 'paused', silent: 0, alerted: 0 };

  const pausedAt = Number(await redis.get(KEYS.watchdogPausedAt)) || 0;
  const silent = findSilentAccounts(await readAccounts(redis), nowMs, threshold, pausedAt);
  if (silent.length === 0) return { status: 'ok', silent: 0, alerted: 0 };

  const notified = (await redis.hgetall(KEYS.watchdogNotified)) ?? {};
  const fresh = silent.filter((a) => notified[a.username] !== a.lastUpdate);
  if (fresh.length === 0) return { status: 'ok', silent: silent.length, alerted: 0 };

  // Tandai dulu, baru kirim: pemindaian lain tidak mengirim ulang episode yang sama.
  await redis.hset(KEYS.watchdogNotified, Object.fromEntries(fresh.map((a) => [a.username, a.lastUpdate])));
  await redis.expire(KEYS.watchdogNotified, NOTIFIED_TTL_SECONDS);

  const emit = deps.emit ?? ((event: AlertEvent) => emitAlert(event, { redis }));
  const alerts = buildAlerts(fresh, nowMs);
  for (const alert of alerts) await emit(alert);
  return { status: 'ok', silent: silent.length, alerted: alerts.length };
}

// Pemicu dari jalur ingest: paling banyak sekali per menit per instance (tanpa command Redis di request lain);
// kunci Redis menjaga satu pemindaian di seluruh instance. Tidak pernah melempar.
let lastTickMs = 0;
export async function tickWatchdog(redis: RedisLike, nowMs = Date.now()): Promise<void> {
  if (nowMs - lastTickMs < 60_000 || silentThresholdSeconds() === 0) return;
  lastTickMs = nowMs;
  try {
    await runWatchdog(redis, { nowMs });
  } catch (err) {
    console.error('[watchdog] gagal:', err instanceof Error ? err.message : 'unknown');
  }
}
export const __resetWatchdogTick = () => { lastTickMs = 0; };
