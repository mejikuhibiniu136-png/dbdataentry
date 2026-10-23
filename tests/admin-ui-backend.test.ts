// Backend untuk panel admin baru: filter audit, cabut perangkat HWID, jeda antrean, pengumuman, util tanggal, metrik live.
// Memakai Redis tiruan di memori supaya tes jalan tanpa server Redis.
import { describe, expect, it } from 'vitest';
import { deleteAnnouncement, markRead, postAnnouncement, readFeed } from '@/lib/announcements';
import { readAudit, recordAudit } from '@/lib/audit';
import { addDays, formatRange, inRange, monthGrid, pickDay, startOfDay, toQuery } from '@/lib/dateRange';
import { drainQueue } from '@/lib/ingest/drain';
import { isQueuePaused, setQueuePaused } from '@/lib/ingest/queue';
import { computeLiveMetrics } from '@/lib/liveMetrics';
import type { RedisLike } from '@/lib/redis';
import { bindHwid, isHwidRevoked, listBindings, resetHwidBindings, revokeHwidDevice } from '@/lib/scriptguard/binding';
import { recordDevice } from '@/lib/users';
import type { DeviceEntry, LogEntry } from '@/types';

function fakeRedis(): RedisLike {
  const kv = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Record<string, string>>();
  const f = {
    get: async (k: string) => kv.get(k) ?? null,
    set: async (k: string, v: string) => { kv.set(k, v); return 'OK'; },
    del: async (...ks: string[]) => { let n = 0; for (const k of ks) { n += Number(kv.delete(k) || lists.delete(k) || hashes.delete(k)); } return n; },
    lpush: async (k: string, ...v: string[]) => { const l = lists.get(k) ?? []; for (const x of v) l.unshift(x); lists.set(k, l); return l.length; },
    ltrim: async (k: string, a: number, b: number) => { lists.set(k, (lists.get(k) ?? []).slice(a, b + 1)); return 'OK'; },
    lrange: async (k: string, a: number, b: number) => (lists.get(k) ?? []).slice(a, b + 1),
    hset: async (k: string, v: Record<string, string>) => { hashes.set(k, { ...(hashes.get(k) ?? {}), ...v }); return Object.keys(v).length; },
    hget: async (k: string, field: string) => hashes.get(k)?.[field] ?? null,
    hgetall: async (k: string) => hashes.get(k) ?? null,
    hdel: async (k: string, ...fs: string[]) => { const h = hashes.get(k); let n = 0; if (h) for (const x of fs) { if (x in h) { delete h[x]; n += 1; } } return n; },
    hexists: async (k: string, field: string) => Number(field in (hashes.get(k) ?? {})),
    hlen: async (k: string) => Object.keys(hashes.get(k) ?? {}).length,
    eval: async (_s: string, keys: string[], args: string[]) => { // hanya BIND_SCRIPT
      const h = hashes.get(keys[0]) ?? {};
      if (args[0] in h) return [1, Object.keys(h).length];
      if (Object.keys(h).length >= Number(args[1])) return [0, Object.keys(h).length];
      hashes.set(keys[0], { ...h, [args[0]]: args[3] });
      return [2, Object.keys(h).length + 1];
    },
  };
  return f as unknown as RedisLike;
}

describe('audit: filter rentang', () => {
  it('hanya entri di dalam [from, to]; tanpa rentang = terbaru', async () => {
    const r = fakeRedis();
    const base = Date.UTC(2026, 9, 10, 12);
    for (const [i, a] of (['logs.clear', 'game.delete', 'hwid.reset'] as const).entries()) await recordAudit(r, { actor: 'a', role: 'superadmin', action: a }, base + i * 86_400_000);
    expect((await readAudit(r, 50)).length).toBe(3);
    const ranged = await readAudit(r, 50, { fromMs: base + 86_400_000 - 1000, toMs: base + 86_400_000 + 1000 });
    expect(ranged.map((e) => e.action)).toEqual(['game.delete']);
    expect(await readAudit(r, 50, { fromMs: base + 10 * 86_400_000 })).toEqual([]);
  });
});

