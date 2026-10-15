import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { ConfigError, getAuthConfig } from '@/lib/server/auth';
import { errorResponse, getClientIp, json, readJsonObject } from '@/lib/server/http';
import { getRedis } from '@/lib/server/redis';
import { hitRateLimit, resetRateLimit } from '@/lib/server/rateLimit';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  safeEqual,
} from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;
const MAX_FIELD_LENGTH = 256;

export async function POST(request) {
  try {
    let config;
    try {
      config = getAuthConfig();
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error('[login] Konfigurasi tidak valid:', err.message);
        return json(
          { success: false, message: 'Konfigurasi login di server belum benar. Cek log server.' },
          500
        );
      }
      throw err;
    }

    // 1. Batasi percobaan per IP. Jika Redis bermasalah, login tetap berjalan (dicatat di log).
    const rateKey = `rl:login:${getClientIp(request)}`;
    let redis = null;
    try {
      redis = getRedis();
      const limit = await hitRateLimit(redis, rateKey, {
        limit: MAX_ATTEMPTS,
        windowSeconds: WINDOW_SECONDS,
      });
      if (!limit.allowed) {
        const minutes = Math.ceil(limit.retryAfterSeconds / 60);
        return json(
          {
            success: false,
            message: `Terlalu banyak percobaan login. Coba lagi dalam ${minutes} menit.`,
          },
          429,
          { 'Retry-After': String(limit.retryAfterSeconds) }
        );
      }
    } catch (err) {
      console.error('[login] Rate limit tidak dapat diperiksa:', err);
      redis = null;
    }

    // 2. Validasi input
    const body = await readJsonObject(request, 4096);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password || username.length > MAX_FIELD_LENGTH || password.length > MAX_FIELD_LENGTH) {
      return json({ success: false, message: 'Username atau Password salah!' }, 401);
    }

    // 3. Verifikasi. bcrypt selalu dijalankan agar waktu respons tidak membocorkan
    //    apakah username-nya benar.
    const isUserValid = await safeEqual(username, config.username);
    const isPasswordValid = await bcrypt.compare(password, config.passHash);

    if (!(isUserValid && isPasswordValid)) {
      return json({ success: false, message: 'Username atau Password salah!' }, 401);
    }

    if (redis) {
      try {
        await resetRateLimit(redis, rateKey);
      } catch (err) {
        console.error('[login] Gagal mereset rate limit:', err);
      }
    }

    const token = await createSessionToken(config.username, config.secret);
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });

    return json({ success: true }, 200);
  } catch (err) {
    return errorResponse(err, 'login');
  }
}
