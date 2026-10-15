// Penerima webhook universal. Alur satu request:
//   token opsional -> rate limit -> saklar receiver -> baca body (batas ukuran) ->
//   STAGING (/tmp, verifikasi utuh) -> parse JSON / URL-encoded / form-data / teks ->
//   deteksi game -> tulis atomik ke Upstash -> hapus file staging (selalu).
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { isAccountStatus, detectEventType, detectGameName } from '@/lib/ingest/detect';
import { parsePayload } from '@/lib/ingest/parse';
import { withStaging } from '@/lib/ingest/staging';
import { isReceiverEnabled, writeAccountAndLog, writeLogOnly } from '@/lib/ingest/store';
import { isHeartbeatEvent, mergeAccount, normalizeUsername } from '@/lib/accounts';
import { resolveGame } from '@/lib/games';
import { HttpError, errorResponse, getClientIp, json } from '@/lib/http';
import { KEYS, verifyHmacSignature } from '@/lib/keys';
import { hitRateLimit } from '@/lib/rateLimit';
import { getRedis, type RedisLike } from '@/lib/redis';
import { readSecretSetting } from '@/lib/settings';
import { accountPayloadSchema } from '@/schemas/account';
import type { LogEntry } from '@/types';

// Verifikasi HMAC-SHA256 opsional (header X-Webhook-Signature / X-Hub-Signature-256) terhadap
// WEBHOOK_SECRET yang Superadmin set di Pengaturan Sistem (tersimpan terenkripsi di Redis,
// didekripsi di sini). Tanpa secret yang dikonfigurasi, endpoint tetap terbuka seperti semula
// (kompatibel dengan klien lama, termasuk skrip Lua yang memakai WEBHOOK_INGEST_TOKEN).
async function verifyWebhookSignature(redis: RedisLike, headers: Headers, rawBody: Uint8Array): Promise<Response | null> {
  const secret = await readSecretSetting(redis, 'WEBHOOK_SECRET');
  if (!secret) return null;
  const signature = headers.get('x-webhook-signature') ?? headers.get('x-hub-signature-256');
  if (!verifyHmacSignature(rawBody, signature, secret)) {
    return json({ success: false, message: 'Signature HMAC tidak valid' }, 401);
  }
  return null;
}

export const MAX_BODY_BYTES = 256 * 1024;
const RATE = { limit: 600, windowSeconds: 60 };

export interface IngestOptions {
  /** Game bila payload tidak memuat identitas (mis. alias lama /api/webhook -> Anime Dice). */
  defaultGame?: string;
  /** Perlakukan payload sebagai status akun (alias lama /api/receiver/account). */
  forceAccount?: boolean;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export const preflight = () => withCors(new Response(null, { status: 204 }));

export const ingestInfo = () =>
  withCors(
    json({
      success: true,
      endpoint: 'universal webhook receiver',
      method: 'POST',
      accepts: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
      message: 'Kirim data dengan POST. Game/sumber dikenali dari game_name, game_id, source, dan kunci serupa.',
    })
  );

const sha = (s: string) => createHash('sha256').update(s).digest();

// Token opsional: aktif hanya jika WEBHOOK_INGEST_TOKEN diset. Tanpa itu endpoint terbuka.
function checkToken(request: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const expected = (env.WEBHOOK_INGEST_TOKEN ?? '').trim();
  if (!expected) return null;
  const auth = request.headers.get('authorization') ?? '';
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
  let query = '';
  try {
    query = new URL(request.url).searchParams.get('key') ?? '';
  } catch {
    query = '';
  }
  const provided = request.headers.get('x-api-key') || bearer || query;
  if (!provided || !timingSafeEqual(sha(provided), sha(expected))) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }
  return null;
}

// Membaca body dengan batas ukuran tanpa menampung seluruh stream lebih dulu.
async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, 'Payload terlalu besar');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Payload terpotong: koneksi terputus sebelum body selesai');
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function handleIngest(
  request: Request,
  options: IngestOptions = {},
  deps: { redis?: RedisLike } = {}
): Promise<Response> {
  const startedAt = Date.now();
  try {
    const denied = checkToken(request);
    if (denied) return withCors(denied);

    const redis = deps.redis ?? getRedis();
    const rate = await hitRateLimit(redis, KEYS.rateLimit('ingest', getClientIp(request.headers)), RATE);
    if (!rate.allowed) {
      return withCors(json({ success: false, message: 'Terlalu banyak request' }, 429, { 'Retry-After': String(rate.retryAfterSeconds) }));
    }

    if (!(await isReceiverEnabled(redis))) {
      return withCors(json({ success: true, stored: false, message: 'Receiver OFF, payload diabaikan' }, 202));
    }

    const declaredHeader = request.headers.get('content-length');
    const declared = declaredHeader !== null && /^\d+$/.test(declaredHeader) ? Number(declaredHeader) : null;
    if (declared !== null && declared > MAX_BODY_BYTES) throw new HttpError(413, 'Payload terlalu besar');

    const bytes = await readBodyBytes(request, MAX_BODY_BYTES);

    const badSignature = await verifyWebhookSignature(redis, request.headers, bytes);
    if (badSignature) return withCors(badSignature);

    const contentType = request.headers.get('content-type');
    const query = new URL(request.url).searchParams;

    const { value, staged } = await withStaging(bytes, { contentType, declaredLength: declared }, async (verified) => {
      const parsed = await parsePayload(verified, contentType);
      const gameName = detectGameName(parsed.data, request.headers, query, options.defaultGame);
      const game = await resolveGame(redis, gameName);
      const eventType = detectEventType(request.headers, parsed.data);

      const makeLog = (nowMs: number): LogEntry => ({
        id: randomUUID(),
        game: game.slug,
        gameName: game.name,
        eventType,
        payload: parsed.data,
        format: parsed.format,
        bytes: verified.length,
        processingTimeMs: Math.max(0, nowMs - startedAt),
        receivedAt: new Date(nowMs).toISOString(),
      });

      const base = { game: game.slug, gameName: game.name, newTable: game.isNew, format: parsed.format, bytes: verified.length };

      try {
        if (options.forceAccount || isAccountStatus(parsed.data)) {
          const acc = accountPayloadSchema.safeParse(parsed.data);
          const username = acc.success ? normalizeUsername(acc.data.username) : null;
          if (acc.success && username) {
            const res = await writeAccountAndLog(redis, game, username, (existing) => {
              const nowMs = Date.now();
              const { account, newSession } = mergeAccount(existing, acc.data, { nowMs, latencyMs: nowMs - startedAt });
              // Heartbeat rutin hanya memperbarui akun; log ditulis saat sesi mulai, offline, atau event lain.
              const shouldLog = newSession || account.state === 'OFFLINE' || !isHeartbeatEvent(acc.data.event);
              return { account, log: shouldLog ? makeLog(nowMs) : null };
            });
            return { ...base, id: res.log?.id ?? null, logged: res.log !== null, account: res.account.state };
          }
          // Bentuk status akun tidak valid: tetap disimpan sebagai log biasa, tidak dibuang.
        }
        const log = makeLog(Date.now());
        await writeLogOnly(redis, game, log);
        return { ...base, id: log.id, logged: true };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        console.error('[ingest] gagal menulis ke Redis:', err);
        throw new HttpError(503, 'Penyimpanan sementara tidak tersedia, coba kirim ulang', { 'Retry-After': '5' });
      }
    });

    return withCors(json({ success: true, stored: true, staged, ...value, rttMs: Date.now() - startedAt }, 200));
  } catch (err) {
    return withCors(errorResponse(err, 'receiver/universal'));
  }
}
