import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

export async function POST() {
  try {
    await redis.del('webhook_logs');
    return Response.json({ success: true, message: 'Semua log berhasil dihapus!' });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
