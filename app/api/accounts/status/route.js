import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

// Ambil daftar status semua akun dari Redis Hash
export async function GET() {
  try {
    const rawData = await redis.hgetall('account_status');
    const accounts = rawData 
      ? Object.values(rawData).map(item => typeof item === 'string' ? JSON.parse(item) : item)
      : [];
    return Response.json({ success: true, data: accounts });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Endpoint untuk update status akun dari script
export async function POST(request) {
  try {
    const body = await request.json();
    const { username, displayName, status, scriptName, avatarUrl, gameName } = body;

    if (!username) {
      return Response.json({ success: false, message: 'Username required' }, { status: 400 });
    }

    const accountData = {
      username,
      displayName: displayName || username,
      status: status || 'ONLINE',
      scriptName: scriptName || gameName || 'Active Script',
      avatarUrl: avatarUrl || '',
      lastUpdate: new Date().toISOString()
    };

    await redis.hset('account_status', {
      [username]: JSON.stringify(accountData)
    });

    return Response.json({ success: true, data: accountData });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
