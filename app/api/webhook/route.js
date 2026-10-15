import { getSession } from '@/lib/server/auth';
import { MAX_STORED_LOGS } from '@/lib/domain/constants';
import { clampInt, errorResponse, json, unauthorized } from '@/lib/server/http';
import { handleDiceWebhook } from '@/lib/server/handlers/diceWebhook';
import { getRedis } from '@/lib/server/redis';
import { readLogs } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

// Webhook pihak ketiga (Anime Dice). Token: WEBHOOK_INGEST_TOKEN (atau RECEIVER_API_KEY
// bila belum diset) lewat `?key=` / `x-api-key` / `Authorization: Bearer`.
export const POST = handleDiceWebhook;

// Dashboard: daftar log terbaru (butuh sesi login). Opsional ?limit=1..200.
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const limit = clampInt(
      new URL(request.url).searchParams.get('limit'),
      1,
      MAX_STORED_LOGS,
      MAX_STORED_LOGS
    );
    const data = await readLogs(getRedis(), limit);
    return json({ success: true, data });
  } catch (err) {
    return errorResponse(err, 'webhook GET');
  }
}
