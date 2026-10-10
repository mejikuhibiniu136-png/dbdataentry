import { Redis } from '@upstash/redis';

// Otomatis membaca KV_REST_API_URL / STORAGE_REST_API_URL dari Vercel
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET() {
  const startDb = Date.now();
  
  try {
    await redis.ping();
    const dbPing = Date.now() - startDb;
    const totalLogs = await redis.llen('webhook_logs');
    
    const infoStr = await redis.info('memory');
    let usedMemory = 0;
    
    if (typeof infoStr === 'string') {
      const match = infoStr.match(/used_memory:(\d+)/);
      if (match) usedMemory = parseInt(match[1], 10);
    }

    return Response.json({
      status: 'online',
      dbPing: `${dbPing}ms`,
      dbPingVal: dbPing,
      totalLogs,
      usage: {
        usedBytes: usedMemory,
        usedFormatted: (usedMemory / (1024 * 1024)).toFixed(2) + ' MB',
        limitFormatted: '256 MB',
        percentage: Math.min(((usedMemory / (256 * 1024 * 1024)) * 100), 100).toFixed(2)
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
