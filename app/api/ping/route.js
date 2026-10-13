import { getSession } from '@/lib/auth';
import { LOG_KEY } from '@/lib/constants';
import { json, unauthorized } from '@/lib/http';
import { REDIS_TOKEN, REDIS_URL, getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Batas memori paket Redis (MB), hanya untuk persentase di dashboard.
const MEMORY_LIMIT_MB = Number(process.env.REDIS_MEMORY_LIMIT_MB) > 0 ? Number(process.env.REDIS_MEMORY_LIMIT_MB) : 256;

function formatBytes(bytes) {
  return bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const startDb = Date.now();

  try {
    const redis = getRedis();

    // 1. Latensi ping
    await redis.ping();
    const dbPing = Date.now() - startDb;

    // 2. Total log webhook
    const totalLogs = await redis.llen(LOG_KEY);

    // 3. Statistik real-time dari endpoint INFO Upstash
    let commandsCount = 0;
    let bandwidthFormatted = '0 KB';
    let usedFormatted = '0 MB';
    let percentage = '0.00';

    try {
      const infoRes = await fetch(`${REDIS_URL.replace(/\/+$/, '')}/info`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });

      if (infoRes.ok) {
        const infoData = await infoRes.json();
        const infoText =
          typeof infoData.result === 'string' ? infoData.result : JSON.stringify(infoData);

        const totalCmdsMatch = infoText.match(/total_commands_processed:(\d+)/);
        if (totalCmdsMatch) commandsCount = parseInt(totalCmdsMatch[1], 10);

        const netBytesMatch = infoText.match(/total_net_output_bytes:(\d+)/);
        if (netBytesMatch) bandwidthFormatted = formatBytes(parseInt(netBytesMatch[1], 10));

        const memMatch = infoText.match(/used_memory:(\d+)/);
        if (memMatch) {
          const usedBytes = parseInt(memMatch[1], 10);
          usedFormatted = `${(usedBytes / (1024 * 1024)).toFixed(3)} MB`;
          percentage = ((usedBytes / (MEMORY_LIMIT_MB * 1024 * 1024)) * 100).toFixed(4);
        }
      }
    } catch (e) {
      console.error('[ping] Gagal mengambil INFO real-time:', e);
    }

    return json({
      status: 'online',
      dbPing: `${dbPing}ms`,
      totalLogs,
      commandsCount,
      bandwidthFormatted,
      usage: {
        usedFormatted,
        limitFormatted: `${MEMORY_LIMIT_MB} MB`,
        percentage,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[ping]', err);
    return json({ status: 'offline', dbPing: 'Error' }, 500);
  }
}
