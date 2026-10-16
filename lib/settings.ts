// Pengaturan dinamis tersimpan di Upstash Redis (hash config:settings), khusus Superadmin.
// Nilai sensitif (WEBHOOK_SECRET, API_KEY) dienkripsi AES-256-GCM (lib/crypto.ts) sebelum
// ditulis; nilai non-sensitif (MAINTENANCE_MODE, RATE_LIMIT_PER_MIN, LUA_OBFUSCATION_ENABLED)
// disimpan langsung sebagai string. ENCRYPTION_KEY dan kredensial Superadmin TIDAK pernah
// lewat sini: keduanya hanya dibaca dari .env Vercel (lib/env.ts).
import { classifyCiphertext, decrypt, encrypt, tryDecrypt } from '@/lib/crypto';
import { getPreviousEncryptionKeyState } from '@/lib/env';
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import type { EncryptionStatus, SystemSettings } from '@/types';

export const SENSITIVE_SETTINGS = ['WEBHOOK_SECRET', 'API_KEY'] as const;
export const PLAIN_SETTINGS = ['MAINTENANCE_MODE', 'RATE_LIMIT_PER_MIN', 'LUA_OBFUSCATION_ENABLED', 'API_KEY_REQUIRED', 'LOG_RETENTION_DAYS'] as const;
export type SensitiveSettingKey = (typeof SENSITIVE_SETTINGS)[number];
export type PlainSettingKey = (typeof PLAIN_SETTINGS)[number];
export type SettingKey = SensitiveSettingKey | PlainSettingKey;

const isSensitive = (key: SettingKey): key is SensitiveSettingKey => (SENSITIVE_SETTINGS as readonly string[]).includes(key);

const DEFAULT_RATE_LIMIT = 600;
export const MAX_RETENTION_DAYS = 3650;

type PlainSettings = Omit<SystemSettings, 'webhookSecretSet'>;

const truthy = (v: unknown) => ['true', '1'].includes(String(v ?? '').trim().toLowerCase());

function parsePlain(raw: Record<string, unknown>): PlainSettings {
  const rateLimit = Number.parseInt(String(raw.RATE_LIMIT_PER_MIN ?? ''), 10);
  const retention = Number.parseInt(String(raw.LOG_RETENTION_DAYS ?? ''), 10);
  return {
    maintenanceMode: truthy(raw.MAINTENANCE_MODE),
    rateLimitPerMin: Number.isFinite(rateLimit) && rateLimit > 0 ? Math.min(rateLimit, 100_000) : DEFAULT_RATE_LIMIT,
    luaObfuscationEnabled: truthy(raw.LUA_OBFUSCATION_ENABLED),
    apiKeyRequired: truthy(raw.API_KEY_REQUIRED),
    logRetentionDays: Number.isFinite(retention) && retention > 0 ? Math.min(retention, MAX_RETENTION_DAYS) : 0,
  };
}

export async function readSettings(redis: RedisLike): Promise<SystemSettings> {
  const raw = (await redis.hgetall(KEYS.settings)) ?? {};
  return {
    ...parsePlain(raw),
    webhookSecretSet: typeof raw.WEBHOOK_SECRET === 'string' && raw.WEBHOOK_SECRET.length > 0,
  };
}

// Pengaturan yang dibaca di jalur ingest panas. Di-cache 5 dtk per instance supaya tiap webhook
// tidak menambah command Redis; gagal baca -> pakai cache terakhir, atau bawaan (terbuka, 600/mnt).
export interface RuntimeSettings {
  apiKeyRequired: boolean;
  rateLimitPerMin: number;
}
const RUNTIME_CACHE_MS = 5000;
let runtimeCache: { value: RuntimeSettings; at: number } | null = null;

export async function readRuntimeSettings(redis: RedisLike, nowMs = Date.now()): Promise<RuntimeSettings> {
  if (runtimeCache && nowMs - runtimeCache.at < RUNTIME_CACHE_MS) return runtimeCache.value;
  try {
    const { apiKeyRequired, rateLimitPerMin } = parsePlain((await redis.hgetall(KEYS.settings)) ?? {});
    runtimeCache = { value: { apiKeyRequired, rateLimitPerMin }, at: nowMs };
    return runtimeCache.value;
  } catch (err) {
    console.error('[settings] gagal membaca pengaturan runtime:', err);
    return runtimeCache?.value ?? { apiKeyRequired: false, rateLimitPerMin: DEFAULT_RATE_LIMIT };
  }
}

export const __resetRuntimeSettingsCache = () => {
  runtimeCache = null;
};

// Cepat & murah: dipakai jalur ingest panas (tiap request webhook) tanpa menarik semua field.
export async function readLuaObfuscationEnabled(redis: RedisLike): Promise<boolean> {
  const v = String((await redis.hget(KEYS.settings, 'LUA_OBFUSCATION_ENABLED')) ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

export async function writeSetting(redis: RedisLike, key: SettingKey, value: string | boolean | number): Promise<void> {
  const stored = typeof value === 'boolean' ? String(value) : String(value);
  const toSave = isSensitive(key) ? encrypt(stored) : stored;
  await redis.hset(KEYS.settings, { [key]: toSave });
  runtimeCache = null; // perubahan berlaku segera di instance ini
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

// ---------- Rotasi ENCRYPTION_KEY ----------

export async function inspectSecrets(redis: RedisLike): Promise<EncryptionStatus> {
  let stale = 0;
  let undecryptable = 0;
  for (const key of SENSITIVE_SETTINGS) {
    const raw = await redis.hget(KEYS.settings, key);
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const { key: which } = classifyCiphertext(raw);
    if (which === 'previous') stale += 1;
    else if (which === 'broken') undecryptable += 1;
  }
  return { previousKey: getPreviousEncryptionKeyState(), stale, undecryptable };
}

// Tulis hanya bila nilainya belum berubah sejak dibaca: tidak menimpa secret yang baru diganti
// Superadmin di sela-sela rotasi.
const CAS_HSET = `
if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
  return 1
end
return 0
`;

export interface RotationResult {
  rotated: number;
  alreadyCurrent: number;
  failed: number;
}

// Mengenkripsi ulang secret yang masih memakai kunci lama dengan ENCRYPTION_KEY saat ini.
// Idempoten: secret yang sudah memakai kunci saat ini tidak disentuh.
export async function reencryptSecrets(redis: RedisLike): Promise<RotationResult> {
  const result: RotationResult = { rotated: 0, alreadyCurrent: 0, failed: 0 };
  for (const key of SENSITIVE_SETTINGS) {
    const raw = await redis.hget(KEYS.settings, key);
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const { key: which, plain } = classifyCiphertext(raw);
    if (which === 'current') {
      result.alreadyCurrent += 1;
    } else if (which === 'previous' && plain !== null) {
      const applied = await redis.eval(CAS_HSET, [KEYS.settings], [key, raw, encrypt(plain)]);
      if (Number(applied) === 1) result.rotated += 1;
      else result.failed += 1;
    } else {
      result.failed += 1;
    }
  }
  return result;
}
