import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

export async function GET() {
  const startDb = Date.now();
  
  try {
    // 1. Ukur Ping Real-Time
    await redis.ping();
    const dbPing = Date.now() - startDb;

    // 2. Ambil Total Log Webhook Real-Time dari List
    const totalLogs = await redis.llen('webhook_logs');

    // 3. Ambil Stat Statistik Real-Time Langsung dari Upstash REST API
    let commandsCount = 0;
    let bandwidthFormatted = '0 KB';
    let usedFormatted = '0 MB';
    let percentage = '0.00';

    try {
      // Panggil endpoint statistik resmi Upstash
      const statsRes = await fetch(`${url}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        // Membaca data real-time dari Upstash
        commandsCount = statsData.data?.total_commands || statsData.total_commands || 0;
        
        const bandwidthBytes = statsData.data?.total_bandwidth || statsData.total_bandwidth || 0;
        bandwidthFormatted = bandwidthBytes > 1024 * 1024 
          ? (bandwidthBytes / (1024 * 1024)).toFixed(2) + ' MB'
          : (bandwidthBytes / 1024).toFixed(1) + ' KB';
      }
    } catch (e) {
      console.log('Stats API fallback', e);
    }

    // Fallback hitung memory storage jika /stats tidak mengembalikan memory
    const estimatedBytes = totalLogs * 600;
    usedFormatted = (estimatedBytes / (1024 * 1024)).toFixed(3) + ' MB';
    percentage = ((estimatedBytes / (256 * 1024 * 1024)) * 100).toFixed(4);

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
