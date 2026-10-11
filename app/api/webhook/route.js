import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

export async function POST(request) {
  try {
    // 1. Cek status toggle penerima webhook
    const isEnabled = await redis.get('webhook:status');
    if (isEnabled === false || isEnabled === 'false') {
      // Memutuskan koneksi & menolak request tanpa eksekusi perintah DB tambahan
      return Response.json({
        success: false,
        message: 'Webhook receiver is currently DISABLED by administrator.'
      }, { status: 503 });
    }

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

    // 2. Simpan log hanya jika status ON
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
