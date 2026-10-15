import { MAX_BODY_BYTES } from '@/lib/domain/constants';

// Error yang pesannya aman ditampilkan ke klien.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// Response JSON standar: selalu no-store agar tidak pernah di-cache.
export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function unauthorized() {
  return json({ success: false, message: 'Unauthorized' }, 401);
}

// Detail error asli hanya masuk log server, klien hanya menerima pesan umum.
export function errorResponse(err, context = 'api') {
  if (err instanceof HttpError) {
    return json({ success: false, message: err.message }, err.status);
  }
  console.error(`[${context}]`, err);
  return json({ success: false, message: 'Terjadi kesalahan pada server' }, 500);
}

// Membaca body sebagai teks dengan batas ukuran. Melempar HttpError(413) jika terlalu besar.
export async function readBodyText(request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, 'Payload terlalu besar');
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, 'Payload terlalu besar');
  }
  return text;
}

// Membaca body JSON dengan batas ukuran. Melempar HttpError(413/400) jika tidak valid.
export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const text = await readBodyText(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Body harus berupa JSON yang valid');
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Sama seperti readJsonBody, tetapi memastikan hasilnya sebuah object.
export async function readJsonObject(request, maxBytes = MAX_BODY_BYTES) {
  const body = await readJsonBody(request, maxBytes);
  if (!isPlainObject(body)) {
    throw new HttpError(400, 'Body harus berupa object JSON');
  }
  return body;
}

// Item dari Redis bisa berupa string JSON atau object (auto-deserialize).
// Item yang rusak menghasilkan null, tidak melempar error.
export function parseStored(item) {
  if (typeof item === 'string') {
    try {
      return JSON.parse(item);
    } catch {
      return null;
    }
  }
  return item ?? null;
}

// IP klien. x-real-ip diisi platform (Vercel / nginx) sehingga dipilih lebih dulu.
export function getClientIp(request) {
  const real = request.headers.get('x-real-ip');
  const forwarded = request.headers.get('x-forwarded-for');
  const raw = (real || (forwarded ? forwarded.split(',')[0] : '') || 'unknown').trim();
  return raw.replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unknown';
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
