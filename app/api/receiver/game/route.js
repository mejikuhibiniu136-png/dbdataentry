import { Redis } from '@upstash/redis';
import * as Sentry from '@sentry/nextjs';

const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

const redis = new Redis({ url, token });

// Fungsi pengiriman log ke Axiom
async function sendToAxiom(logData) {
  const axiomToken = process.env.AXIOM_TOKEN;
  const axiomDataset = process.env.AXIOM_DATASET || 'roblox-logs';
  
  if (!axiomToken) return;

  try {
    await fetch(`https://api.axiom.co/v1/datasets/${axiomDataset}/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${axiomToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([logData])
    });
  } catch (e) {
    Sentry.captureException(e);
  }
}

export async function POST(request) {
  const startTime = Date.now();
  try {
    const payload = await request.json();

    const logData = {
      id: crypto.randomUUID(),
      eventType: payload.gameName || payload.event || 'Game Event',
      payload,
      processingTimeMs: Date.now() - startTime,
      receivedAt: new Date().toISOString()
    };

    // 1. Simpan di Redis untuk tampilan dashboard
    await redis.lpush('webhook_logs', JSON.stringify(logData));
    await redis.ltrim('webhook_logs', 0, 199);

    // 2. Alirkan data log ke Axiom untuk penyimpanan jangka panjang
    sendToAxiom(logData);

    const accUsername = payload?.username;
    if (accUsername) {
      const existingRaw = await redis.hget('account_status', accUsername);
      const existingAcc = existingRaw ? (typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw) : null;

      const nowIso = new Date().toISOString();
      const isOfflineEvent = payload.event === 'Offline' || payload.event === 'OFFLINE';

      const accountData = {
        username: accUsername,
        displayName: payload.displayName || accUsername,
        userId: payload.userId || '-',
        placeId: payload.placeId || '-',
        jobId: payload.jobId || 'Local/Private',
        gameName: payload.gameName || 'Unknown Game',
        event: payload.event || 'Heartbeat',
        status: isOfflineEvent ? 'OFFLINE' : 'ONLINE',
        avatarUrl: payload.avatarUrl || '',
        timestamp: payload.sessionStart || existingAcc?.timestamp || payload.timestamp || nowIso,
        lastUpdate: nowIso,
        latencyMs: logData.processingTimeMs
      };

      await redis.hset('account_status', {
        [accUsername]: JSON.stringify(accountData)
      });
    }

    return Response.json({ success: true, message: 'Data game diterima', rttMs: Date.now() - startTime }, { status: 200 });
  } catch (err) {
    // Laporkan error ke Sentry secara otomatis
    Sentry.captureException(err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
