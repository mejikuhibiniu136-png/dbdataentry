import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

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
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
