// Autentikasi skrip yang SEDANG BERJALAN (polling kontrol, ack). Kredensialnya bukan API Key (tidak ada di skrip),
// melainkan token watermark milik salinan itu + HWID perangkat saat ini. Inilah penegakan sisi-server: walau pengguna
// membuang pemeriksaan lokal di Lua, request-nya tetap membawa HWID perangkat nyata dan ditolak bila tidak terdaftar.
import { isApiKeyActive } from '@/lib/apikeys';
import { json } from '@/lib/http';
import { openPublicToken, publicControlEnabled, publicTokenMaxAgeMs } from '@/lib/scriptguard/publicToken';
import { isHwidBound, recordLeak } from '@/lib/scriptguard/binding';
import { hwidDigest, normalizeHwid, safeEqualHex } from '@/lib/scriptguard/hwid';
import { openWatermark, watermarkMaxAgeMs, type WatermarkPayload } from '@/lib/scriptguard/watermark';
import type { RedisLike } from '@/lib/redis';

export type DenyReason = 'missing' | 'invalid' | 'expired' | 'revoked' | 'hwid';

export type ScriptAuth =
  | { ok: true; payload: WatermarkPayload; hwHash: string }
  | { ok: false; status: number; reason: DenyReason };

export async function authenticateScript(request: Request, redis: RedisLike, nowMs = Date.now()): Promise<ScriptAuth> {
  const token = request.headers.get('x-wm');
  if (!token) return { ok: false, status: 401, reason: 'missing' };
  const payload = openWatermark(token);
  if (!payload) return { ok: false, status: 403, reason: 'invalid' };
  if (nowMs - payload.ts > watermarkMaxAgeMs()) return { ok: false, status: 403, reason: 'expired' };
  if (!(await isApiKeyActive(redis, payload.uid, nowMs))) return { ok: false, status: 403, reason: 'revoked' };

  const hwid = normalizeHwid(request.headers.get('x-hwid'));
  if (!hwid) return { ok: false, status: 403, reason: 'hwid' };
  const hwHash = hwidDigest(hwid);
  // Perangkat pembuat token, atau perangkat lain yang terdaftar untuk key yang sama (HWID_MAX_DEVICES > 1): sah.
  if (!safeEqualHex(hwHash, payload.hw) && !(await isHwidBound(redis, payload.uid, hwHash))) {
    await recordLeak(redis, { reason: 'hwid_mismatch', source: 'poll', uid: payload.uid, jti: payload.jti, ownerHw: payload.hw, observedHw: hwHash, headers: request.headers }, nowMs);
    return { ok: false, status: 403, reason: 'hwid' };
  }
  return { ok: true, payload, hwHash };
}

const MESSAGES: Record<DenyReason, string> = {
  missing: 'Token skrip wajib',
  invalid: 'Token skrip tidak valid',
  expired: 'Salinan skrip kedaluwarsa, unduh ulang',
  revoked: 'API Key sudah dicabut',
  hwid: 'Perangkat tidak terdaftar',
};

/** Penolakan yang dipahami Lua: `cmd: 'KILL'` membuat skrip menghentikan diri, apa pun status HTTP-nya. */
export const scriptDenied = (auth: Extract<ScriptAuth, { ok: false }>): Response =>
  json({ success: false, cmd: 'KILL', reason: auth.reason, message: MESSAGES[auth.reason] }, auth.status);

export type ControlAuth = { ok: true; rateId: string; mode: 'key' | 'public' } | Extract<ScriptAuth, { ok: false }>;

/**
 * Autentikasi kanal kontrol. Token publik (skrip /scripts/account_status.lua) dicoba dulu karena murah (tanpa Redis);
 * bila bukan token publik, jatuh ke autentikasi berlisensi (watermark + API Key + HWID).
 */
export async function authenticateControl(request: Request, redis: RedisLike, nowMs = Date.now()): Promise<ControlAuth> {
  const token = request.headers.get('x-wm');
  if (!token) return { ok: false, status: 401, reason: 'missing' };
  const pub = openPublicToken(token);
  if (pub) {
    if (!publicControlEnabled()) return { ok: false, status: 403, reason: 'revoked' };
    if (nowMs - pub.ts > publicTokenMaxAgeMs()) return { ok: false, status: 403, reason: 'expired' };
    return { ok: true, rateId: `pub:${pub.jti}`, mode: 'public' };
  }
  const auth = await authenticateScript(request, redis, nowMs);
  return auth.ok ? { ok: true, rateId: auth.payload.uid, mode: 'key' } : auth;
}
