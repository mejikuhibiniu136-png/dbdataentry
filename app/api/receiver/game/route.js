import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

let cachedStatus = null;
let lastCacheTime = 0;

export async function POST(request) {
  const now = Date.now();

  // Cek status toggle ON/OFF
  if (cachedStatus === null || now - lastCacheTime > 30000) {
    try {
      const isEnabled = await redis.get('webhook:status');
      cachedStatus = isEnabled === null ? true : Boolean(isEnabled);
      lastCacheTime = now;
    } catch (e) {
      cachedStatus = true;
    }
  }

  if (!cachedStatus) {
    return Response.json({ success: false, message: 'Receiver is OFF.' }, { status: 503 });
  }

  try {
    const startTime = Date.now();
    const payload = await request.json();

    const logData = {
      id: crypto.randomUUID(),
      eventType: payload.gameName || payload.event || 'Game Event',
      payload,
      processingTimeMs: Date.now() - startTime,
      receivedAt: new Date().toISOString()
    };

    await redis.lpush('webhook_logs', JSON.stringify(logData));
    await redis.ltrim('webhook_logs', 0, 199);

    return Response.json({ success: true, message: 'Data game berhasil diterima' }, { status: 200 });

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
