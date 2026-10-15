// Logika login/registrasi (dipisah dari route agar bisa diuji tanpa Next).
import { randomUUID } from 'node:crypto';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildDeviceEntry } from '@/lib/device';
import { ConfigError, getAdminConfig, getJwtSecret } from '@/lib/env';
import { HttpError, getClientIp } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import { hitRateLimit, resetRateLimit } from '@/lib/rateLimit';
import type { RedisLike } from '@/lib/redis';
import { signSession } from '@/lib/auth/jwt';
import { verifyAgainstDummy, verifyPassword } from '@/lib/auth/password';
import { createUser, getUser, recordDevice, userKey } from '@/lib/users';
import type { Role } from '@/types';

const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEqualText = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

const IP_LIMIT = { limit: 20, windowSeconds: 15 * 60 };
const USER_LIMIT = { limit: 5, windowSeconds: 15 * 60 };
const REGISTER_LIMIT = { limit: 5, windowSeconds: 60 * 60 };

export interface LoginResult {
  token: string;
  username: string;
  role: Role;
}

const BAD_LOGIN = new HttpError(401, 'Username atau password salah');

export async function performLogin(
  redis: RedisLike | null,
  headers: Headers,
  username: string,
  password: string
): Promise<LoginResult> {
  let admin;
  let secret;
  try {
    admin = getAdminConfig();
    secret = getJwtSecret();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error('[login] konfigurasi belum lengkap:', err.message);
      throw new HttpError(503, 'Server belum dikonfigurasi. Admin: lengkapi Environment Variables di Vercel.');
    }
    throw err;
  }

  const ip = getClientIp(headers);
  const lowered = userKey(username);
  const ipKey = KEYS.rateLimit('login-ip', ip);
  const userRateKey = KEYS.rateLimit('login-user', createHash('sha256').update(lowered).digest('hex').slice(0, 24));

  // Pembatas laju per IP dan per username. Redis bermasalah: login admin tetap boleh berjalan.
  if (redis) {
    try {
      for (const [key, rule] of [[ipKey, IP_LIMIT], [userRateKey, USER_LIMIT]] as const) {
        const r = await hitRateLimit(redis, key, rule);
        if (!r.allowed) {
          throw new HttpError(429, `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(r.retryAfterSeconds / 60)} menit.`, {
            'Retry-After': String(r.retryAfterSeconds),
          });
        }
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('[login] rate limit tidak dapat diperiksa:', err);
    }
  }

  // Verifikasi hash selalu dijalankan sekali agar waktu respons tidak membocorkan username valid.
  let role: Role | null = null;
  let canonical = username.trim();
  const isAdminName = safeEqualText(lowered, userKey(admin.username));

  if (isAdminName) {
    if (await verifyPassword(admin.passwordHash, password)) {
      role = 'admin';
      canonical = admin.username;
    }
  } else if (redis) {
    const user = await getUser(redis, username);
    if (user) {
      if (await verifyPassword(user.passwordHash, password)) {
        role = 'user';
        canonical = user.username;
      }
    } else {
      await verifyAgainstDummy(password);
    }
  } else {
    await verifyAgainstDummy(password);
  }
  if (!role) throw BAD_LOGIN;

  if (redis) {
    await Promise.all([resetRateLimit(redis, userRateKey), resetRateLimit(redis, ipKey)]).catch(() => undefined);
  }

  // Riwayat perangkat/IP disimpan di Redis untuk dipantau admin. Gagal mencatat tidak menggagalkan login.
  const sid = randomUUID();
  if (redis) {
    try {
      await recordDevice(redis, userKey(canonical), await buildDeviceEntry(headers, sid));
    } catch (err) {
      console.error('[login] gagal mencatat perangkat:', err);
    }
  }

  return { token: await signSession({ sub: canonical, role, sid }, secret), username: canonical, role };
}

export async function performRegister(redis: RedisLike, headers: Headers, username: string, password: string) {
  const rate = await hitRateLimit(redis, KEYS.rateLimit('register', getClientIp(headers)), REGISTER_LIMIT);
  if (!rate.allowed) {
    throw new HttpError(429, 'Terlalu banyak pendaftaran dari alamat ini. Coba lagi nanti.', {
      'Retry-After': String(rate.retryAfterSeconds),
    });
  }
  let reserved: string[] = [];
  try {
    reserved = [userKey(getAdminConfig().username)];
  } catch {
    // admin belum dikonfigurasi: tidak ada nama yang perlu dicadangkan
  }
  const user = await createUser(redis, username, password, reserved);
  return { username: user.username, role: user.role };
}
