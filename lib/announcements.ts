// Pengumuman Superadmin + notifikasi lonceng. Pengumuman disimpan di list `announce:list` (terbaru di depan, dipangkas ke
// ANNOUNCE_MAX); status baca per pengguna di hash `announce:read:<user>`. Teks berasal dari input, jadi dibersihkan & hanya dirender sebagai teks.
import { randomUUID } from 'node:crypto';
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import { readDevices, userKey } from '@/lib/users';
import type { Role } from '@/types';

export const ANNOUNCE_MAX = 100;
export type AnnounceAudience = 'all' | 'staff';
export type AnnounceLevel = 'info' | 'warn' | 'critical';

export interface Announcement { id: string; at: string; by: string; title: string; body: string; audience: AnnounceAudience; level: AnnounceLevel }
export interface NotificationItem extends Announcement { read: boolean }
export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
  /** Login sebelum sesi ini (dari riwayat perangkat); null = login pertama. */
  previousLoginAt: string | null;
  /** Waktu login sesi ini (entri riwayat terbaru); dipakai agar peringatan melayang hanya muncul sekali per login. */
  currentLoginAt: string | null;
  /** Belum dibaca DAN terbit setelah login sebelumnya: dasar peringatan melayang setelah masuk. */
  newSinceLogin: NotificationItem[];
}

const clean = (v: string, max: number) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const isStaff = (role: Role | string) => role === 'admin' || role === 'superadmin';

export async function postAnnouncement(redis: RedisLike, input: { by: string; title: string; body: string; audience: AnnounceAudience; level: AnnounceLevel }, nowMs = Date.now()): Promise<Announcement> {
  const a: Announcement = {
    id: randomUUID(), at: new Date(nowMs).toISOString(), by: clean(input.by, 64) || 'superadmin',
    title: clean(input.title, 100), body: clean(input.body, 600), audience: input.audience, level: input.level,
  };
  await redis.lpush(KEYS.announceList, JSON.stringify(a));
  await redis.ltrim(KEYS.announceList, 0, ANNOUNCE_MAX - 1);
  return a;
}

async function readAll(redis: RedisLike): Promise<Announcement[]> {
  const raw = await redis.lrange(KEYS.announceList, 0, ANNOUNCE_MAX - 1);
  return (raw ?? []).map((r) => {
    try { return (typeof r === 'string' ? JSON.parse(r) : r) as Announcement; } catch { return null; }
  }).filter((a): a is Announcement => !!a && typeof a.id === 'string' && typeof a.title === 'string');
}

export async function deleteAnnouncement(redis: RedisLike, id: string): Promise<boolean> {
  const all = await readAll(redis);
  if (!all.some((a) => a.id === id)) return false;
  // Tulis ulang daftar tanpa item itu (jarang terjadi, hanya Superadmin). lpush mendorong berurutan, jadi kirim dari yang terlama.
  const rest = all.filter((a) => a.id !== id).reverse().map((a) => JSON.stringify(a));
  await redis.del(KEYS.announceList);
  if (rest.length) await redis.lpush(KEYS.announceList, ...rest);
  return true;
}

export async function readFeed(redis: RedisLike, username: string, role: Role | string, limit = 30): Promise<NotificationFeed> {
  const key = userKey(username);
  const [all, readMap, devices] = await Promise.all([readAll(redis), redis.hgetall(KEYS.announceRead(key)), readDevices(redis, key, 2)]);
  const visible = all.filter((a) => a.audience === 'all' || isStaff(role));
  const items: NotificationItem[] = visible.slice(0, limit).map((a) => ({ ...a, read: !!readMap?.[a.id] }));
  const previousLoginAt = devices[1]?.at ?? null; // devices[0] = login sesi ini (dicatat saat masuk)
  const prevMs = previousLoginAt ? Date.parse(previousLoginAt) : NaN;
  const newSinceLogin = items.filter((a) => !a.read && (!Number.isFinite(prevMs) || Date.parse(a.at) > prevMs));
  return { items, unread: items.filter((a) => !a.read).length, previousLoginAt, currentLoginAt: devices[0]?.at ?? null, newSinceLogin };
}

/** ids kosong/undefined = tandai semua yang terlihat sebagai terbaca. */
export async function markRead(redis: RedisLike, username: string, role: Role | string, ids?: string[]): Promise<number> {
  const key = userKey(username);
  const all = (await readAll(redis)).filter((a) => a.audience === 'all' || isStaff(role));
  const target = (ids?.length ? all.filter((a) => ids.includes(a.id)) : all).map((a) => a.id);
  if (!target.length) return 0;
  const now = new Date().toISOString();
  await redis.hset(KEYS.announceRead(key), Object.fromEntries(target.map((id) => [id, now])));
  return target.length;
}
