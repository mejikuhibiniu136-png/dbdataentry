import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

export async function GET() {
  const startDb = Date.now();
  
  try {
    // 1. Ukur Ping Latency DB
    await redis.ping();
    const dbPing = Date.now() - startDb;

    // 2. Ambil Total Log
    const totalLogs = await redis.llen('webhook_logs');

    // 3. Estimasi Penggunaan Memori (Asumsi rata-rata 1 log JSON ~ 500 byte)
    const estimatedBytes = totalLogs * 500;
    const usedFormatted = (estimatedBytes / (1024 * 1024)).toFixed(3) + ' MB';
    const percentage = ((estimatedBytes / (256 * 1024 * 1024)) * 100).toFixed(4);

    return Response.json({
      status: 'online',
      dbPing: `${dbPing}ms`,
      totalLogs,
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
