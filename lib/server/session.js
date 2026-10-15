// Sesi login bertanda tangan HMAC-SHA256.
// Hanya memakai Web API (crypto.subtle, TextEncoder, btoa/atob) sehingga aman
// dijalankan di Edge runtime (middleware) maupun Node.js (route handler).

export const SESSION_COOKIE = 'auth_token';
export const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 jam
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

// Perbandingan string waktu-konstan (membandingkan digest SHA-256 keduanya).
export async function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Mengembalikan secret yang valid, atau null jika belum diset / terlalu pendek.
export function getSessionSecret(env = process.env) {
  const secret = env.SESSION_SECRET;
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export async function createSessionToken(username, secret, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const payload = { u: username, iat, exp: iat + SESSION_MAX_AGE_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(body, secret);
  return `${body}.${signature}`;
}

// Mengembalikan payload sesi ({ u, iat, exp }) jika token valid dan belum kedaluwarsa, selain itu null.
export async function verifySessionToken(token, secret, nowMs = Date.now()) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
  if (typeof secret !== 'string' || secret.length === 0) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = await sign(body, secret);
  if (!(await safeEqual(signature, expected))) return null;

  let payload;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(body)));
  } catch {
    return null;
  }

  if (!payload || typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 <= nowMs) return null;
  return payload;
}
