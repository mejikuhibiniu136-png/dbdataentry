import { Redis } from '@upstash/redis';

// Otomatis membaca KV_REST_API_URL / STORAGE_REST_API_URL dari Vercel
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function POST(request) {
  const startTime = Date.now();
  try {
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

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rawLogs = await redis.lrange('webhook_logs', 0, 99);
    const logs = rawLogs.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
    return Response.json({ success: true, data: logs });
  } catch (err) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
