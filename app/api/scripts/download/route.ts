import { authenticateApiKey } from '@/lib/apikeys';
import { envInt } from '@/lib/env';
import { HttpError, errorResponse, getClientIp, json } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import { renderAccountStatusLua } from '@/lib/lua/accountStatus';
import { sealScript } from '@/lib/lua/scriptCrypto';
import { hitRateLimit } from '@/lib/rateLimit';
import { getRedis } from '@/lib/redis';
import { bindHwid, recordLeak } from '@/lib/scriptguard/binding';
import { composeGuardedLua, readLuaModules } from '@/lib/scriptguard/compose';
import { hwidDigest, normalizeHwid } from '@/lib/scriptguard/hwid';
import { originOf } from '@/lib/scriptguard/origin';
import { issueWatermark } from '@/lib/scriptguard/watermark';
import { recordSecurityEvent } from '@/lib/securityStats';
import { readLuaObfuscationEnabled } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // membaca lua/*.lua lewat fs

// API Key dari x-script-key (loader), x-api-key, atau Authorization: Bearer.
function readKey(headers: Headers): string {
  const bearer = /^bearer\s+/i.test(headers.get('authorization') ?? '') ? (headers.get('authorization') as string).replace(/^bearer\s+/i, '').trim() : '';
  return (headers.get('x-script-key') || headers.get('x-api-key') || bearer).trim();
}

// Unduhan skrip terlindungi. Alur: API Key -> rate limit -> HWID wajib -> ikat/cek perangkat -> rakit skrip + watermark
// unik -> segel dengan API Key (hanya pemilik key yang bisa membukanya) -> "nonce\nhex" (format loader.lua).
export async function GET(request: Request) {
  try {
    const redis = getRedis();
    const provided = readKey(request.headers);
    const key = provided ? await authenticateApiKey(redis, provided) : null;
    if (!key) {
      await recordSecurityEvent(redis, 'auth_fail');
      return json({ success: false, message: 'Unauthorized' }, 401);
    }

    const rate = await hitRateLimit(redis, KEYS.rateLimit('script-dl', key.id), { limit: 10, windowSeconds: 60 });
    if (!rate.allowed) throw new HttpError(429, 'Terlalu banyak unduhan, coba lagi nanti', { 'Retry-After': String(rate.retryAfterSeconds) });

    const hwid = normalizeHwid(request.headers.get('x-hwid'));
    if (!hwid) throw new HttpError(400, 'Header x-hwid wajib dan harus berupa HWID perangkat yang valid');
    const hwHash = hwidDigest(hwid);

    const bind = await bindHwid(redis, key.id, hwHash, { max: envInt('HWID_MAX_DEVICES', 1, 1, 10), ip: getClientIp(request.headers) });
    if (bind.status === 'denied') {
      await recordLeak(redis, { reason: 'device_limit', source: 'download', uid: key.id, observedHw: hwHash, headers: request.headers });
      throw new HttpError(403, 'Perangkat ini tidak terdaftar untuk key tersebut. Minta admin mereset HWID bila Anda berganti perangkat.');
    }

    const origin = originOf(request);
    const obfuscate = await readLuaObfuscationEnabled(redis).catch(() => false); // gagal baca = skrip polos, sama seperti /scripts/account_status.lua
    const [mods, main] = await Promise.all([readLuaModules(), Promise.resolve(renderAccountStatusLua(`${origin}/api/receiver/universal`, { obfuscate }))]);

    const wm = issueWatermark({ uid: key.id, hwid });
    const plain = composeGuardedLua(mods, { token: wm.token, salt: wm.salt, fp: wm.fp, jti: wm.jti, base: origin }, main);
    const { nonce, hex } = sealScript(plain, provided);

    return new Response(`${nonce}\n${hex}`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Device-Bound': bind.status,
      },
    });
  } catch (err) {
    return errorResponse(err, 'scripts/download');
  }
}
