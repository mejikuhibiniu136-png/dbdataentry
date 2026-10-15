// Autentikasi sisi server (Node.js runtime). Jangan diimpor dari middleware.

import { cookies } from 'next/headers';
import { json, unauthorized } from '@/lib/server/http';
import {
  SESSION_COOKIE,
  getSessionSecret,
  safeEqual,
  verifySessionToken,
} from '@/lib/server/session';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;
// bcryptjs (JavaScript murni) sangat lambat di atas cost ini dan bisa membuat login time out.
export const MAX_BCRYPT_COST = 14;
export const MIN_RECEIVER_KEY_LENGTH = 16;

// Membaca dan memvalidasi konfigurasi login. Tidak ada nilai default: lebih baik gagal
// daripada memakai kredensial bawaan.
export function getAuthConfig(env = process.env) {
  const username = typeof env.DASHBOARD_USER === 'string' ? env.DASHBOARD_USER.trim() : '';
  const passHash = typeof env.DASHBOARD_PASS_HASH === 'string' ? env.DASHBOARD_PASS_HASH.trim() : '';
  const secret = getSessionSecret(env);

  const problems = [];
  if (!username) problems.push('DASHBOARD_USER belum diset');
  if (!passHash) problems.push('DASHBOARD_PASS_HASH belum diset');
  if (!secret) problems.push('SESSION_SECRET belum diset atau kurang dari 32 karakter');
  if (problems.length > 0) throw new ConfigError(problems.join('; '));

  const match = BCRYPT_HASH_PATTERN.exec(passHash);
  if (!match) {
    throw new ConfigError(
      'DASHBOARD_PASS_HASH bukan hash bcrypt yang valid (jika diset lewat file .env, karakter $ harus di-escape menjadi \\$)'
    );
  }
  const cost = Number(match[1]);
  if (cost < 4 || cost > MAX_BCRYPT_COST) {
    throw new ConfigError(
      `Cost bcrypt pada DASHBOARD_PASS_HASH adalah ${cost}, harus antara 4 dan ${MAX_BCRYPT_COST} (disarankan 12). Buat ulang dengan: npm run hash`
    );
  }

  return { username, passHash, secret };
}

// Sesi dari cookie request saat ini ({ u, iat, exp }) atau null.
export async function getSession() {
  const secret = getSessionSecret();
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, secret);
}

// Mengambil key dari `x-api-key`, `Authorization: Bearer <key>`, atau `?key=`.
function extractProvidedKey(request) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = /^bearer\s+/i.test(authorization) ? authorization.replace(/^bearer\s+/i, '').trim() : '';
  let queryKey = '';
  try {
    queryKey = new URL(request.url).searchParams.get('key') || '';
  } catch {
    queryKey = '';
  }
  return request.headers.get('x-api-key') || bearer || queryKey;
}

async function checkKey(request, expected, label) {
  if (typeof expected !== 'string' || expected.length < MIN_RECEIVER_KEY_LENGTH) {
    console.error(`[receiver] ${label} belum diset atau kurang dari ${MIN_RECEIVER_KEY_LENGTH} karakter, request ditolak`);
    return json({ success: false, message: 'Receiver belum dikonfigurasi di server' }, 503);
  }
  const provided = extractProvidedKey(request);
  if (!provided || !(await safeEqual(provided, expected))) {
    return unauthorized();
  }
  return null;
}

// Status akun (script Lua milik sendiri): wajib RECEIVER_API_KEY lewat header `x-api-key`.
// Mengembalikan Response error jika ditolak, atau null jika diizinkan.
export async function requireReceiverKey(request, env = process.env) {
  return checkKey(request, env.RECEIVER_API_KEY, 'RECEIVER_API_KEY');
}

// Webhook pihak ketiga (Anime Dice): memakai token TERPISAH (WEBHOOK_INGEST_TOKEN) supaya
// URL webhook yang ditempel di layanan lain tidak memberi akses tulis ke status akun.
// Jika WEBHOOK_INGEST_TOKEN belum diset, jatuh ke RECEIVER_API_KEY agar URL lama tetap jalan.
export async function requireIngestKey(request, env = process.env) {
  const useDedicated = typeof env.WEBHOOK_INGEST_TOKEN === 'string' && env.WEBHOOK_INGEST_TOKEN.length > 0;
  return checkKey(
    request,
    useDedicated ? env.WEBHOOK_INGEST_TOKEN : env.RECEIVER_API_KEY,
    useDedicated ? 'WEBHOOK_INGEST_TOKEN' : 'RECEIVER_API_KEY'
  );
}
