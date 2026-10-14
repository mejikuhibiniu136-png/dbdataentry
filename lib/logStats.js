// Fungsi murni untuk dashboard (tanpa React / Redis) agar mudah diuji dan dipakai ulang.

export const str = (value) => (typeof value === 'string' ? value : '');

export const isHeartbeat = (log) => {
  const e = log?.payload?.event;
  return e === 'Heartbeat' || e === 'Aktif';
};

export const isAnimeDiceLog = (log) =>
  str(log?.eventType).includes('Anime Dice') ||
  (Array.isArray(log?.payload?.embeds) && log.payload.embeds.length > 0);

// Nama pengguna dari log: dari field `content` (format Discord) atau `username`.
export function userOfLog(log) {
  const p = log?.payload || {};
  return (
    str(p.content).replace(/\|\|/g, '').replace('Username: ', '').trim() || str(p.username) || ''
  );
}

// Label ringkas jenis event untuk tampilan dan statistik.
export function eventLabel(log) {
  const p = log?.payload || {};
  return str(p.event) || str(log?.eventType) || 'Event';
}

// ---------- Rarity ----------

const RARITY_MULTIPLIERS = {
  '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12,
  qd: 1e15, qi: 1e18, sx: 1e21, sp: 1e24, oc: 1e27,
  no: 1e30, dc: 1e33, udc: 1e36, ddc: 1e39, tdc: 1e42,
  qdc: 1e45, qidc: 1e48, sxdc: 1e51, spdc: 1e54, ocdc: 1e57,
  nodc: 1e60, vg: 1e63, googol: 1e100,
};

export function parseRarityChance(chanceStr) {
  if (!chanceStr) return 0;
  const match = chanceStr.match(/1\/([\d.]+)([a-zA-Z]*)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2].toLowerCase().replace('!', '');
  const multiplier = RARITY_MULTIPLIERS[suffix] !== undefined ? RARITY_MULTIPLIERS[suffix] : 1;
  const score = num * multiplier;
  return Number.isFinite(score) ? score : 0;
}

// ---------- Statistik ----------