describe('HWID: cabut satu perangkat', () => {
  it('binding hilang, masuk daftar cabut, perangkat lain utuh; reset semua membersihkan daftar cabut', async () => {
    const r = fakeRedis();
    const d1 = 'aaaaaaaa11112222333344445555666677778888';
    const d2 = 'bbbbbbbb11112222333344445555666677778888';
    await bindHwid(r, 'k1', d1, { max: 3, ip: '1.1.1.1' });
    await bindHwid(r, 'k1', d2, { max: 3, ip: '2.2.2.2' });
    expect((await listBindings(r, 'k1')).map((b) => b.id).sort()).toEqual(['aaaaaaaa', 'bbbbbbbb']);
    expect(await revokeHwidDevice(r, 'k1', 'aaaaaaaa')).toBe('ok');
    expect((await listBindings(r, 'k1')).map((b) => b.id)).toEqual(['bbbbbbbb']);
    expect(await isHwidRevoked(r, 'k1', d1)).toBe(true);
    expect(await isHwidRevoked(r, 'k1', d2)).toBe(false);
    expect(await revokeHwidDevice(r, 'k1', 'aaaaaaaa')).toBe('notfound');
    expect(await revokeHwidDevice(r, 'k1', 'zz')).toBe('notfound');
    await resetHwidBindings(r, 'k1');
    expect(await isHwidRevoked(r, 'k1', d1)).toBe(false);
  });
});

describe('antrean: jeda', () => {
  it('drain tidak memproses saat dijeda; lanjut mengembalikan normal', async () => {
    const r = fakeRedis();
    expect(await isQueuePaused(r)).toBe(false);
    await setQueuePaused(r, true);
    expect(await isQueuePaused(r)).toBe(true);
    expect(await drainQueue(r)).toMatchObject({ paused: true, processed: 0, locked: false });
    await setQueuePaused(r, false);
    expect(await isQueuePaused(r)).toBe(false);
  });
});

describe('pengumuman & lonceng', () => {
  const dev = (at: string): DeviceEntry => ({ sid: at, at, ip: '1.1.1.1', device: 'x', deviceType: 'desktop', os: 'x', browser: 'x', city: null, region: null, country: null, isp: null, userAgent: 'x' });

  it('audiens staf tidak terlihat viewer; baca mengurangi belum-dibaca; hapus menarik pengumuman', async () => {
    const r = fakeRedis();
    const a = await postAnnouncement(r, { by: 'root', title: 'Semua', body: 'x', audience: 'all', level: 'info' }, 1_000);
    await postAnnouncement(r, { by: 'root', title: 'Staf', body: '', audience: 'staff', level: 'warn' }, 2_000);
    expect((await readFeed(r, 'budi', 'viewer')).items.map((i) => i.title)).toEqual(['Semua']);
    const admin = await readFeed(r, 'sari', 'admin');
    expect(admin.items.map((i) => i.title)).toEqual(['Staf', 'Semua']);
    expect(admin.unread).toBe(2);
    await markRead(r, 'sari', 'admin', [a.id]);
    expect((await readFeed(r, 'sari', 'admin')).unread).toBe(1);
    await markRead(r, 'sari', 'admin');
    expect((await readFeed(r, 'sari', 'admin')).unread).toBe(0);
    expect(await deleteAnnouncement(r, a.id)).toBe(true);
    expect((await readFeed(r, 'sari', 'admin')).items.map((i) => i.title)).toEqual(['Staf']);
    expect(await deleteAnnouncement(r, a.id)).toBe(false);
  });

  it('deteksi riwayat masuk: hanya yang terbit setelah login sebelumnya dan belum dibaca jadi "baru sejak login"', async () => {
    const r = fakeRedis();
    const t0 = Date.parse('2026-10-10T00:00:00Z');
    await postAnnouncement(r, { by: 'root', title: 'Lama', body: '', audience: 'all', level: 'info' }, t0 + 1000);
    await postAnnouncement(r, { by: 'root', title: 'Baru', body: '', audience: 'all', level: 'info' }, t0 + 5 * 86_400_000);
    await recordDevice(r, 'budi', dev('2026-10-11T00:00:00Z')); // login sebelumnya
    await recordDevice(r, 'budi', dev('2026-10-16T00:00:00Z')); // login sesi ini
    const feed = await readFeed(r, 'budi', 'viewer');
    expect(feed.previousLoginAt).toBe('2026-10-11T00:00:00Z');
    expect(feed.currentLoginAt).toBe('2026-10-16T00:00:00Z');
    expect(feed.newSinceLogin.map((i) => i.title)).toEqual(['Baru']);
    expect(feed.unread).toBe(2);
  });

  it('login pertama (tanpa riwayat sebelumnya): semua yang belum dibaca dianggap baru', async () => {
    const r = fakeRedis();
    await postAnnouncement(r, { by: 'root', title: 'A', body: '', audience: 'all', level: 'critical' });
    await recordDevice(r, 'baru', dev('2026-10-16T00:00:00Z'));
    const feed = await readFeed(r, 'baru', 'viewer');
    expect(feed.previousLoginAt).toBeNull();
    expect(feed.newSinceLogin).toHaveLength(1);
  });

  it('teks dibersihkan dari karakter kontrol dan dipangkas', async () => {
    const r = fakeRedis();
    const a = await postAnnouncement(r, { by: 'root', title: `A\u0000B${'x'.repeat(200)}`, body: 'ok\u0007', audience: 'all', level: 'info' });
    expect(a.title).not.toContain('\u0000');
    expect(a.title.length).toBeLessThanOrEqual(100);
    expect(a.body).toBe('ok');
  });
});

