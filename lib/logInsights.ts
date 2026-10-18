// Analitik UNIVERSAL: tidak mengasumsikan game tertentu. Semua dihitung dari apa yang benar-benar dikirim webhook:
//  - Setiap jenis event (judul embed / event / type / baris pertama content) menjadi satu "kategori" -> satu tabel otomatis.
//  - Pasangan "Kunci: nilai" (field embed Discord, baris deskripsi/content, field JSON datar) menjadi kolom tabel dan metrik angka.
// Event baru dari game baru muncul sebagai tabel baru begitu log pertamanya tiba (fungsi murni, dihitung ulang tiap data live masuk).
import { RARITY, eventLabel, isHeartbeat, str, userOfLog } from '@/lib/logStats';
import type { LogEntry } from '@/types';

export interface Ranked { name: string; count: number }
export interface Fact { key: string; value: string; num?: number }
export interface InsightRow { id: string; at: string; user: string; cells: Record<string, string> }
export interface MetricStat { name: string; max: number; sum: number; avg: number; samples: number }
export interface Category {
  key: string;
  label: string;
  count: number;
  firstAt: string;
  lastAt: string;
  players: Ranked[];
  columns: string[];
  rows: InsightRow[];
}
export interface Insights {
  total: number;
  gameEvents: number;
  systemEvents: number;
  players: Ranked[];
  events: Ranked[];
  metrics: MetricStat[];
  categories: Category[];
  hiddenCategories: number;
}

export const MAX_CATEGORIES = 12;
export const MAX_ROWS = 50;
const MAX_COLUMNS = 4;
const MAX_FACTS_PER_LOG = 30;

// Event siklus hidup skrip status akun: bukan kejadian game, jadi tidak dibuatkan tabel otomatis.
const SYSTEM_EVENTS = new Set(['heartbeat', 'aktif', 'online', 'offline', 'account status', 'account-status', 'account_status']);
const GENERIC_TITLES = new Set(['webhook', 'event', 'message', 'notification', 'log', '']);
// Kunci metadata pengirim/skrip: bukan data game.
const META_KEYS = new Set([
  'type', 'kind', 'event', 'eventtype', 'event_type', 'username', 'displayname', 'avatar_url', 'avatarurl', 'embeds', 'content',
  'state', 'status', 'gamename', 'game_name', 'game', 'userid', 'placeid', 'jobid', 'timestamp', 'sessionstart', 'latencyms',
  'fps', 'pingms', 'memorymb', 'pos', 'health', 'maxhealth', 'inventory', 'control', 'tts', 'flags', 'allowed_mentions',
  'thread_name', 'footer', 'author', 'color', 'url', 'image', 'thumbnail', 'name', 'drops',
]);
const PLAYER_KEYS = new Set(['username', 'user', 'player', 'playername', 'pemain']);