// Satu log yang formatnya aneh dilewati, tidak merusak yang lain.
export function computeLogStats(logs) {
  let maxFloor = 0;
  let totalUnits = 0;
  let highestRarityText = '-';
  let maxRarityScore = 0;
  let processingSum = 0;
  let processingCount = 0;
  let maxProcessingMs = 0;
  const lootSummary = Object.create(null);
  const userCounts = Object.create(null);
  const eventCounts = Object.create(null);

  logs.forEach((log) => {
    try {
      const p = log.payload || {};
      const desc = str(p.embeds?.[0]?.description);
      const title = str(p.embeds?.[0]?.title);
      const user = userOfLog(log) || 'Unknown';

      const pm = Number(log.processingTimeMs);
      if (Number.isFinite(pm) && pm >= 0) {
        processingSum += pm;
        processingCount += 1;
        if (pm > maxProcessingMs) maxProcessingMs = pm;
      }

      const label = eventLabel(log);
      eventCounts[label] = (eventCounts[label] || 0) + 1;

      if (user !== 'Unknown' && !isHeartbeat(log)) {
        userCounts[user] = (userCounts[user] || 0) + 1;
      }

      const cleanDesc = desc.replace(/\*\*/g, '');
      const floorMatch = cleanDesc.match(/Floor Reached:\s*(\d+)/i);
      if (floorMatch) {
        const floorNum = parseInt(floorMatch[1], 10);
        if (floorNum > maxFloor) maxFloor = floorNum;
      }

      cleanDesc.split('\n').forEach((line) => {
        const match = line.match(/^\s*([A-Za-z0-9\s]+):\s*x?(\d+)/);
        if (match) {
          const itemName = match[1].trim();
          const quantity = parseInt(match[2], 10);
          if (itemName !== 'Floor Reached' && itemName !== 'Name' && itemName !== 'Drops') {
            lootSummary[itemName] = (lootSummary[itemName] || 0) + quantity;
          }
        }
      });

      if (title.includes('New Unit!')) {
        totalUnits += 1;
        const chanceMatch = title.match(/New Unit!\s*(1\/[^\s!]+)/i);
        if (chanceMatch) {
          const rawChance = chanceMatch[1];
          const score = parseRarityChance(rawChance);
          if (score > maxRarityScore) {
            maxRarityScore = score;
            highestRarityText = rawChance;
          }
        }
      }
    } catch (err) {
      console.error('Log dilewati saat menghitung statistik:', err);
    }
  });

  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const topEvents = Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const topLoot = Object.entries(lootSummary)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  const uniqueUsers = Array.from(
    new Set(logs.map((l) => l?.payload?.username).filter((u) => typeof u === 'string' && u))
  ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  return {
    maxFloor,
    totalUnits,
    highestRarityText,
    topLoot,
    topUsers,
    topEvents,
    topUser: topUsers[0]?.name ?? '-',
    maxCount: topUsers[0]?.count ?? 0,
    uniqueUsers,
    animeDiceCount: logs.filter(isAnimeDiceLog).length,
    heartbeatCount: logs.filter(isHeartbeat).length,
    avgProcessingMs: processingCount ? Math.round(processingSum / processingCount) : 0,
    maxProcessingMs,
  };
}

// ---------- Filter ----------

// Teks pencarian per log di-cache supaya mengetik di kolom cari tidak mengulang JSON.stringify.
const searchCache = new WeakMap();
function searchText(log) {
  let text = searchCache.get(log);
  if (text === undefined) {
    let body = '';
    try {
      body = JSON.stringify(log.payload || {});
    } catch {
      body = '';
    }
    text = `${str(log.eventType)} ${body}`.toLowerCase();
    searchCache.set(log, text);
  }
  return text;
}

export const RANGE_OPTIONS = [
  { id: 'ALL', label: 'Semua waktu', ms: 0 },
  { id: '5M', label: '5 menit', ms: 5 * 60 * 1000 },
  { id: '1H', label: '1 jam', ms: 60 * 60 * 1000 },
  { id: '24H', label: '24 jam', ms: 24 * 60 * 60 * 1000 },
];

export function filterLogs(
  logs,
  { search = '', user = 'ALL_USERS', type = 'ALL', hideHeartbeat = false, rangeId = 'ALL', nowMs = Date.now() } = {}
) {
  const q = search.trim().toLowerCase();
  const rangeMs = RANGE_OPTIONS.find((r) => r.id === rangeId)?.ms || 0;
  return logs.filter((log) => {
    const p = log.payload || {};
    if (q && !searchText(log).includes(q)) return false;
    if (user !== 'ALL_USERS' && p.username !== user) return false;
    if (hideHeartbeat && isHeartbeat(log)) return false;
    if (type === 'ANIME_DICE' && !isAnimeDiceLog(log)) return false;
    if (rangeMs) {
      const t = new Date(log.receivedAt).getTime();
      if (!Number.isFinite(t) || nowMs - t > rangeMs) return false;
    }
    return true;
  });
}

// ---------- Aktivitas (grafik) ----------

// Membagi rentang waktu log menjadi `buckets` kolom: heartbeat dan event lain dihitung terpisah.
export function buildActivity(logs, nowMs = Date.now(), buckets = 24) {
  const times = logs
    .map((l) => new Date(l.receivedAt).getTime())
    .filter((t) => Number.isFinite(t) && t <= nowMs + 60000);
  if (times.length === 0) return { buckets: [], spanMs: 0, bucketMs: 0, max: 0 };

  const oldest = Math.min(...times);
  const spanMs = Math.min(Math.max(nowMs - oldest, 5 * 60 * 1000), 24 * 60 * 60 * 1000);
  const bucketMs = Math.ceil(spanMs / buckets);
  const start = nowMs - bucketMs * buckets;

  const out = Array.from({ length: buckets }, (_, i) => ({
    start: start + i * bucketMs,
    heartbeat: 0,
    other: 0,
  }));

  logs.forEach((log) => {
    const t = new Date(log.receivedAt).getTime();
    if (!Number.isFinite(t) || t < start || t > nowMs + bucketMs) return;
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
    if (isHeartbeat(log)) out[idx].heartbeat += 1;
    else out[idx].other += 1;
  });

  const max = out.reduce((m, b) => Math.max(m, b.heartbeat + b.other), 0);
  return { buckets: out, spanMs, bucketMs, max };
}

// Deret latensi (lama -> baru) untuk satu akun, diambil dari log yang sudah dimuat.
export function latencySeries(logs, username, max = 24) {
  const values = [];
  for (const log of logs) {
    if (log?.payload?.username !== username) continue;
    const v = Number(log.processingTimeMs);
    if (Number.isFinite(v) && v >= 0) values.push(v);
    if (values.length >= max) break;
  }
  return values.reverse(); // logs diurutkan terbaru lebih dulu
}

// ---------- Format ----------

export function formatDuration(totalSeconds) {
  const diff = Math.floor(totalSeconds);
  if (!Number.isFinite(diff) || diff <= 0) return '0s';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}j ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function timeAgo(thenMs, nowMs = Date.now()) {
  if (!Number.isFinite(thenMs)) return '-';
  const sec = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (sec < 5) return 'baru saja';
  if (sec < 60) return `${sec} dtk lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  return `${Math.floor(hr / 24)} hari lalu`;
}

export function formatNumber(n) {
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString('id-ID') : '-';
}

// ---------- Ekspor ----------

// Sel CSV diberi tanda kutip dan dinetralkan dari injeksi rumus spreadsheet (=, +, -, @).
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach((row) => lines.push(row.map(csvCell).join(',')));
  return `\uFEFF${lines.join('\r\n')}`; // BOM agar Excel membaca UTF-8
}

export function logsToCsv(logs) {
  return toCsv(
    ['receivedAt', 'eventType', 'username', 'displayName', 'gameName', 'event', 'processingTimeMs', 'payload'],
    logs.map((log) => {
      const p = log.payload || {};
      let payload = '';
      try {
        payload = JSON.stringify(p);
      } catch {
        payload = '';
      }
      return [
        log.receivedAt, log.eventType, p.username, p.displayName, p.gameName, p.event,
        log.processingTimeMs, payload,
      ];
    })
  );
}

export function accountsToCsv(accounts, stateOf) {
  return toCsv(
    ['username', 'displayName', 'state', 'gameName', 'userId', 'placeId', 'jobId', 'event', 'latencyMs', 'sessionStart', 'lastUpdate'],
    accounts.map((a) => [
      a.username, a.displayName, stateOf(a), a.gameName, a.userId, a.placeId, a.jobId,
      a.event, a.latencyMs, a.timestamp, a.lastUpdate,
    ])
  );
}
