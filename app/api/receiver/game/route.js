import { requireReceiverKey } from '@/lib/auth';
import { cleanText } from '@/lib/accounts';
import { errorResponse, json, readJsonObject } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { recordEvent } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Penerima event / heartbeat dari script game (butuh API key receiver).
export async function POST(request) {
  const startedAt = Date.now();
  try {
    const denied = await requireReceiverKey(request);
    if (denied) return denied;

    const payload = await readJsonObject(request);
    const eventType =
      cleanText(payload.gameName, 200) ?? cleanText(payload.event, 200) ?? 'Game Event';

    const { logData } = await recordEvent(getRedis(), { payload, eventType, startedAt });

    return json(
      { success: true, message: 'Data game diterima', rttMs: Date.now() - startedAt, id: logData.id },
      200
    );
  } catch (err) {
    return errorResponse(err, 'receiver/game');
  }
}
