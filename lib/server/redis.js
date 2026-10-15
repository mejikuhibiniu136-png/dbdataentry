import { Redis } from '@upstash/redis';

// Konfigurasi Redis dibaca di satu tempat. Token read-only sengaja tidak dipakai
// karena semua route perlu menulis. KV_URL (redis://) juga bukan URL REST.
export const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.STORAGE_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;

export const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.STORAGE_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

let client = null;

// Dibuat saat pertama dipakai (bukan saat import) agar `next build` tidak gagal
// ketika env belum tersedia.
export function getRedis() {
  if (!client) {
    if (!REDIS_URL || !REDIS_TOKEN) {
      throw new Error(
        'Konfigurasi Redis belum diset (KV_REST_API_URL / KV_REST_API_TOKEN atau UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)'
      );
    }
    client = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  }
  return client;
}
