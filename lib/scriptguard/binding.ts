// Pengikatan HWID per API key (atomik di Redis) + pencatatan kebocoran.
import { randomUUID } from 'node:crypto';
import { getClientIp, parseStored } from '@/lib/http';
import { readGeo } from '@/lib/device';
import { KEYS } from '@/lib/keys';
import { emitAlert } from '@/lib/notify/emit';
import type { RedisLike } from '@/lib/redis';

export type BindStatus = 'denied' | 'known' | 'bound';
export interface BindResult { status: BindStatus; count: number }

// KEYS[1]=hash binding; ARGV: 1=digest HWID, 2=batas perangkat, 3=waktu sekarang, 4=JSON entri baru.
// Satu EVAL = tidak ada balapan dua perangkat yang sama-sama "pertama".
const BIND_SCRIPT = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if cur then
  local ok, o = pcall(cjson.decode, cur)
  if ok and type(o) == 'table' then
    o.last = ARGV[3]
    redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(o))
  end
  return {1, redis.call('HLEN', KEYS[1])}
end
local n = redis.call('HLEN', KEYS[1])
if n >= tonumber(ARGV[2]) then return {0, n} end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
return {2, n + 1}
`;

export async function bindHwid(redis: RedisLike, keyId: string, hwHash: string, opts: { max: number; ip: string; nowMs?: number }): Promise<BindResult> {
  const iso = new Date(opts.nowMs ?? Date.now()).toISOString();
  const res = (await redis.eval(BIND_SCRIPT, [KEYS.hwidBinds(keyId)], [hwHash, String(opts.max), iso, JSON.stringify({ first: iso, last: iso, ip: opts.ip })])) as unknown[];
  const code = Number(res?.[0]);
  return { status: code === 2 ? 'bound' : code === 1 ? 'known' : 'denied', count: Number(res?.[1]) || 0 };
}

export const isHwidBound = async (redis: RedisLike, keyId: string, hwHash: string): Promise<boolean> =>
  Number(await redis.hexists(KEYS.hwidBinds(keyId), hwHash)) === 1;

// Reset total (pengguna ganti perangkat): hapus semua binding DAN daftar cabut, jadi perangkat baru bisa mendaftar lagi.
export const resetHwidBindings = async (redis: RedisLike, keyId: string): Promise<number> => {
  const n = Number(await redis.del(KEYS.hwidBinds(keyId)));
  await redis.del(KEYS.hwidRevoked(keyId));
  return n;
};

/** Perangkat yang dicabut admin: ditolak di unduhan dan di kanal kontrol walau tokennya milik perangkat itu. */
export const isHwidRevoked = async (redis: RedisLike, keyId: string, hwHash: string): Promise<boolean> =>
  Number(await redis.hexists(KEYS.hwidRevoked(keyId), hwHash)) === 1;

/**
 * Cabut SATU perangkat lewat awalan digest (8 hex, yang ditampilkan di UI). Awalan harus cocok tepat satu binding.
 * Mengembalikan 'ok' | 'notfound' | 'ambiguous'.
 */
export async function revokeHwidDevice(redis: RedisLike, keyId: string, prefix: string, nowMs = Date.now()): Promise<'ok' | 'notfound' | 'ambiguous'> {
  if (!/^[0-9a-f]{8}$/i.test(prefix)) return 'notfound';
  const raw = (await redis.hgetall(KEYS.hwidBinds(keyId))) ?? {};
  const hits = Object.keys(raw).filter((h) => h.toLowerCase().startsWith(prefix.toLowerCase()));
  if (hits.length === 0) return 'notfound';
  if (hits.length > 1) return 'ambiguous';
  await redis.hset(KEYS.hwidRevoked(keyId), { [hits[0]]: new Date(nowMs).toISOString() });
  await redis.hdel(KEYS.hwidBinds(keyId), hits[0]);
  return 'ok';
}

export interface BindingView { /** Awalan digest 8 hex: pengenal perangkat untuk pencabutan. */ id: string; hw: string; first: string; last: string; ip: string }

export async function listBindings(redis: RedisLike, keyId: string): Promise<BindingView[]> {
  const raw = (await redis.hgetall(KEYS.hwidBinds(keyId))) ?? {};
  return Object.entries(raw).map(([hw, v]) => {
    const o = parseStored<{ first?: string; last?: string; ip?: string }>(v) ?? {};
    return { id: hw.slice(0, 8), hw: `${hw.slice(0, 8)}…`, first: o.first ?? '', last: o.last ?? '', ip: o.ip ?? '' };
  });
}

// ---------- Kebocoran ----------
export type LeakReason = 'hwid_mismatch' | 'device_limit' | 'token_expired' | 'key_revoked';
export type LeakSource = 'download' | 'report' | 'poll';

export interface LeakEvent {
  id: string;
  at: string;
  reason: LeakReason;
  source: LeakSource;
  /** Pemilik lisensi (id API key). */
  uid: string;
  /** jti salinan skrip, bila berasal dari token. */
  jti: string | null;
  /** Awal digest HWID pemilik / perangkat pengamat (cukup untuk korelasi, bukan untuk membalik HWID). */
  ownerHw: string | null;
  observedHw: string | null;
  ip: string;
  country: string | null;
  ua: string;
}

export const LEAK_MAX = 500;

export interface LeakInput { reason: LeakReason; source: LeakSource; uid: string; jti?: string | null; ownerHw?: string | null; observedHw?: string | null; headers: Headers }

/** Tidak pernah melempar: pencatatan kebocoran tidak boleh menggagalkan respons ke skrip. */
export async function recordLeak(redis: RedisLike, input: LeakInput, nowMs = Date.now()): Promise<void> {
  try {
    const ev: LeakEvent = {
      id: randomUUID(),
      at: new Date(nowMs).toISOString(),
      reason: input.reason,
      source: input.source,
      uid: input.uid.slice(0, 64),
      jti: input.jti ?? null,
      ownerHw: input.ownerHw ? input.ownerHw.slice(0, 8) : null,
      observedHw: input.observedHw ? input.observedHw.slice(0, 8) : null,
      ip: getClientIp(input.headers),
      country: readGeo(input.headers).country,
      ua: (input.headers.get('user-agent') ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 160),
    };
    await redis.lpush(KEYS.leakLog, JSON.stringify(ev));
    await redis.ltrim(KEYS.leakLog, 0, LEAK_MAX - 1);
    await redis.hincrby(KEYS.leakStats, input.reason, 1);
    await emitAlert(
      {
        kind: 'script.leak',
        severity: 'critical',
        title: 'Skrip dijalankan di perangkat tak terdaftar',
        message: `Salinan skrip milik key ${ev.uid} terdeteksi di perangkat lain (${input.reason}, via ${input.source}).`,
        fields: [
          { name: 'Key', value: ev.uid, inline: true },
          { name: 'Alasan', value: input.reason, inline: true },
          { name: 'IP', value: ev.ip, inline: true },
          { name: 'Negara', value: ev.country ?? '-', inline: true },
          { name: 'Perangkat terlihat', value: ev.observedHw ?? '-', inline: true },
        ],
        dedupeKey: `${ev.uid}|${ev.observedHw ?? ev.ip}`,
      },
      { redis }
    );
  } catch (err) {
    console.error('[scriptguard] gagal mencatat kebocoran:', err instanceof Error ? err.message : err);
  }
}

export async function readLeaks(redis: RedisLike, limit: number): Promise<LeakEvent[]> {
  const raw = await redis.lrange(KEYS.leakLog, 0, Math.max(1, limit) - 1);
  return (raw ?? []).map((r) => parseStored<LeakEvent>(r)).filter((e): e is LeakEvent => e !== null && typeof e.uid === 'string');
}
