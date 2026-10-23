// Logika murni test lab (tanpa DOM, tanpa fetch) supaya bisa diuji di vitest dan dipakai UI yang sama.
// Tidak ada rahasia di sini: hanya aturan pemeriksaan.

export type Verdict = 'pass' | 'warn' | 'fail';
export interface CheckResult { id: string; label: string; verdict: Verdict; detail: string }

// Hanya path same-origin ini yang boleh dikirimi uji. Daftar putih = tidak ada SSRF / request ke host lain.
export const WEBHOOK_ENDPOINTS = ['/api/receiver/universal', '/api/webhook'] as const;
export const CONTENT_TYPES = ['application/json', 'application/x-www-form-urlencoded', 'text/plain'] as const;
export const PROBE_GAME = 'dbd-testlab-probe';
export const MAX_BODY_CHARS = 262_144 + 1024; // sedikit di atas batas server 256 KB agar uji 413 mungkin

export const isAllowedEndpoint = (p: string): p is (typeof WEBHOOK_ENDPOINTS)[number] => (WEBHOOK_ENDPOINTS as readonly string[]).includes(p);
export const isAllowedContentType = (c: string): c is (typeof CONTENT_TYPES)[number] => (CONTENT_TYPES as readonly string[]).includes(c);

export function probeUsername(rand: string = Math.random().toString(36).slice(2, 8)): string {
  return `testlab_${rand.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'x'}`;
}

export interface Preset { id: string; label: string; contentType: (typeof CONTENT_TYPES)[number]; body: string; account?: string }

export function buildPresets(username = probeUsername()): Preset[] {
  const now = new Date().toISOString();
  return [
    { id: 'account', label: 'Account status (Online)', contentType: 'application/json', account: username,
      body: JSON.stringify({ type: 'account_status', username, displayName: 'Test Lab', state: 'ONLINE', event: 'Online', gameName: PROBE_GAME, timestamp: now }, null, 2) },
    { id: 'json', label: 'Generic JSON event', contentType: 'application/json',
      body: JSON.stringify({ game_name: PROBE_GAME, event: 'ping', message: 'hello from test lab', timestamp: now }, null, 2) },
    { id: 'form', label: 'Form (urlencoded)', contentType: 'application/x-www-form-urlencoded', body: `game_name=${PROBE_GAME}&event=ping&source=testlab` },
    { id: 'text', label: 'Plain text', contentType: 'text/plain', body: `${PROBE_GAME} ping ${now}` },
    { id: 'broken', label: 'Malformed JSON', contentType: 'application/json', body: '{"game_name": "' + PROBE_GAME + '", ' },
    { id: 'proto', label: 'Prototype pollution probe', contentType: 'application/json', body: '{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"game_name":"' + PROBE_GAME + '"}' },
  ];
}

// Kerapuhan HTTP -> vonis uji receiver. `expect` = kode yang diharapkan uji itu.
export function judgeStatus(status: number, expect: readonly number[], note = ''): { verdict: Verdict; detail: string } {
  if (expect.includes(status)) return { verdict: 'pass', detail: `HTTP ${status}${note ? ` · ${note}` : ''}` };
  if (status === 401) return { verdict: 'warn', detail: 'HTTP 401 · receiver mewajibkan API Key / token (bukan bug). Isi kolom API Key lalu ulangi.' };
  if (status === 429) return { verdict: 'warn', detail: 'HTTP 429 · kena rate limit; tunggu sebentar lalu ulangi.' };
  if (status === 503) return { verdict: 'warn', detail: 'HTTP 503 · maintenance / Redis tidak tersedia.' };
  if (status >= 500) return { verdict: 'fail', detail: `HTTP ${status} · server error (respons 5xx tidak boleh muncul untuk input biasa).` };
  return { verdict: 'fail', detail: `HTTP ${status} · diharapkan ${expect.join(' / ')}` };
}

// ---------- Pemeriksaan skrip Lua ----------
const SECRET_PATTERNS: [RegExp, string][] = [
  [/ENCRYPTION_KEY|JWT_SECRET|CRON_SECRET|WEBHOOK_INGEST_TOKEN|HWID_PEPPER/, 'nama env rahasia'],
  [/\$argon2[a-z]*\$|\$2[aby]\$\d\d\$/i, 'hash password'],
  [/UPSTASH_REDIS|KV_REST_API/, 'kredensial Redis'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b[0-9a-f]{64}\b/i, 'string hex 64 karakter (mirip kunci 32-byte)'],
];

