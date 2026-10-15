import { requireAdmin } from '@/lib/auth/session';
import { getEnvReport, getRedisConfig, envInt } from '@/lib/env';
import { errorResponse, json } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { readReceiverEnabled } from '@/lib/ingest/store';

export const dynamic = 'force-dynamic';

const fmt = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`);

// Admin: status konfigurasi (tanpa nilai rahasia), kesehatan Redis, dan pemakaian Upstash.
export async function GET() {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;

    const env = getEnvReport();
    const base = { env, receiverEnabled: true, redis: { ok: false as boolean, pingMs: null as number | null, usedMemory: '-', limit: `${envInt('REDIS_MEMORY_LIMIT_MB', 256, 1, 102400)} MB`, percentage: '0', commands: 0, bandwidth: '-' } };
    if (!env.ok) return json({ success: true, ...base });

    const redis = getRedis();
    const started = Date.now();
    await redis.ping();
    base.redis.pingMs = Date.now() - started;
    base.redis.ok = true;
    base.receiverEnabled = await readReceiverEnabled(redis);

    // Statistik dari endpoint INFO Upstash (opsional, boleh gagal).
    try {
      const { url, token } = getRedisConfig();
      const res = await fetch(`${url.replace(/\/+$/, '')}/info`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = (await res.json()) as { result?: string };
        const text = typeof data.result === 'string' ? data.result : JSON.stringify(data);
        const cmds = text.match(/total_commands_processed:(\d+)/);
        const net = text.match(/total_net_output_bytes:(\d+)/);
        const mem = text.match(/used_memory:(\d+)/);
        if (cmds) base.redis.commands = Number(cmds[1]);
        if (net) base.redis.bandwidth = fmt(Number(net[1]));
        if (mem) {
          const used = Number(mem[1]);
          base.redis.usedMemory = fmt(used);
          base.redis.percentage = ((used / (envInt('REDIS_MEMORY_LIMIT_MB', 256, 1, 102400) * 1024 * 1024)) * 100).toFixed(3);
        }
      }
    } catch (err) {
      console.error('[system] INFO Upstash gagal:', err);
    }
    return json({ success: true, ...base });
  } catch (err) {
    return errorResponse(err, 'system GET');
  }
}
