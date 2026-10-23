// Watchdog heartbeat: akun diam tanpa OFFLINE -> alert; keluar sengaja / maintenance / receiver OFF -> tidak.
import type IORedis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYS } from '@/lib/keys';
import type { AlertEvent } from '@/lib/notify/types';
import type { RedisLike } from '@/lib/redis';
import { __resetRuntimeSettingsCache, writeSetting } from '@/lib/settings';
import { setReceiverEnabled } from '@/lib/ingest/store';
import { markWatchdogGrace } from '@/lib/watchdogGrace';
import { buildAlerts, findSilentAccounts, runWatchdog, silentThresholdSeconds } from '@/lib/watchdog';
import type { TrackedAccount } from '@/types';
import { connectTestRedis } from './helpers/redis';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const acc = (username: string, lastMin: number, status: 'ONLINE' | 'OFFLINE' = 'ONLINE'): TrackedAccount =>
  ({ username, displayName: username, userId: '1', placeId: '1', jobId: 'j', gameName: 'G', event: 'Heartbeat', state: status, status, avatarUrl: '', timestamp: minAgo(60), sessionStart: minAgo(60), lastUpdate: minAgo(lastMin), latencyMs: 0, rev: 1 }) as TrackedAccount;

describe('watchdog (murni)', () => {
  it('ambang: bawaan 5 mnt, 0/off mati, nilai rusak -> bawaan, batas atas 1440', () => {
    expect(silentThresholdSeconds({})).toBe(300);
    expect(silentThresholdSeconds({ WATCHDOG_SILENT_MINUTES: '10' })).toBe(600);
    expect(silentThresholdSeconds({ WATCHDOG_SILENT_MINUTES: '0' })).toBe(0);
    expect(silentThresholdSeconds({ WATCHDOG_SILENT_MINUTES: 'OFF' })).toBe(0);
    expect(silentThresholdSeconds({ WATCHDOG_SILENT_MINUTES: 'abc' })).toBe(300);
    expect(silentThresholdSeconds({ WATCHDOG_SILENT_MINUTES: '-3' })).toBe(300);
    expect(silentThresholdSeconds({ WATCHDOG_SILENT_MINUTES: '999999' })).toBe(1440 * 60);
  });

  it('diam >= ambang dan bukan OFFLINE = diam; OFFLINE sengaja, masih segar, dan >24 jam = bukan', () => {
    const list = [acc('quiet', 6), acc('fresh', 1), acc('left', 30, 'OFFLINE'), acc('ancient', 60 * 25), acc('edge', 5)];
    expect(findSilentAccounts(list, NOW, 300).map((a) => a.username).sort()).toEqual(['edge', 'quiet']);
    expect(findSilentAccounts(list, NOW, 0)).toEqual([]);
    expect(findSilentAccounts([{ ...acc('bad', 1), lastUpdate: 'bukan-tanggal' }], NOW, 300)).toEqual([]);
  });

  it('masa tenggang: setelah jeda (maintenance) umur dihitung dari akhir jeda', () => {
    expect(findSilentAccounts([acc('a', 20)], NOW, 300, NOW - 60_000)).toEqual([]);
    expect(findSilentAccounts([acc('a', 20)], NOW, 300, NOW - 6 * 60_000)).toHaveLength(1);
  });

  it('<=5 akun: satu alert per akun (warning); >5: satu alert massal (critical) dengan contoh dibatasi 10', () => {
    const few = buildAlerts([acc('a', 10), acc('b', 10)], NOW);
    expect(few).toHaveLength(2);
    expect(few[0]).toMatchObject({ kind: 'account.silent', severity: 'warning', dedupeSeconds: 0 });
    const many = buildAlerts(Array.from({ length: 12 }, (_, i) => acc(`u${i}`, 10 + i)), NOW);
    expect(many).toHaveLength(1);
    expect(many[0]).toMatchObject({ severity: 'critical', dedupeSeconds: 1800 });
    expect(many[0].fields?.find((f) => f.name === 'Contoh akun')?.value.split(', ')).toHaveLength(10);
  });
});

