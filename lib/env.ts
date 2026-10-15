// Pembacaan environment variable terpusat. Tidak ada nilai bawaan untuk rahasia:
// jika variabel belum diset, fungsi melempar ConfigError yang menyebut nama variabelnya,
// supaya kegagalan konfigurasi mudah ditemukan di log server.

export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[], detail?: string) {
    super(detail ?? `Environment variable belum dikonfigurasi: ${missing.join(', ')}`);
    this.name = 'ConfigError';
    this.missing = missing;
  }
}

export const MIN_JWT_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');

export function getRedisConfig(env: Env = process.env): { url: string; token: string } {
  // KV_* / STORAGE_* diisi otomatis oleh integrasi Upstash di Vercel Marketplace.
  const url = clean(env.UPSTASH_REDIS_REST_URL) || clean(env.KV_REST_API_URL) || clean(env.STORAGE_REST_API_URL);
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) || clean(env.KV_REST_API_TOKEN) || clean(env.STORAGE_REST_API_TOKEN);
  const missing: string[] = [];
  if (!url) missing.push('UPSTASH_REDIS_REST_URL');
  if (!token) missing.push('UPSTASH_REDIS_REST_TOKEN');
  if (missing.length) throw new ConfigError(missing);
  return { url, token };
}

export function getJwtSecret(env: Env = process.env): string {
  const secret = clean(env.JWT_SECRET);
  if (!secret) throw new ConfigError(['JWT_SECRET']);
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new ConfigError(['JWT_SECRET'], `JWT_SECRET terlalu pendek (minimal ${MIN_JWT_SECRET_LENGTH} karakter)`);
  }
  return secret;
}

// Versi tidak melempar: dipakai proxy/halaman yang harus tetap hidup walau env belum lengkap.
export function tryGetJwtSecret(env: Env = process.env): string | null {
  try {
    return getJwtSecret(env);
  } catch {
    return null;
  }
}

export function getAdminConfig(env: Env = process.env): { username: string; passwordHash: string } {
  const username = clean(env.ADMIN_USERNAME);
  const passwordHash = clean(env.ADMIN_PASSWORD_HASH);
  const missing: string[] = [];
  if (!username) missing.push('ADMIN_USERNAME');
  if (!passwordHash) missing.push('ADMIN_PASSWORD_HASH');
  if (missing.length) throw new ConfigError(missing);
  return { username, passwordHash };
}

export interface EnvReport {
  ok: boolean;
  required: { name: string; set: boolean; note?: string }[];
}

// Laporan status (tanpa nilai) untuk panel Sistem admin.
export function getEnvReport(env: Env = process.env): EnvReport {
  const redisUrl = Boolean(clean(env.UPSTASH_REDIS_REST_URL) || clean(env.KV_REST_API_URL) || clean(env.STORAGE_REST_API_URL));
  const redisToken = Boolean(clean(env.UPSTASH_REDIS_REST_TOKEN) || clean(env.KV_REST_API_TOKEN) || clean(env.STORAGE_REST_API_TOKEN));
  const secret = clean(env.JWT_SECRET);
  const hash = clean(env.ADMIN_PASSWORD_HASH);
  const hashOk = /^\$(argon2id|2[aby])\$/.test(hash);
  const required = [
    { name: 'UPSTASH_REDIS_REST_URL', set: redisUrl },
    { name: 'UPSTASH_REDIS_REST_TOKEN', set: redisToken },
    { name: 'ADMIN_USERNAME', set: Boolean(clean(env.ADMIN_USERNAME)) },
    {
      name: 'ADMIN_PASSWORD_HASH',
      set: hashOk,
      note: hash && !hashOk ? 'Format bukan Argon2id/bcrypt (di .env, $ harus ditulis \\$)' : undefined,
    },
    {
      name: 'JWT_SECRET',
      set: secret.length >= MIN_JWT_SECRET_LENGTH,
      note: secret && secret.length < MIN_JWT_SECRET_LENGTH ? `Kurang dari ${MIN_JWT_SECRET_LENGTH} karakter` : undefined,
    },
  ];
  return { ok: required.every((r) => r.set), required };
}

export function envInt(name: string, fallback: number, min: number, max: number, env: Env = process.env): number {
  const n = Number.parseInt(clean(env[name]), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