describe('dateRange', () => {
  it('pickDay: awal, akhir, tukar bila terbalik, ulang pada klik ketiga', () => {
    const a = new Date(2026, 9, 10); const b = new Date(2026, 9, 15);
    const one = pickDay({ from: null, to: null }, b);
    expect(one.to).toBeNull();
    const two = pickDay(one, a);
    expect(two.from?.getDate()).toBe(10);
    expect(two.to?.getDate()).toBe(15);
    expect(pickDay(two, b)).toMatchObject({ to: null });
  });
  it('toQuery: satu hari penuh bila hanya awal; kosong bila tanpa rentang', () => {
    expect(toQuery({ from: null, to: null })).toEqual({});
    const q = toQuery({ from: new Date(2026, 9, 10, 15), to: null });
    const span = Date.parse(q.to as string) - Date.parse(q.from as string);
    expect(span).toBeGreaterThan(23 * 3_600_000);
    expect(span).toBeLessThan(24 * 3_600_000);
  });
  it('monthGrid: Senin pertama, kelipatan 7; inRange inklusif', () => {
    const cells = monthGrid(2026, 9); // Okt 2026 mulai Kamis => 3 sel kosong
    expect(cells.length % 7).toBe(0);
    expect(cells.findIndex((c) => c !== null)).toBe(3);
    const from = new Date(2026, 9, 10);
    expect(inRange(new Date(2026, 9, 12), from, addDays(from, 5))).toBe(true);
    expect(inRange(new Date(2026, 9, 16), from, addDays(from, 5))).toBe(false);
    expect(formatRange({ from: null, to: null })).toBe('Semua tanggal');
    expect(startOfDay(new Date(2026, 9, 10, 18)).getHours()).toBe(0);
  });
});

describe('liveMetrics', () => {
  const now = Date.parse('2026-10-19T10:00:00Z');
  const log = (ageSec: number, ms: number, payload: Record<string, unknown> = {}): LogEntry => ({
    id: String(Math.random()), game: 'g', gameName: 'G', eventType: 'x', payload, format: 'json', bytes: 1,
    processingTimeMs: ms, receivedAt: new Date(now - ageSec * 1000).toISOString(),
  });
  it('jendela 5 menit, status akun dikecualikan dari event game, p95, umur log terakhir', () => {
    const m = computeLiveMetrics([log(10, 5, { type: 'account_status' }), log(30, 10), log(60, 100), log(900, 999)], now);
    expect(m).toMatchObject({ events: 3, gameEvents: 2, p95Ms: 100, lastAgeSec: 10 });
    expect(computeLiveMetrics([], now)).toEqual({ events: 0, gameEvents: 0, p95Ms: 0, lastAgeSec: null });
  });
  it('waktu proses mustahil (log lama berisi waktu tunggu antrean, 67 jam) dibuang dari p95', () => {
    const m = computeLiveMetrics([log(10, 241_337_422), log(30, 10), log(60, 100)], now);
    expect(m).toMatchObject({ events: 3, p95Ms: 100 });
  });
});
