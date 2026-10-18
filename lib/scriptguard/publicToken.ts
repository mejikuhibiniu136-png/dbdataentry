// Token kanal kontrol untuk skrip PUBLIK (/scripts/account_status.lua, tanpa API Key).
// Skrip publik tidak punya identitas lisensi, jadi tokennya hanya membuktikan "salinan ini diterbitkan server ini baru-baru ini"
// (tersegel AES-256-GCM, konteks terpisah dari watermark berlisensi). Penegakan penuh (API Key + HWID) tetap lewat loader.
import { randomUUID } from 'node:crypto';
import { envInt } from '@/lib/env';
import { CryptoError, openJson, sealJson } from '@/lib/security/crypto';

const CONTEXT = 'script-public-control:v1';

export interface PublicTokenPayload { v: 1; kind: 'public'; ts: number; jti: string }

/** Saklar SCRIPT_PUBLIC_CONTROL (default aktif): 0/false/off mematikan kanal kontrol untuk skrip publik. */
export const publicControlEnabled = (): boolean => !['0', 'false', 'off', 'no'].includes((process.env.SCRIPT_PUBLIC_CONTROL ?? '').trim().toLowerCase());

export function issuePublicToken(nowMs = Date.now()): { token: string; jti: string } {
  const payload: PublicTokenPayload = { v: 1, kind: 'public', ts: nowMs, jti: randomUUID() };
  return { token: sealJson(payload, CONTEXT), jti: payload.jti };
}

const isPayload = (p: unknown): p is PublicTokenPayload => {
  const o = p as Partial<PublicTokenPayload> | null;
  return !!o && o.v === 1 && o.kind === 'public' && typeof o.jti === 'string' && Number.isFinite(o.ts);
};

/** null = bukan token publik (atau palsu/diubah). Kunci enkripsi belum diset (ConfigError) tetap dilempar. */
export function openPublicToken(token: unknown): PublicTokenPayload | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  try {
    const p = openJson<unknown>(token, CONTEXT);
    return isPayload(p) ? p : null;
  } catch (err) {
    if (err instanceof CryptoError) return null;
    throw err;
  }
}

export const publicTokenMaxAgeMs = (): number => envInt('SCRIPT_WM_MAX_AGE_DAYS', 30, 1, 365) * 86_400_000;
