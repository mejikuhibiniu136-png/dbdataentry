import { HttpError, errorResponse, getClientIp, json, readJson } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import { hitRateLimit } from '@/lib/rateLimit';
import { getRedis } from '@/lib/redis';
import { isHwidBound, recordLeak } from '@/lib/scriptguard/binding';
import { hwidDigest, normalizeHwid, safeEqualHex } from '@/lib/scriptguard/hwid';
import { openWatermark } from '@/lib/scriptguard/watermark';
import { recordSecurityEvent } from '@/lib/securityStats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Laporan dari guard.lua saat pemeriksaan lokal gagal (skrip bocor ke perangkat lain). Kredensialnya adalah token
// watermark di body. Server tidak percaya klaim klien: HWID yang dilaporkan di-digest dan dibandingkan sendiri, dan
// hanya perangkat yang benar-benar tidak terdaftar yang dicatat sebagai kebocoran (log ke Redis + alert).
export async function POST(request: Request) {
  try {
    const redis = getRedis();
    const rate = await hitRateLimit(redis, KEYS.rateLimit('script-report', getClientIp(request.headers)), { limit: 20, windowSeconds: 60 });
    if (!rate.allowed) throw new HttpError(429, 'Terlalu banyak laporan', { 'Retry-After': String(rate.retryAfterSeconds) });

    const body = await readJson(request, 4 * 1024);
    const payload = openWatermark(body.token);
    if (!payload) {
      await recordSecurityEvent(redis, 'auth_fail');
      throw new HttpError(403, 'Token tidak valid');
    }
    // Per token: membatasi penyalahgunaan endpoint ini sebagai oracle HWID.
    const perToken = await hitRateLimit(redis, KEYS.rateLimit('script-report-jti', payload.jti), { limit: 5, windowSeconds: 3600 });
    if (!perToken.allowed) throw new HttpError(429, 'Terlalu banyak laporan', { 'Retry-After': String(perToken.retryAfterSeconds) });
    const hwid = normalizeHwid(body.hwid);
    if (!hwid) throw new HttpError(400, 'HWID tidak valid');

    const observed = hwidDigest(hwid);
    if (safeEqualHex(observed, payload.hw) || (await isHwidBound(redis, payload.uid, observed))) {
      return json({ success: true, match: true }); // perangkat sah (pemeriksaan lokal salah / perangkat kedua terdaftar)
    }
    await recordLeak(redis, { reason: 'hwid_mismatch', source: 'report', uid: payload.uid, jti: payload.jti, ownerHw: payload.hw, observedHw: observed, headers: request.headers });
    return json({ success: true, match: false, action: 'KILL' });
  } catch (err) {
    return errorResponse(err, 'scripts/report');
  }
}
