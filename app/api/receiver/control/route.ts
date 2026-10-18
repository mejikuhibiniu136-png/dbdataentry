// Kill-switch jarak jauh.
//   POST  dashboard -> terbitkan perintah (sesi + izin accounts:write + Origin sama; diaudit)
//   GET   skrip Lua -> ambil perintah untuk akunnya (token watermark + HWID)
//   PUT   skrip Lua -> konfirmasi (ack) perintah sudah dijalankan
// Catatan: proxy.ts membiarkan /api/receiver/* lewat tanpa sesi; POST di sini menegakkan sesinya sendiri.
import { z } from 'zod';
import { normalizeUsername } from '@/lib/accounts';
import { actorOf, recordAudit } from '@/lib/audit';
import { ackCommand, issueCommand, peekCommand } from '@/lib/control/commands';
import { HttpError, errorResponse, json, readJson } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import { hitRateLimit } from '@/lib/rateLimit';
import { requirePermission } from '@/lib/rbac/guard';
import { getRedis } from '@/lib/redis';
import { authenticateControl, scriptDenied } from '@/lib/scriptguard/auth';
import { isSameOrigin } from '@/lib/scriptguard/origin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const issueSchema = z.object({
  accountId: z.string().trim().min(1).max(64),
  command: z.enum(['KILL', 'PAUSE', 'RESUME']),
  ttlSeconds: z.number().int().min(10).max(600).optional(),
});

export async function POST(request: Request) {
  try {
    const { session, denied } = await requirePermission('accounts:write');
    if (denied) return denied;
    if (!isSameOrigin(request)) throw new HttpError(403, 'Origin tidak diizinkan');

    const redis = getRedis();
    const rate = await hitRateLimit(redis, KEYS.rateLimit('control', session.sub.toLowerCase()), { limit: 30, windowSeconds: 60 });
    if (!rate.allowed) throw new HttpError(429, 'Terlalu banyak perintah', { 'Retry-After': String(rate.retryAfterSeconds) });

    const parsed = issueSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, 'Perintah tidak valid');
    const account = normalizeUsername(parsed.data.accountId);
    // Hanya akun yang dikenal tracker: mencegah key Redis sembarang dibuat lewat endpoint ini.
    if (!account || Number(await redis.hexists(KEYS.trackerAccounts, account)) !== 1) throw new HttpError(404, 'Akun tidak ditemukan');

    const state = await issueCommand(redis, { account, cmd: parsed.data.command, by: session.sub, ttlSeconds: parsed.data.ttlSeconds });
    await recordAudit(redis, { ...actorOf(session, request.headers), action: 'control.issue', target: account, detail: `${state.cmd} id=${state.id.slice(0, 8)} exp=${state.expiresAt}` });
    return json({ success: true, data: state });
  } catch (err) {
    return errorResponse(err, 'receiver/control POST');
  }
}

export async function GET(request: Request) {
  try {
    const redis = getRedis();
    const auth = await authenticateControl(request, redis);
    if (!auth.ok) return scriptDenied(auth);

    // Per key / per salinan skrip publik, bukan per IP: banyak akun di satu mesin memolling ~12x/menit masing-masing.
    const rate = await hitRateLimit(redis, KEYS.rateLimit('control-poll', auth.rateId), { limit: 600, windowSeconds: 60 });
    if (!rate.allowed) throw new HttpError(429, 'Terlalu banyak polling', { 'Retry-After': String(rate.retryAfterSeconds) });

    const account = normalizeUsername(new URL(request.url).searchParams.get('account'));
    if (!account) throw new HttpError(400, 'Parameter account wajib');

    const now = Date.now();
    const pending = await peekCommand(redis, account);
    return json({
      success: true,
      cmd: pending?.cmd ?? 'NONE',
      id: pending?.id ?? null,
      ttl: pending ? Math.max(0, Math.round((Date.parse(pending.expiresAt) - now) / 1000)) : 0,
      serverTime: now,
    });
  } catch (err) {
    return errorResponse(err, 'receiver/control GET');
  }
}

export async function PUT(request: Request) {
  try {
    const redis = getRedis();
    const auth = await authenticateControl(request, redis);
    if (!auth.ok) return scriptDenied(auth);

    const body = await readJson(request, 1024);
    const account = normalizeUsername(body.account);
    if (!account || typeof body.id !== 'string') throw new HttpError(400, 'account dan id wajib');
    return json({ success: true, acked: await ackCommand(redis, account, body.id) });
  } catch (err) {
    return errorResponse(err, 'receiver/control PUT');
  }
}