const conn = await connectTestRedis();
const d = conn ? describe : describe.skip;
let redis: RedisLike;
let raw: IORedis;
const seed = (a: TrackedAccount) => redis.hset(KEYS.trackerAccounts, { [a.username]: JSON.stringify(a) });

d('watchdog (Redis sungguhan)', () => {
  beforeAll(() => { redis = conn!.redis; raw = conn!.raw; });
  afterAll(async () => { await raw?.flushdb(); raw?.disconnect(); });
  beforeEach(async () => { await raw.flushdb(); __resetRuntimeSettingsCache(); });

  const run = async (extra: Parameters<typeof runWatchdog>[1] = {}) => {
    const emit = vi.fn(async (_e: AlertEvent) => undefined);
    const result = await runWatchdog(redis, { nowMs: NOW, env: {}, emit, ...extra });
    return { result, emit };
  };

  it('alert sekali per episode diam; episode baru (lastUpdate baru) diberi alert lagi', async () => {
    await seed(acc('quiet', 10));
    await seed(acc('fresh', 1));
    const first = await run({ lock: false });
    expect(first.result).toEqual({ status: 'ok', silent: 1, alerted: 1 });
    expect(first.emit.mock.calls[0][0].fields?.[0]).toMatchObject({ name: 'Akun', value: 'quiet' });
    expect((await run({ lock: false })).emit).not.toHaveBeenCalled();

    await seed(acc('quiet', 0)); // pulih
    await seed({ ...acc('quiet', 7) }); // diam lagi: lastUpdate berbeda = episode baru
    expect((await run({ lock: false })).result.alerted).toBe(1);
  });

  it('keluar sengaja (OFFLINE) tidak dialert', async () => {
    await seed(acc('left', 30, 'OFFLINE'));
    const { result, emit } = await run({ lock: false });
    expect(result).toEqual({ status: 'ok', silent: 0, alerted: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('kunci: pemindaian kedua dalam 55 dtk dilewati', async () => {
    await seed(acc('quiet', 10));
    expect((await run()).result.status).toBe('ok');
    expect((await run()).result.status).toBe('locked');
  });

  it('maintenance / receiver OFF: tidak alert dan tidak menulis apa pun; mematikan maintenance mencatat masa tenggang', async () => {
    await seed(acc('quiet', 10));
    await writeSetting(redis, 'MAINTENANCE_MODE', true);
    expect(await raw.exists(KEYS.watchdogPausedAt)).toBe(0);
    const paused = await run({ lock: false });
    expect(paused.result.status).toBe('paused');
    expect(paused.emit).not.toHaveBeenCalled();

    await writeSetting(redis, 'MAINTENANCE_MODE', false);
    expect(await raw.exists(KEYS.watchdogPausedAt)).toBe(1);
    await markWatchdogGrace(redis, NOW); // waktu tes tetap: akhir maintenance = NOW
    expect((await run({ lock: false, nowMs: NOW + 60_000 })).result.alerted).toBe(0); // masih masa tenggang
    expect((await run({ lock: false, nowMs: NOW + 6 * 60_000 })).result.alerted).toBe(1);

    await raw.flushdb();
    await seed(acc('quiet', 10));
    await setReceiverEnabled(redis, false);
    expect((await run({ lock: false, nowMs: NOW + 10_000_000 })).result.status).toBe('paused');
    await setReceiverEnabled(redis, true);
    expect(await raw.exists(KEYS.watchdogPausedAt)).toBe(1);
  });

  it('nonaktif lewat env: tidak menyentuh Redis', async () => {
    await seed(acc('quiet', 10));
    const { result, emit } = await run({ env: { WATCHDOG_SILENT_MINUTES: 'off' } });
    expect(result.status).toBe('disabled');
    expect(emit).not.toHaveBeenCalled();
    expect(await raw.exists(KEYS.watchdogLock)).toBe(0);
  });
});
