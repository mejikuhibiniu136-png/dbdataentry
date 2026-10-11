import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

export async function GET() {
  const startDb = Date.now();
  
  try {
    await redis.ping();
    const dbPing = Date.now() - startDb;

    const totalLogs = await redis.llen('webhook_logs');

    // Estimasi ukuran per log ~ 500 byte
    const estimatedBytes = totalLogs * 500;
    const usedFormatted = (estimatedBytes / (1024 * 1024)).toFixed(3) + ' MB';
    const percentage = ((estimatedBytes / (256 * 1024 * 1024)) * 100).toFixed(4);

    // Estimasi DB Commands: 2 perintah per webhook (LPUSH + LTRIM) + 2 perintah per polling dashboard (PING + LLEN)
    const commandsCount = totalLogs * 2;

    // Estimasi Bandwidth: Total payload byte + overhead header (asumsi ~800 byte per request)
    const totalBandwidthBytes = totalLogs * 800;
    const bandwidthFormatted = totalBandwidthBytes > 1024 * 1024 
      ? (totalBandwidthBytes / (1024 * 1024)).toFixed(2) + ' MB'
      : (totalBandwidthBytes / 1024).toFixed(1) + ' KB';

    return Response.json({
      status: 'online',
      dbPing: `${dbPing}ms`,
      totalLogs,
      commandsCount,
      bandwidthFormatted,
      usage: {
        usedFormatted,
        limitFormatted: '256 MB',
        percentage
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return Response.json({
      status: 'offline',
      dbPing: 'Error',
      error: err.message
    }, { status: 500 });
  }
}
