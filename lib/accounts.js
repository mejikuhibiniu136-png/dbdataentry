// Logika murni pembentukan record akun (tanpa Redis) agar semua jalur penulisan
// (/api/webhook, /api/receiver/game, /api/accounts/status) menghasilkan skema yang sama.

import { OFFLINE_AFTER_SECONDS } from '@/lib/accountStatus';

const MAX_USERNAME_LENGTH = 64;
const FORBIDDEN_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);

// String bersih (di-trim, dipotong) atau undefined. Angka diubah menjadi string.
export function cleanText(value, max = 256) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function normalizeUsername(value) {
  const name = cleanText(value, MAX_USERNAME_LENGTH + 1);
  if (!name || name.length > MAX_USERNAME_LENGTH) return null;
  if (FORBIDDEN_FIELDS.has(name)) return null;
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

// Mengubah ISO string / epoch (detik atau milidetik) menjadi ISO string, atau null jika tidak valid.
// Tanggal lebih dari 1 hari di masa depan dianggap tidak valid.
export function toIso(value, nowMs = Date.now()) {
  if (value === undefined || value === null || value === '') return null;
  let input = value;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    input = input < 1e11 ? input * 1000 : input; // < 1e11 dianggap detik
  } else if (typeof input !== 'string') {
    return null;
  }
  const date = new Date(input);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms > nowMs + 24 * 60 * 60 * 1000) return null;
  return date.toISOString();
}

// Menggabungkan data akun yang sudah ada dengan payload baru.
// Nilai yang tidak dikirim di payload dipertahankan dari data lama.
export function mergeAccount(existing, payload, { nowMs = Date.now(), latencyMs = 0 } = {}) {
  const username = normalizeUsername(payload?.username);
  if (!username) return null;

  const prev = existing && typeof existing === 'object' ? existing : null;
  const nowIso = new Date(nowMs).toISOString();

  const eventName = cleanText(payload.event, 64);
  const statusHint = cleanText(payload.status, 32);
  const isOffline = [eventName, statusHint].some((v) => v && v.toLowerCase() === 'offline');

  // Sesi baru dimulai jika akun belum pernah ada, sebelumnya OFFLINE, atau heartbeat terputus.
  const prevLast = prev ? new Date(prev.lastUpdate).getTime() : NaN;
  const wasDown =
    !prev ||
    String(prev.status).toUpperCase() === 'OFFLINE' ||
    !Number.isFinite(prevLast) ||
    (nowMs - prevLast) / 1000 > OFFLINE_AFTER_SECONDS;

  const sessionStart = toIso(payload.sessionStart, nowMs);
  const eventTime = toIso(payload.timestamp, nowMs);
  const timestamp =
    sessionStart ||
    (wasDown ? eventTime || nowIso : toIso(prev?.timestamp, nowMs) || nowIso);

  const gameName =
    cleanText(payload.gameName, 128) ?? cleanText(payload.scriptName, 128) ?? prev?.gameName ?? 'Unknown Game';

  return {
    username,
    displayName: cleanText(payload.displayName, 64) ?? prev?.displayName ?? username,
    userId: cleanText(payload.userId, 32) ?? prev?.userId ?? '-',
    placeId: cleanText(payload.placeId, 32) ?? prev?.placeId ?? '-',
    jobId: cleanText(payload.jobId, 128) ?? prev?.jobId ?? 'Local/Private',
    gameName,
    scriptName: gameName,
    event: eventName ?? statusHint ?? prev?.event ?? 'Heartbeat',
    status: isOffline ? 'OFFLINE' : 'ONLINE',
    avatarUrl: cleanText(payload.avatarUrl, 512) ?? prev?.avatarUrl ?? '',
    timestamp,
    lastUpdate: nowIso,
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
  };
}
