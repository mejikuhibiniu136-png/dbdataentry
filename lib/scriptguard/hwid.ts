// HWID perangkat: validasi, digest server-side, dan fingerprint ringan yang SAMA PERSIS dengan guard.lua.
//
//  - hwidDigest  : HMAC-SHA256(HWID) dengan kunci turunan ENCRYPTION_KEY. Inilah yang disimpan/dibandingkan di server;
//                  HWID mentah tidak pernah ditulis ke Redis atau log.
//  - fingerprint : hash 64-bit non-kriptografis (salt acak per unduhan) agar skrip bisa memeriksa dirinya sendiri
//                  TANPA membawa HWID polos di dalam file. Hanya pemeriksaan cepat/bukti-rusak; penegakan sebenarnya
//                  tetap di server (lib/scriptguard/auth.ts), karena kode di klien selalu bisa dipatch.
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { getEncryptionKeyHex } from '@/lib/env';

// ASCII cetak tanpa spasi, 8-128 karakter: cukup untuk gethwid() / RbxAnalyticsService:GetClientId().
const HWID_RE = /^[\x21-\x7e]{8,128}$/;

export function normalizeHwid(value: unknown): string | null {
  return typeof value === 'string' && HWID_RE.test(value) ? value : null;
}

const hwidKey = (env: Record<string, string | undefined> = process.env): Buffer =>
  Buffer.from(hkdfSync('sha256', Buffer.from(getEncryptionKeyHex(env), 'hex'), Buffer.from('dbdataentry/hwid', 'utf8'), Buffer.from('hmac-v1', 'utf8'), 32));

/** 32 karakter hex (128 bit). Stabil selama ENCRYPTION_KEY tidak berganti (rotasi KEK lama mengubahnya: reset binding). */
export function hwidDigest(hwid: string, env?: Record<string, string | undefined>): string {
  return createHmac('sha256', hwidKey(env)).update(hwid).digest('hex').slice(0, 32);
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

const MOD = 4_294_967_296;

// Dua jalur 32-bit: (a ^ c) * 65599 dan djb2. Perkalian < 2^53 sehingga eksak di double Lua maupun JS.
export function fingerprint(hwid: string, salt: string): string {
  let a = 2_166_136_261;
  let b = 5381;
  for (const c of Buffer.from(`${salt}|${hwid}`, 'utf8')) {
    a = (((a ^ c) >>> 0) * 65_599) % MOD;
    b = (b * 33 + c) % MOD;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
