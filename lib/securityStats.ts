// Penghitung kejadian keamanan receiver untuk panel Sistem (24 jam terakhir).
// Satu hash per hari UTC, field "HH:jenis"; key kedaluwarsa sendiri setelah 3 hari.
// Mencatat tidak pernah melempar: statistik tidak boleh mengganggu jalur ingest.
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import type { SecurityStats } from '@/types';

export type SecurityEvent = 'hmac_fail' | 'auth_fail' | 'rate_limited';

const HOUR_MS = 3_600_000;
const WINDOW_HOURS = 24;
const KEEP_SECONDS = 3 * 86_400;

export async function recordSecurityEvent(redis: RedisLike, type: SecurityEvent, nowMs = Date.now()): Promise<void> {
  try {
    const iso = new Date(nowMs).toISOString();
    const key = KEYS.securityStats(iso.slice(0, 10));
    const count = await redis.hincrby(key, `${iso.slice(11, 13)}:${type}`, 1);
    if (Number(count) === 1) await redis.expire(key, KEEP_SECONDS);
  } catch (err) {
    console.error('[security-stats] gagal mencatat:', err);
  }
}

export async function readSecurityStats(redis: RedisLike, nowMs = Date.now()): Promise<SecurityStats> {
  const windowStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS - (WINDOW_HOURS - 1) * HOUR_MS;
  const days = [new Date(nowMs), new Date(nowMs - 86_400_000)].map((d) => d.toISOString().slice(0, 10));
  const hashes = await Promise.all(days.map((day) => redis.hgetall(KEYS.securityStats(day))));
  const out: SecurityStats = { windowHours: WINDOW_HOURS, hmacFail: 0, authFail: 0, rateLimited: 0 };
  hashes.forEach((hash, i) => {
    for (const [field, value] of Object.entries(hash ?? {})) {
      const [hour, type] = field.split(':');
      const hourStart = Date.parse(`${days[i]}T${hour}:00:00.000Z`);
      const n = Number(value);
      if (!Number.isFinite(hourStart) || hourStart < windowStart || !Number.isFinite(n)) continue;
      if (type === 'hmac_fail') out.hmacFail += n;
      else if (type === 'auth_fail') out.authFail += n;
      else if (type === 'rate_limited') out.rateLimited += n;
    }
  });
  return out;
}
