// Watermark per unduhan. Setiap salinan skrip membawa token tersegel (AES-256-GCM + key-wrap + HMAC, konteks terikat)
// berisi: User ID (id API key), hash HWID, timestamp, dan jti unik. Dari file bocor mana pun, token-nya bisa dibuka
// admin (POST /api/admin/hwid) untuk tahu salinan itu diterbitkan ke siapa, kapan, dan untuk perangkat yang mana.
import { randomBytes, randomUUID } from 'node:crypto';
import { envInt } from '@/lib/env';
import { fingerprint, hwidDigest } from '@/lib/scriptguard/hwid';
import { CryptoError, openJson, sealJson } from '@/lib/security/crypto';

const CONTEXT = 'script-watermark:v1';

export interface WatermarkPayload {
  v: 1;
  /** User ID = id API key pemilik lisensi. */
  uid: string;
  /** hwidDigest perangkat saat unduhan. */
  hw: string;
  /** Waktu terbit (ms epoch). */
  ts: number;
  jti: string;
  salt: string;
}

export interface IssuedWatermark {
  token: string;
  salt: string;
  /** fingerprint(HWID, salt): yang ditanam di Lua untuk pemeriksaan lokal. */
  fp: string;
  jti: string;
  payload: WatermarkPayload;
}

export function issueWatermark(input: { uid: string; hwid: string }, nowMs = Date.now()): IssuedWatermark {
  const salt = randomBytes(6).toString('hex');
  const payload: WatermarkPayload = { v: 1, uid: input.uid, hw: hwidDigest(input.hwid), ts: nowMs, jti: randomUUID(), salt };
  return { token: sealJson(payload, CONTEXT), salt, fp: fingerprint(input.hwid, salt), jti: payload.jti, payload };
}

const isPayload = (p: unknown): p is WatermarkPayload => {
  const o = p as Partial<WatermarkPayload> | null;
  return !!o && o.v === 1 && typeof o.uid === 'string' && typeof o.hw === 'string' && typeof o.jti === 'string' && typeof o.salt === 'string' && Number.isFinite(o.ts);
};

/** null = token palsu / diubah / bukan dari server ini (tidak membedakan penyebabnya ke pemanggil). */
export function openWatermark(token: unknown): WatermarkPayload | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  try {
    const p = openJson<unknown>(token, CONTEXT);
    return isPayload(p) ? p : null;
  } catch (err) {
    if (err instanceof CryptoError) return null;
    throw err; // ConfigError (kunci belum diset) harus terlihat, bukan disamarkan jadi "token tidak valid"
  }
}

/** Umur maksimum token (hari). Lewat dari ini skrip diminta berhenti dan pengguna harus mengunduh ulang. */
export const watermarkMaxAgeMs = (): number => envInt('SCRIPT_WM_MAX_AGE_DAYS', 30, 1, 365) * 86_400_000;