export interface LuaProbe {
  status: number;
  headers: Record<string, string>;
  source: string;
  origin: string;
  /** Hash SHA-256 dari unduhan kedua (untuk uji token per unduhan). */
  secondHash?: string;
  firstHash?: string;
  maintenanceOk?: boolean;
}

export function analyzeLua(p: LuaProbe): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, label: string, verdict: Verdict, detail: string) => out.push({ id, label, verdict, detail });
  const h = (k: string) => (p.headers[k.toLowerCase()] ?? '').toLowerCase();

  if (p.status === 410) { add('status', 'Skrip publik aktif', 'warn', 'HTTP 410 · SCRIPT_PUBLIC_ENABLED=off (disengaja). Pemeriksaan lain dilewati.'); return out; }
  add('status', 'HTTP 200', p.status === 200 ? 'pass' : p.status === 429 ? 'warn' : 'fail', `HTTP ${p.status}`);
  if (p.status !== 200) return out;

  add('ctype', 'Content-Type text/plain', h('content-type').startsWith('text/plain') ? 'pass' : 'fail', h('content-type') || '(kosong)');
  add('nocache', 'Cache-Control no-store', h('cache-control').includes('no-store') ? 'pass' : 'fail', h('cache-control') || '(kosong)');
  add('nosniff', 'X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff' ? 'pass' : 'fail', h('x-content-type-options') || '(kosong)');
  add('protect', 'Header proteksi', h('x-script-protection') ? 'pass' : 'warn', `X-Script-Protection=${h('x-script-protection') || '-'} · X-Script-Control=${h('x-script-control') || '-'}`);

  const protectedOn = h('x-script-protection') === 'on';
  const endpoint = `${p.origin}/api/receiver/universal`;
  if (protectedOn) add('endpoint', 'Endpoint tersembunyi (obfuscate)', p.source.includes(endpoint) ? 'fail' : 'pass', p.source.includes(endpoint) ? 'URL endpoint terlihat polos padahal proteksi menyala' : 'URL endpoint tidak muncul sebagai teks polos');
  else add('endpoint', 'Endpoint = domain ini', p.source.includes(endpoint) ? 'pass' : 'fail', endpoint);

  const left = [...new Set(p.source.match(/__[A-Z][A-Z0-9_]{3,}__/g) ?? [])];
  add('placeholder', 'Tidak ada placeholder tersisa', left.length ? 'fail' : 'pass', left.length ? left.join(', ') : 'bersih');

  const leaks = SECRET_PATTERNS.filter(([re]) => re.test(p.source)).map(([, name]) => name);
  add('secrets', 'Tidak ada rahasia di skrip', leaks.length ? 'fail' : 'pass', leaks.length ? `terdeteksi: ${leaks.join(', ')}` : 'tidak ada pola rahasia');

  add('size', 'Ukuran wajar (< 1 MB)', p.source.length < 1_048_576 ? 'pass' : 'warn', `${(p.source.length / 1024).toFixed(1)} KB`);
  add('roblox', 'Memakai API Roblox yang dikenal', /game\s*:\s*(GetService|HttpGet)|HttpService|loadstring/.test(p.source) ? 'pass' : 'warn', 'game:GetService / HttpService / loadstring');

  if (p.firstHash && p.secondHash) {
    add('nonce', 'Token / kunci beda tiap unduhan', p.firstHash !== p.secondHash ? 'pass' : 'warn', p.firstHash !== p.secondHash ? 'dua unduhan berbeda (token per salinan)' : 'dua unduhan identik: token per salinan tidak aktif (SCRIPT_PUBLIC_CONTROL=off dan proteksi mati?)');
  }
  if (p.maintenanceOk !== undefined) add('maint', 'GET /api/maintenance publik', p.maintenanceOk ? 'pass' : 'fail', p.maintenanceOk ? 'JSON {maintenance: boolean}' : 'respons tidak sesuai');
  return out;
}

export const summarize = (rs: CheckResult[]) => ({
  pass: rs.filter((r) => r.verdict === 'pass').length,
  warn: rs.filter((r) => r.verdict === 'warn').length,
  fail: rs.filter((r) => r.verdict === 'fail').length,
});

// HMAC-SHA256 hex lewat WebCrypto (browser dan Node 20): untuk menguji header X-Webhook-Signature.
export async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