const clean = (s: string) => s.replace(/\*\*|__|\|\||`/g, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).toLowerCase();

/** Angka ringkas: "12", "x3", "1,200", "1.5M", "2qd". null bila bukan murni angka. */
export function parseCompactNumber(value: string): number | null {
  const m = clean(value).match(/^x?\s*(-?\d[\d,]*\.?\d*)\s*([a-z]{1,6})?$/i);
  if (!m) return null;
  const base = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = (m[2] ?? '').toLowerCase();
  const mult = suffix ? RARITY[suffix] : 1;
  if (mult === undefined) return null;
  const n = base * mult;
  return Number.isFinite(n) ? n : null;
}

function pushFact(out: Fact[], rawKey: string, rawValue: unknown) {
  if (out.length >= MAX_FACTS_PER_LOG) return;
  const key = clean(rawKey).replace(/[:：]+$/, '').slice(0, 40);
  const value = clean(typeof rawValue === 'string' ? rawValue : typeof rawValue === 'number' || typeof rawValue === 'boolean' ? String(rawValue) : '').slice(0, 120);
  if (!key || !value || key.length < 2) return;
  const num = parseCompactNumber(value);
  out.push(num === null ? { key, value } : { key, value, num });
}

const LINE = /^\s*[*•\-–]?\s*([^:：\n]{2,40}?)\s*[:：]\s*(\S.*)$/;
function factsFromText(out: Fact[], text: string) {
  for (const line of text.split('\n')) {
    const m = clean(line).match(LINE);
    if (m) pushFact(out, m[1], m[2]);
  }
}

/** Semua pasangan kunci-nilai yang bisa digali dari satu payload webhook. */
export function extractFacts(payload: Record<string, unknown> | undefined | null): Fact[] {
  const out: Fact[] = [];
  const p = payload ?? {};
  const embeds = Array.isArray(p.embeds) ? p.embeds : [];
  for (const e of embeds.slice(0, 3)) {
    if (!e || typeof e !== 'object') continue;
    const emb = e as Record<string, unknown>;
    if (Array.isArray(emb.fields)) {
      for (const f of emb.fields.slice(0, 12)) {
        if (f && typeof f === 'object') pushFact(out, str((f as Record<string, unknown>).name), (f as Record<string, unknown>).value);
      }
    }
    if (typeof emb.description === 'string') factsFromText(out, emb.description);
  }
  if (typeof p.content === 'string') factsFromText(out, p.content);
  for (const [k, v] of Object.entries(p)) {
    if (META_KEYS.has(k.toLowerCase())) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (!META_KEYS.has(k2.toLowerCase())) pushFact(out, `${k} ${k2}`, v2);
      }
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') pushFact(out, k, v);
  }
  return out;
}

// Buang bagian yang berubah-ubah (peluang "1/50k", angka, id) supaya event sejenis jatuh ke kategori yang sama.
function stabilize(title: string): string {
  return clean(title)
    .replace(/\b1\s*\/\s*[\d.,]+\s*[a-z]*!?/gi, ' ')
    .replace(/\(?\bx?\d[\d,.]*\s*[a-z]{0,3}\b\)?/gi, ' ')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.\-–|]+|[\s:;,|\-–]+$/g, '')
    .slice(0, 48)
    .trim();
}

function titleOf(log: LogEntry): string {
  const p = (log.payload ?? {}) as Record<string, unknown>;
  const first = Array.isArray(p.embeds) && p.embeds[0] && typeof p.embeds[0] === 'object' ? (p.embeds[0] as Record<string, unknown>) : null;
  const candidates = [str(first?.title), str(p.event), str(log.eventType)];
  for (const c of candidates) {
    const s = stabilize(c);
    if (s && !GENERIC_TITLES.has(s.toLowerCase())) return s;
  }
  const text = clean(str(p.content) || str(first?.description) || str(p.message) || str(p.text));
  if (text) {
    const head = text.split('\n')[0];
    const colon = head.search(/[:：]/);
    const s = stabilize(colon > 2 ? head.slice(0, colon) : head.split(' ').slice(0, 5).join(' '));
    if (s) return s;
  }
  return stabilize(str(log.eventType)) || 'Webhook';
}

export const isSystemEvent = (log: LogEntry): boolean => isHeartbeat(log) || SYSTEM_EVENTS.has(norm(eventLabel(log))) || SYSTEM_EVENTS.has(norm(titleOf(log)));

const top = (map: Map<string, number>, n?: number): Ranked[] => {
  const rows = [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return n ? rows.slice(0, n) : rows;
};
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const ts = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };

export function computeInsights(logs: LogEntry[]): Insights {
  const players = new Map<string, number>();
  const events = new Map<string, number>();
  const metricAcc = new Map<string, { max: number; sum: number; n: number }>();
  const cats = new Map<string, { label: string; logs: { log: LogEntry; facts: Fact[]; user: string }[]; players: Map<string, number> }>();
  let systemEvents = 0;

  for (const log of logs) {
    try {
      const user = userOfLog(log);
      bump(events, eventLabel(log));
      if (isSystemEvent(log)) { systemEvents += 1; continue; }
      if (user) bump(players, user);
      const facts = extractFacts(log.payload);
      for (const f of facts) {
        if (f.num === undefined || PLAYER_KEYS.has(f.key.toLowerCase())) continue;
        const acc = metricAcc.get(f.key) ?? { max: -Infinity, sum: 0, n: 0 };
        acc.max = Math.max(acc.max, f.num); acc.sum += f.num; acc.n += 1;
        metricAcc.set(f.key, acc);
      }
      const label = titleOf(log);
      const key = label.toLowerCase();
      const cat = cats.get(key) ?? { label, logs: [], players: new Map<string, number>() };
      cat.logs.push({ log, facts, user });
      if (user) bump(cat.players, user);
      cats.set(key, cat);
    } catch (err) {
      console.error('Log dilewati saat menghitung insight:', err);
    }
  }

  const ordered = [...cats.entries()].sort((a, b) => b[1].logs.length - a[1].logs.length || a[1].label.localeCompare(b[1].label));
  const categories: Category[] = ordered.slice(0, MAX_CATEGORIES).map(([key, cat]) => {
    const presence = new Map<string, number>();
    for (const { facts } of cat.logs) for (const k of new Set(facts.map((f) => f.key))) bump(presence, k);
    const columns = [...presence.entries()]
      .filter(([k, n]) => !PLAYER_KEYS.has(k.toLowerCase()) && n / cat.logs.length >= 0.4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_COLUMNS)
      .map(([k]) => k);
    const times = cat.logs.map((l) => ts(l.log.receivedAt));
    const rows: InsightRow[] = cat.logs.slice(0, MAX_ROWS).map(({ log, facts, user }) => {
      const cells: Record<string, string> = {};
      for (const c of columns) cells[c] = facts.find((f) => f.key === c)?.value ?? '';
      return { id: log.id, at: log.receivedAt, user, cells };
    });
    return {
      key, label: cat.label, count: cat.logs.length,
      firstAt: new Date(Math.min(...times)).toISOString(), lastAt: new Date(Math.max(...times)).toISOString(),
      players: top(cat.players, 3), columns, rows,
    };
  });

  const metrics: MetricStat[] = [...metricAcc.entries()]
    .map(([name, a]) => ({ name, max: a.max, sum: a.sum, avg: a.sum / a.n, samples: a.n }))
    .sort((a, b) => b.samples - a.samples || b.max - a.max || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    total: logs.length,
    gameEvents: logs.length - systemEvents,
    systemEvents,
    players: top(players, 8),
    events: top(events, 8),
    metrics,
    categories,
    hiddenCategories: Math.max(0, ordered.length - MAX_CATEGORIES),
  };
}

export function formatMetric(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1e6) return n.toExponential(2).replace('e+', 'e');
  return n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
