// Penerima webhook pihak ketiga (Anime Dice). Prinsip: kita tidak mengontrol pengirim,
// jadi receiver tidak boleh crash, tidak boleh membuang data hanya karena bentuknya berubah,
// dan tidak boleh memberi pengirim alasan untuk mematikan webhook.
//
//   auth gagal            -> 401/503   (satu-satunya penolakan keras, selain ukuran/laju)
//   terlalu besar         -> 413
//   terlalu sering        -> 429 + Retry-After
//   receiver dimatikan    -> 202, payload diabaikan
//   bukan JSON / bukan object -> 202, payload masuk KARANTINA
//   bentuk berubah        -> 202, field yang cocok disimpan, sisanya dibuang
//   Redis error           -> 503 (pengirim boleh mengulang)

import { gameWebhookSchema } from '@/lib/domain/schemas';
import { cleanText } from '@/lib/domain/accounts';
import { sanitizeDeep } from '@/lib/domain/sanitize';
import { requireIngestKey } from '@/lib/server/auth';
import {
  errorResponse,
  getClientIp,
  isPlainObject,
  json,
  readBodyText,
} from '@/lib/server/http';
import { hitRateLimit } from '@/lib/server/rateLimit';
import { getRedis } from '@/lib/server/redis';
import { isWebhookEnabled, pushLog, quarantinePayload } from '@/lib/server/store';
import { randomUUID } from 'node:crypto';

// Game server bisa mengirim burst; batas dibuat longgar dan hanya menahan banjir.
const RATE = { limit: 600, windowSeconds: 60 };

export function pickEventType(request, payload) {
  const embedTitle = cleanText(payload.embeds?.[0]?.title, 200);
  return (
    embedTitle ??
    cleanText(request.headers.get('x-github-event'), 200) ??
    cleanText(request.headers.get('x-event-type'), 200) ??
    cleanText(payload.event, 200) ??
    cleanText(payload.eventType, 200) ??
    'Custom Webhook'
  );
}

export async function handleDiceWebhook(request) {
  const startedAt = Date.now();
  try {
    const denied = await requireIngestKey(request);
    if (denied) return denied;

    const redis = getRedis();
    const ip = getClientIp(request);

    const rate = await hitRateLimit(redis, `rl:dice:${ip}`, RATE);
    if (!rate.allowed) {
      return json({ success: false, message: 'Terlalu banyak request' }, 429, {
        'Retry-After': String(rate.retryAfterSeconds),
      });
    }

    if (!(await isWebhookEnabled(redis))) {
      return json({ success: true, stored: false, message: 'Receiver OFF, payload diabaikan' }, 202);
    }

    const raw = await readBodyText(request);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      await quarantinePayload(redis, { reason: 'bukan JSON', raw, ip });
      return json({ success: true, stored: false, quarantined: true }, 202);
    }
    if (!isPlainObject(body)) {
      await quarantinePayload(redis, { reason: 'bukan object JSON', raw, ip });
      return json({ success: true, stored: false, quarantined: true }, 202);
    }

    const parsed = gameWebhookSchema.safeParse(body);
    const payload = sanitizeDeep(parsed.success ? parsed.data : body);

    const nowMs = Date.now();
    const logData = {
      id: randomUUID(),
      eventType: pickEventType(request, payload),
      payload,
      processingTimeMs: Math.max(0, nowMs - startedAt),
      receivedAt: new Date(nowMs).toISOString(),
    };
    // Log saja, tanpa menyentuh daftar akun: tidak ada read-modify-write, jadi tidak ada
    // race. LPUSH + LTRIM berjalan sebagai satu transaksi.
    await pushLog(redis, logData);

    return json({ success: true, stored: true, id: logData.id }, 202);
  } catch (err) {
    return errorResponse(err, 'webhook/dice');
  }
}
