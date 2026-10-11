import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

// Cache status lokal di memori Vercel Instance (Tahan hingga 30 detik)
let cachedStatus = null;
let lastCacheTime = 0;

export async function POST(request) {
  const now = Date.now();

  // Hanya query DB jika cache sudah expired (lebih dari 30 detik)
  if (cachedStatus === null || now - lastCacheTime > 30000) {
    try {
      const isEnabled = await redis.get('webhook:status');
      cachedStatus = isEnabled === null ? true : Boolean(isEnabled);
      lastCacheTime = now;
    } catch (e) {
      cachedStatus = true;
    }
  }

  // Jika status OFF, langsung REJECT instan tanpa sentuh Redis!
  if (!cachedStatus) {
    return Response.json({
      success: false,
      message: 'Webhook receiver is OFF. Request rejected immediately (0 DB commands used).'
    }, { status: 503 });
  }

  // Jika status ON, jalankan simpan log
  try {
    const startTime = Date.now();
    const payload = await request.json();
    const eventType = request.headers.get('x-github-event') || 
                      request.headers.get('x-event-type') || 
                      'Custom Webhook';

    const processingTime = Date.now() - startTime;

    const logData = {
      id: crypto.randomUUID(),
      eventType,
      payload,
      processingTimeMs: processingTime,
      receivedAt: new Date().toISOString()
    };

    await redis.lpush('webhook_logs', JSON.stringify(logData));
    await redis.ltrim('webhook_logs', 0, 199);

    return Response.json({
      success: true,
      latency: `${processingTime}ms`,
      message: 'Data tersimpan ke dbdataentry'
    }, { status: 200 });

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
