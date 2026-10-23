// Masa tenggang watchdog: setelah maintenance / receiver kembali menyala, semua klien baru mulai mengirim lagi, jadi
// umur diam dihitung dari saat ini. Ditulis oleh aksi admin (bukan jalur ingest) agar maintenance tetap tidak menyentuh Redis.
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';

export const GRACE_TTL_SECONDS = 3600;

/** Tidak pernah melempar: masa tenggang adalah efek samping, tidak boleh menggagalkan aksi admin. */
export async function markWatchdogGrace(redis: RedisLike, nowMs = Date.now()): Promise<void> {
  try {
    await redis.set(KEYS.watchdogPausedAt, String(nowMs), { ex: GRACE_TTL_SECONDS });
  } catch (err) {
    console.error('[watchdog] gagal mencatat masa tenggang:', err instanceof Error ? err.message : 'unknown');
  }
}
