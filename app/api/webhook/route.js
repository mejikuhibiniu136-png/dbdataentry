import { getSession, requireReceiverKey } from '@/lib/auth';
import { cleanText } from '@/lib/accounts';
import { MAX_STORED_LOGS } from '@/lib/constants';
import { clampInt, errorResponse, json, readJsonObject, unauthorized } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { isWebhookEnabled, readLogs, recordEvent } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Penerima webhook (butuh API key receiver). Dapat dimatikan lewat saklar di dashboard.
export async function POST(request) {
  const startedAt = Date.now();
  try {
    const denied = await requireReceiverKey(request);
    if (denied) return denied;

    const redis = getRedis();

    if (!(await isWebhookEnabled(redis))) {
      return json({ success: false, message: 'Receiver is OFF.' }, 503);
    }

    const payload = await readJsonObject(request);

    let eventType =
      cleanText(request.headers.get('x-github-event'), 200) ??
      cleanText(request.headers.get('x-event-type'), 200) ??
      cleanText(payload.event, 200) ??
      cleanText(payload.eventType, 200);

    const embedTitle = cleanText(payload.embeds?.[0]?.title, 200);
    eventType = embedTitle ?? eventType ?? 'Custom Webhook';

    await recordEvent(redis, { payload, eventType, startedAt });

    return json({ success: true, message: 'Data webhook tersimpan' }, 200);
  } catch (err) {
    return errorResponse(err, 'webhook POST');
  }
}

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
