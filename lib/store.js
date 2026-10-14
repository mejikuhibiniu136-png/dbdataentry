// Operasi data (Redis). `redis` diterima sebagai parameter supaya mudah diuji.

import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_KEY,
  LOG_KEY,
  MAX_STORED_LOGS,
  WEBHOOK_STATUS_KEY,
} from '@/lib/constants';
import { applyOfflineTimeout } from '@/lib/accountStatus';
import { mergeAccount, normalizeUsername } from '@/lib/accounts';
import { isPlainObject, parseStored } from '@/lib/http';

// ---------- Log ----------

export async function readLogs(redis, limit = MAX_STORED_LOGS) {
  const count = Math.min(Math.max(Math.floor(limit) || 1, 1), MAX_STORED_LOGS);
  const raw = await redis.lrange(LOG_KEY, 0, count - 1);
  return (raw || []).map(parseStored).filter(isPlainObject);
}

// ---------- Akun ----------

export async function readAccount(redis, username) {
  const raw = await redis.hget(ACCOUNT_KEY, username);
  const parsed = parseStored(raw);
  return isPlainObject(parsed) ? parsed : null;
}

export async function readAccounts(redis, nowMs = Date.now()) {
  const raw = await redis.hgetall(ACCOUNT_KEY);
  if (!raw) return [];
  return Object.values(raw)
    .map(parseStored)
    .filter(isPlainObject)
    .map((acc) => applyOfflineTimeout(acc, nowMs))
    .sort((a, b) => {
      const x = String(a.username).toLowerCase();
      const y = String(b.username).toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
}

// Menghapus satu akun dari daftar status. Mengembalikan true jika akunnya ada.
export async function deleteAccount(redis, username) {
  const name = normalizeUsername(username);
  if (!name) return false;
  const removed = await redis.hdel(ACCOUNT_KEY, name);
  return Number(removed) > 0;
}

// Update status akun secara langsung (dipakai /api/accounts/status POST).
export async function upsertAccount(redis, payload) {
  const username = normalizeUsername(payload?.username);
  if (!username) return null;
  const existing = await readAccount(redis, username);
  const account = mergeAccount(existing, { ...payload, username }, { latencyMs: 0 });
  await redis.hset(ACCOUNT_KEY, { [username]: JSON.stringify(account) });
  return account;
}

// Mencatat satu event: menyimpan log dan (jika ada username) memperbarui status akun
// dalam satu pipeline. `processingTimeMs` mencakup satu round-trip baca ke database.
export async function recordEvent(redis, { payload, eventType, startedAt }) {
  const username = normalizeUsername(payload?.username);
  const existing = username ? await readAccount(redis, username) : null;

  const nowMs = Date.now();
  const processingTimeMs = Math.max(0, nowMs - startedAt);

  const logData = {
    id: randomUUID(),
    eventType,
    payload,
    processingTimeMs,
    receivedAt: new Date(nowMs).toISOString(),
  };

  const account = username
    ? mergeAccount(existing, payload, { nowMs, latencyMs: processingTimeMs })
    : null;

  const pipeline = redis.pipeline();
  pipeline.lpush(LOG_KEY, JSON.stringify(logData));
  pipeline.ltrim(LOG_KEY, 0, MAX_STORED_LOGS - 1);
  if (account) {
    pipeline.hset(ACCOUNT_KEY, { [username]: JSON.stringify(account) });
  }
  await pipeline.exec();

  return { logData, account };
}

// ---------- Saklar receiver ----------

const STATUS_CACHE_MS = 5000;
let statusCache = { loaded: false, value: true, at: 0 };

export function parseEnabled(raw) {
  if (raw === null || raw === undefined) return true; // default aktif
  if (typeof raw === 'string') {
    return !['false', '0', 'off', ''].includes(raw.trim().toLowerCase());
  }
  if (raw === 0) return false;
  return Boolean(raw);
}

// Dibaca langsung dari Redis (dipakai GET /api/webhook/toggle).
export async function readWebhookEnabled(redis) {
  return parseEnabled(await redis.get(WEBHOOK_STATUS_KEY));
}

// Dibaca dengan cache singkat per instance (dipakai jalur receiver agar hemat command).
export async function isWebhookEnabled(redis, nowMs = Date.now()) {
  if (statusCache.loaded && nowMs - statusCache.at < STATUS_CACHE_MS) {
    return statusCache.value;
  }
  try {
    const value = await readWebhookEnabled(redis);
    statusCache = { loaded: true, value, at: nowMs };
    return value;
  } catch (err) {
    console.error('[webhook] Gagal membaca status receiver:', err);
    return statusCache.loaded ? statusCache.value : true;
  }
}

export async function setWebhookEnabled(redis, enabled) {
  await redis.set(WEBHOOK_STATUS_KEY, enabled);
  statusCache = { loaded: true, value: enabled, at: Date.now() };
}

// Hanya untuk pengujian.
export function __resetStatusCache() {
  statusCache = { loaded: false, value: true, at: 0 };
}
