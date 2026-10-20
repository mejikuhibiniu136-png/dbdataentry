// Kill-switch jarak jauh. Perintah disimpan per akun sebagai string JSON dengan TTL singkat (jendela pengambilan oleh
// skrip). Skrip meng-ack setelah menjalankan: perintah dihapus atomik dan statusnya dicatat untuk dashboard.
//
// Semantik: KILL/PAUSE/RESUME dikirim SEKALI (at-least-once, dedupe di Lua lewat id). PAUSE bertahan sampai RESUME
// (TTL hanya membatasi berapa lama perintah menunggu skrip yang sedang offline). Perintah baru menimpa yang lama.
import { randomUUID } from 'node:crypto';
import { HttpError, parseStored } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import type { ControlCommand, ControlState } from '@/types';

export const COMMANDS: readonly ControlCommand[] = ['KILL', 'PAUSE', 'RESUME'];
export const TTL_SECONDS = { min: 10, max: 600, default: 120 } as const;
/** Perintah yang sudah di-ack tetap tampil di dashboard selama ini. */
export const ACK_VISIBLE_MS = 10 * 60_000;

export const clampTtl = (value: unknown): number => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, TTL_SECONDS.min), TTL_SECONDS.max) : TTL_SECONDS.default;
};

export const isCommand = (v: unknown): v is ControlCommand => typeof v === 'string' && (COMMANDS as readonly string[]).includes(v);

const asState = (raw: unknown): ControlState | null => {
  const s = parseStored<ControlState>(raw);
  return s && isCommand(s.cmd) && typeof s.id === 'string' ? s : null;
};

export async function issueCommand(
  redis: RedisLike,
  input: { account: string; cmd: ControlCommand; by: string; ttlSeconds?: number },
  nowMs = Date.now()
): Promise<ControlState> {
  if (!isCommand(input.cmd)) throw new HttpError(400, 'Perintah tidak dikenal');
  const ttl = clampTtl(input.ttlSeconds);
  const state: ControlState = {
    cmd: input.cmd,
    id: randomUUID(),
    issuedAt: new Date(nowMs).toISOString(),
    issuedBy: input.by.slice(0, 64),
    expiresAt: new Date(nowMs + ttl * 1000).toISOString(),
    ackedAt: null,
  };
  const json = JSON.stringify(state);
  await redis.set(KEYS.controlCmd(input.account), json, { ex: ttl });
  await redis.hset(KEYS.controlState, { [input.account.toLowerCase()]: json });
  await redis.incr(KEYS.streamSeq); // SSE hanya mengirim saat penanda berubah
  return state;
}

/** Perintah yang menunggu diambil skrip (null bila tidak ada / sudah hangus). */
export async function peekCommand(redis: RedisLike, account: string): Promise<ControlState | null> {
  return asState(await redis.get(KEYS.controlCmd(account)));
}

// Hapus hanya bila id masih sama: ack lambat dari perintah lama tidak boleh menghapus perintah yang lebih baru.
const ACK_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if not v then return 0 end
local ok, o = pcall(cjson.decode, v)
if ok and type(o) == 'table' and o.id == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end
return 0
`;

export async function ackCommand(redis: RedisLike, account: string, id: string, nowMs = Date.now()): Promise<boolean> {
  if (typeof id !== 'string' || id.length > 64) return false;
  const deleted = Number(await redis.eval(ACK_SCRIPT, [KEYS.controlCmd(account)], [id])) === 1;
  if (!deleted) return false;
  const field = account.toLowerCase();
  const current = asState(await redis.hget(KEYS.controlState, field));
  if (current && current.id === id) {
    await redis.hset(KEYS.controlState, { [field]: JSON.stringify({ ...current, ackedAt: new Date(nowMs).toISOString() }) });
  }
  await redis.incr(KEYS.streamSeq);
  return true;
}

/** Satu HGETALL untuk seluruh dashboard: menunggu (belum hangus) atau baru ter-ack. Kunci = username huruf kecil. */
export async function readControlStates(redis: RedisLike, nowMs = Date.now()): Promise<Record<string, ControlState>> {
  const raw = (await redis.hgetall(KEYS.controlState)) ?? {};
  const out: Record<string, ControlState> = {};
  for (const [account, v] of Object.entries(raw)) {
    const s = asState(v);
    if (!s) continue;
    const visible = s.ackedAt ? nowMs - Date.parse(s.ackedAt) < ACK_VISIBLE_MS : Date.parse(s.expiresAt) > nowMs;
    if (visible) out[account] = s;
  }
  return out;
}

// ---------- Ack per salinan skrip (T1) ----------
// Kredensial kanal kontrol (token publik) tidak terikat ke akun, jadi ack TIDAK boleh menghapus perintah untuk semua
// orang: ack hanya menandai salinan skrip itu (jti). Perintah tetap hidup sampai TTL-nya habis.

/** Perintah yang belum di-ack OLEH salinan ini. */
export async function peekCommandFor(redis: RedisLike, account: string, scriptId: string): Promise<ControlState | null> {
  const cmd = await peekCommand(redis, account);
  if (!cmd) return null;
  return Number(await redis.hexists(KEYS.controlAcked(cmd.id), scriptId)) === 1 ? null : cmd;
}

export async function ackCommandFor(redis: RedisLike, account: string, id: string, scriptId: string, nowMs = Date.now()): Promise<boolean> {
  if (typeof id !== 'string' || id.length > 64 || !scriptId) return false;
  const cmd = await peekCommand(redis, account);
  if (!cmd || cmd.id !== id) return false;
  const key = KEYS.controlAcked(id);
  await redis.hset(key, { [scriptId.slice(0, 64)]: String(nowMs) });
  await redis.expire(key, TTL_SECONDS.max + 60);
  const field = account.toLowerCase();
  const current = asState(await redis.hget(KEYS.controlState, field));
  // ackedAt = "ada salinan yang mengaku menjalankan", bukan bukti (token publik anonim). Bukti sebenarnya: event OFFLINE akun itu.
  if (current && current.id === id && !current.ackedAt) {
    await redis.hset(KEYS.controlState, { [field]: JSON.stringify({ ...current, ackedAt: new Date(nowMs).toISOString() }) });
  }
  await redis.incr(KEYS.streamSeq);
  return true;
}
