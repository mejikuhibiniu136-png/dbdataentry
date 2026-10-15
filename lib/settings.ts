// Pengaturan dinamis tersimpan di Upstash Redis (hash config:settings), khusus Superadmin.
// Nilai sensitif (WEBHOOK_SECRET, API_KEY) dienkripsi AES-256-GCM (lib/crypto.ts) sebelum
// ditulis; nilai non-sensitif (MAINTENANCE_MODE, RATE_LIMIT_PER_MIN, LUA_OBFUSCATION_ENABLED)
// disimpan langsung sebagai string. ENCRYPTION_KEY dan kredensial Superadmin TIDAK pernah
// lewat sini: keduanya hanya dibaca dari .env Vercel (lib/env.ts).
import { decrypt, encrypt, tryDecrypt } from '@/lib/crypto';
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import type { SystemSettings } from '@/types';

export const SENSITIVE_SETTINGS = ['WEBHOOK_SECRET', 'API_KEY'] as const;
export const PLAIN_SETTINGS = ['MAINTENANCE_MODE', 'RATE_LIMIT_PER_MIN', 'LUA_OBFUSCATION_ENABLED'] as const;
export type SensitiveSettingKey = (typeof SENSITIVE_SETTINGS)[number];
export type PlainSettingKey = (typeof PLAIN_SETTINGS)[number];
export type SettingKey = SensitiveSettingKey | PlainSettingKey;

const isSensitive = (key: SettingKey): key is SensitiveSettingKey => (SENSITIVE_SETTINGS as readonly string[]).includes(key);

const DEFAULT_RATE_LIMIT = 600;

export async function readSettings(redis: RedisLike): Promise<SystemSettings> {
  const raw = (await redis.hgetall(KEYS.settings)) ?? {};
  const maintenance = String(raw.MAINTENANCE_MODE ?? '').trim().toLowerCase();
  const obfuscate = String(raw.LUA_OBFUSCATION_ENABLED ?? '').trim().toLowerCase();
  const rateLimit = Number.parseInt(String(raw.RATE_LIMIT_PER_MIN ?? ''), 10);
  return {
    maintenanceMode: maintenance === 'true' || maintenance === '1',
    rateLimitPerMin: Number.isFinite(rateLimit) && rateLimit > 0 ? Math.min(rateLimit, 100_000) : DEFAULT_RATE_LIMIT,
    luaObfuscationEnabled: obfuscate === 'true' || obfuscate === '1',
    webhookSecretSet: typeof raw.WEBHOOK_SECRET === 'string' && raw.WEBHOOK_SECRET.length > 0,
    apiKeySet: typeof raw.API_KEY === 'string' && raw.API_KEY.length > 0,
  };
}

// Cepat & murah: dipakai jalur ingest panas (tiap request webhook) tanpa menarik semua field.
export async function readLuaObfuscationEnabled(redis: RedisLike): Promise<boolean> {
  const v = String((await redis.hget(KEYS.settings, 'LUA_OBFUSCATION_ENABLED')) ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

export async function writeSetting(redis: RedisLike, key: SettingKey, value: string | boolean | number): Promise<void> {
  const stored = typeof value === 'boolean' ? String(value) : String(value);
  const toSave = isSensitive(key) ? encrypt(stored) : stored;
  await redis.hset(KEYS.settings, { [key]: toSave });
}

export async function clearSetting(redis: RedisLike, key: SettingKey): Promise<void> {
  await redis.hdel(KEYS.settings, key);
}

// Hanya dipakai server-side (mis. verifikasi HMAC webhook / tampilan Superadmin setelah klik "lihat").
// Tidak pernah melempar: key belum diisi atau ENCRYPTION_KEY rusak -> null, bukan error 500.
export async function readSecretSetting(redis: RedisLike, key: SensitiveSettingKey): Promise<string | null> {
  const raw = await redis.hget(KEYS.settings, key);
  return typeof raw === 'string' ? tryDecrypt(raw) : null;
}

// Dipakai saat generate API Key baru: nilai dienkripsi lalu disimpan, versi plain dikembalikan
// SEKALI SAJA ke klien (ditampilkan di dashboard) karena tidak disimpan ulang dalam bentuk plain.
export async function writeSecretSetting(redis: RedisLike, key: SensitiveSettingKey, plainValue: string): Promise<void> {
  await redis.hset(KEYS.settings, { [key]: encrypt(plainValue) });
}

export { decrypt };
