// Handler status akun dari script Lua milik sendiri (Roblox executor).
// Dipakai oleh /api/receiver/account dan alias lama /api/receiver/game.

import { accountPayloadSchema } from '@/lib/domain/schemas';
import { requireReceiverKey } from '@/lib/server/auth';
import { errorResponse, getClientIp, json, readJsonObject } from '@/lib/server/http';
import { hitRateLimit } from '@/lib/server/rateLimit';
import { getRedis } from '@/lib/server/redis';
import { recordEvent } from '@/lib/server/store';

// Satu IP boleh mengirim sampai 240 heartbeat per menit (sekitar 120 akun @30 detik).
const RATE = { limit: 240, windowSeconds: 60 };

export async function handleAccountHeartbeat(request) {
  const startedAt = Date.now();
  try {
    const denied = await requireReceiverKey(request);
    if (denied) return denied;

    const redis = getRedis();

    const rate = await hitRateLimit(redis, `rl:account:${getClientIp(request)}`, RATE);
    if (!rate.allowed) {
      return json({ success: false, message: 'Terlalu banyak request' }, 429, {
        'Retry-After': String(rate.retryAfterSeconds),
      });
    }

    const body = await readJsonObject(request);
    const parsed = accountPayloadSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => ({ path: i.path.join('.'), message: i.message }));
      return json({ success: false, message: 'Payload tidak valid', issues }, 400);
    }

    const payload = parsed.data;
    const eventType = payload.gameName ?? payload.event ?? 'Game Event';
    const { logData, account } = await recordEvent(redis, { payload, eventType, startedAt });

    return json({
      success: true,
      id: logData.id,
      state: account.state,
      serverTime: logData.receivedAt,
      rttMs: Date.now() - startedAt,
    });
  } catch (err) {
    return errorResponse(err, 'receiver/account');
  }
}
