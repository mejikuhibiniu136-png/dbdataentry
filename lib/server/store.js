// Operasi data (Redis). `redis` diterima sebagai parameter supaya mudah diuji.

import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_KEY,
  LOG_KEY,
  MAX_QUARANTINE,
  MAX_STORED_LOGS,
  QUARANTINE_KEY,
  WEBHOOK_STATUS_KEY,
} from '@/lib/domain/constants';
import { applyOfflineTimeout } from '@/lib/domain/accountStatus';
import { mergeAccount, normalizeUsername } from '@/lib/domain/accounts';
import { isPlainObject, parseStored } from '@/lib/server/http';

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

// ---------- Penulisan atomik ----------
//
// Masalah lama: baca akun -> hitung -> tulis (read-modify-write) tanpa kunci. Dua request
// serentak untuk akun yang sama membuat salah satunya menimpa yang lain (lost update), dan
// log + akun ditulis lewat pipeline yang tidak atomik.
//
// Perbaikan: compare-and-set (optimistic lock) memakai satu EVAL Redis. Script berjalan
// atomik di server Redis: ia menulis hanya jika `rev` akun masih sama dengan yang dibaca
// tadi, dan menulis akun + log dalam satu langkah. Jika kalah balapan, JS membaca ulang,
// menghitung ulang, dan mencoba lagi. Percobaan terakhir menulis tanpa syarat supaya data
// tidak pernah dibuang.

const CAS_SCRIPT = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
local rev = -1
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  rev = (ok and type(obj) == 'table' and tonumber(obj.rev)) or 0
end
if ARGV[2] ~= '-2' and rev ~= tonumber(ARGV[2]) then
  return 0
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
if ARGV[4] ~= '' then
  redis.call('LPUSH', KEYS[2], ARGV[4])
  redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[5]) - 1)
end
return 1
`;

export const MAX_CAS_RETRIES = 6;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `build(existing)` mengembalikan { account, logData | null }. Dipanggil ulang pada setiap percobaan.
export async function casWriteAccount(redis, username, build) {
  for (let attempt = 0; attempt <= MAX_CAS_RETRIES; attempt += 1) {
    const existing = await readAccount(redis, username);
    const expectedRev = existing ? Number(existing.rev) || 0 : -1;
    const { account, logData } = build(existing);
    const force = attempt === MAX_CAS_RETRIES;

    const result = await redis.eval(
      CAS_SCRIPT,
      [ACCOUNT_KEY, LOG_KEY],
      [
        username,
        force ? '-2' : String(expectedRev),
        JSON.stringify(account),
        logData ? JSON.stringify(logData) : '',
        String(MAX_STORED_LOGS),
      ]
    );
    if (Number(result) === 1) return { account, logData, attempts: attempt + 1 };

    await sleep(5 + Math.random() * 25 * (attempt + 1)); // backoff + jitter
  }
  throw new Error('casWriteAccount: tidak mungkin tercapai');
}

// Menambah satu log (tanpa akun) secara transaksional: push + trim tidak bisa terpisah.
export async function pushLog(redis, logData) {
  const tx = redis.multi();
  tx.lpush(LOG_KEY, JSON.stringify(logData));
  tx.ltrim(LOG_KEY, 0, MAX_STORED_LOGS - 1);
  await tx.exec();
}

// Payload yang tidak bisa diproses disimpan mentah (dipotong) agar bisa diperiksa nanti,
// tanpa membuat pengirim menerima error.
export async function quarantinePayload(redis, { reason, raw, ip }) {
  const entry = {
    id: randomUUID(),
    reason: String(reason).slice(0, 200),
    raw: String(raw ?? '').slice(0, 4096),
    ip: ip || 'unknown',
    receivedAt: new Date().toISOString(),
  };
  const tx = redis.multi();
  tx.lpush(QUARANTINE_KEY, JSON.stringify(entry));
  tx.ltrim(QUARANTINE_KEY, 0, MAX_QUARANTINE - 1);
  await tx.exec();
  return entry;
}

// Update status akun tanpa log (dipakai POST /api/accounts/status).
export async function upsertAccount(redis, payload) {
  const username = normalizeUsername(payload?.username);
  if (!username) return null;
  const { account } = await casWriteAccount(redis, username, (existing) => ({
    account: mergeAccount(existing, { ...payload, username }, { latencyMs: 0 }),
    logData: null,
  }));
  return account;
}

// Mencatat satu event: log dan (jika ada username) status akun ditulis atomik.
// `processingTimeMs` = waktu dari request diterima sampai tepat sebelum penulisan.
export async function recordEvent(redis, { payload, eventType, startedAt }) {
  const username = normalizeUsername(payload?.username);

  const makeLog = (nowMs) => ({
    id: randomUUID(),
    eventType,
    payload,
    processingTimeMs: Math.max(0, nowMs - startedAt),
    receivedAt: new Date(nowMs).toISOString(),
  });

  if (!username) {
    const logData = makeLog(Date.now());
    await pushLog(redis, logData);
    return { logData, account: null };
  }

  const { account, logData } = await casWriteAccount(redis, username, (existing) => {
    const nowMs = Date.now();
    const log = makeLog(nowMs);
    return {
      account: mergeAccount(existing, payload, { nowMs, latencyMs: log.processingTimeMs }),
      logData: log,
    };
  });
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
