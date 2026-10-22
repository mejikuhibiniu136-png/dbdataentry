'use client';
import { AlertTriangle, CheckCircle2, Download, FlaskConical, Loader2, Play, ShieldCheck, Trash2, Webhook, XCircle, FileCode2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { GsapReveal } from '@/components/motion/GsapReveal';
import { WebhookFlow, type FlowHandle, type FlowOutcome } from '@/components/motion/WebhookFlow';
import { Button } from '@/components/ui/Button';
import { Pill, type Tone } from '@/components/ui/Pill';
import { downloadText } from '@/lib/client';
import { slugify } from '@/lib/slug';
import {
  CONTENT_TYPES, MAX_BODY_CHARS, PROBE_GAME, WEBHOOK_ENDPOINTS, analyzeLua, buildPresets, hmacHex, isAllowedContentType,
  isAllowedEndpoint, judgeStatus, probeUsername, sha256Hex, summarize, type CheckResult, type Verdict,
} from '@/lib/testlab';

// Halaman uji (khusus staf). Semua request hanya ke path same-origin dari daftar putih (lib/testlab.ts), tanpa cookie
// (credentials: 'omit') supaya meniru pengirim eksternal. API Key / secret HMAC hanya hidup di memori komponen ini:
// tidak disimpan, tidak dicatat, tidak dikirim ke mana pun selain header request uji.

interface Sent { status: number; ms: number; headers: Record<string, string>; text: string }
const SHOW_HEADERS = ['content-type', 'retry-after', 'x-script-protection', 'x-script-control', 'cache-control', 'x-content-type-options', 'access-control-allow-origin'];
const VERDICT: Record<Verdict, { tone: Tone; Icon: typeof CheckCircle2; label: string }> = {
  pass: { tone: 'ok', Icon: CheckCircle2, label: 'PASS' },
  warn: { tone: 'warn', Icon: AlertTriangle, label: 'WARN' },
  fail: { tone: 'bad', Icon: XCircle, label: 'FAIL' },
};
const outcomeOf = (status: number): FlowOutcome => (status >= 200 && status < 300 ? 'ok' : status >= 500 || status === 0 ? 'error' : 'rejected');

async function sendRaw(opts: { endpoint: string; method?: 'POST' | 'GET' | 'OPTIONS'; contentType?: string; body?: string; apiKey?: string; secret?: string }): Promise<Sent> {
  const { endpoint, method = 'POST', contentType, body, apiKey, secret } = opts;
  if (!isAllowedEndpoint(endpoint)) throw new Error('Endpoint di luar daftar putih');
  if (contentType && !isAllowedContentType(contentType)) throw new Error('Content-Type di luar daftar putih');
  if (body && body.length > MAX_BODY_CHARS) throw new Error('Body terlalu besar untuk uji');
  const headers: Record<string, string> = {};
  if (contentType && method === 'POST') headers['Content-Type'] = contentType;
  if (apiKey) headers['x-api-key'] = apiKey.trim();
  if (secret && method === 'POST') headers['x-webhook-signature'] = `sha256=${await hmacHex(secret, body ?? '')}`;
  const t0 = performance.now();
  try {
    const res = await fetch(endpoint, { method, headers, body: method === 'POST' ? body : undefined, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    const text = await res.text();
    const h: Record<string, string> = {};
    for (const k of SHOW_HEADERS) { const v = res.headers.get(k); if (v) h[k] = v; }
    return { status: res.status, ms: Math.round(performance.now() - t0), headers: h, text };
  } catch (err) {
    return { status: 0, ms: Math.round(performance.now() - t0), headers: {}, text: err instanceof Error ? err.message : 'Network error' };
  }
}

const pretty = (t: string) => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } };

function Results({ rows }: { rows: CheckResult[] }) {
  if (!rows.length) return null;
  const s = summarize(rows);
  return (
    <div className="glass p-4" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone="ok">{s.pass} pass</Pill><Pill tone="warn">{s.warn} warn</Pill><Pill tone={s.fail ? 'bad' : 'neutral'}>{s.fail} fail</Pill>
      </div>
      <ul className="divide-y divide-white/5">
        {rows.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <v.Icon className={`mt-0.5 size-4 flex-none ${r.verdict === 'pass' ? 'text-emerald-300' : r.verdict === 'warn' ? 'text-amber-300' : 'text-rose-300'}`} aria-hidden />
              <div className="min-w-0 flex-1"><div className="text-sm text-slate-100">{r.label}</div><div className="break-words font-mono text-xs text-slate-400">{r.detail}</div></div>
              <Pill tone={v.tone}>{v.label}</Pill>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResponseView({ sent }: { sent: Sent | null }) {
  if (!sent) return null;
  const tone: Tone = sent.status >= 200 && sent.status < 300 ? 'ok' : sent.status >= 500 || sent.status === 0 ? 'bad' : 'warn';
  return (
    <div className="glass space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2"><Pill tone={tone}>{sent.status === 0 ? 'NETWORK ERROR' : `HTTP ${sent.status}`}</Pill><Pill>{sent.ms} ms</Pill></div>
      {Object.keys(sent.headers).length > 0 && <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-slate-300">{Object.entries(sent.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>}
      <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs break-words whitespace-pre-wrap text-cyan-100">{pretty(sent.text) || '(empty body)'}</pre>
    </div>
  );
}

// ---------------- Webhook ----------------
function WebhookTab({ flow }: { flow: React.RefObject<FlowHandle | null> }) {
  const [presets] = useState(() => buildPresets(probeUsername()));
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const [endpoint, setEndpoint] = useState<string>(WEBHOOK_ENDPOINTS[0]);
  const [contentType, setContentType] = useState<string>(preset.contentType);
  const [body, setBody] = useState(preset.body);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [suite, setSuite] = useState<CheckResult[]>([]);
  const [note, setNote] = useState('');

  const pick = (id: string) => { const p = presets.find((x) => x.id === id); if (!p) return; setPresetId(id); setContentType(p.contentType); setBody(p.body); setSent(null); };
  const fire = async (o: Omit<Parameters<typeof sendRaw>[0], 'apiKey' | 'secret'>) => {
    const r = await sendRaw({ ...o, apiKey, secret });
    void flow.current?.run(outcomeOf(r.status));
    return r;
  };

  const sendOne = async () => { setBusy(true); setNote(''); try { setSent(await fire({ endpoint, contentType, body })); } finally { setBusy(false); } };

  // Round-trip: akun uji yang dikirim harus muncul di /api/accounts, lalu dibersihkan (hanya nama berawalan testlab_).
  const roundTrip = async (username: string): Promise<CheckResult> => {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch('/api/accounts', { cache: 'no-store' });
      const data = (await res.json()) as { data?: { username: string }[] };
      const found = data.data?.some((a) => a.username === username) ?? false;
      if (found && username.startsWith('testlab_')) await fetch(`/api/accounts?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
      return found
        ? { id: 'roundtrip', label: 'Round trip: akun muncul di /api/accounts', verdict: 'pass', detail: `${username} terbaca lalu dihapus (bersih)` }
        : { id: 'roundtrip', label: 'Round trip: akun muncul di /api/accounts', verdict: 'warn', detail: 'akun belum terbaca: mode antrean aktif (menunggu drain) atau Receiver OFF' };
    } catch (err) {
      return { id: 'roundtrip', label: 'Round trip: akun muncul di /api/accounts', verdict: 'fail', detail: err instanceof Error ? err.message : 'gagal' };
    }
  };

  const runSuite = async () => {
    setBusy(true); setSuite([]); setNote('');
    const rows: CheckResult[] = [];
    const push = (r: CheckResult) => { rows.push(r); setSuite([...rows]); };
    try {
      const info = await fire({ endpoint, method: 'GET' });
      push({ id: 'info', label: 'GET info endpoint', ...judgeStatus(info.status, [200]) });
      const pre = await fire({ endpoint, method: 'OPTIONS' });
      push({ id: 'cors', label: 'OPTIONS preflight (CORS)', ...judgeStatus(pre.status, [204, 200]) });
      for (const id of ['json', 'form', 'text'] as const) {
        const p = presets.find((x) => x.id === id)!;
        const r = await fire({ endpoint, contentType: p.contentType, body: p.body });
        push({ id: `post-${id}`, label: `POST ${p.label}`, ...judgeStatus(r.status, [200, 202]) });
      }
      const broken = presets.find((x) => x.id === 'broken')!;
      const rb = await fire({ endpoint, contentType: broken.contentType, body: broken.body });
      push({ id: 'broken', label: 'Malformed JSON tidak membuat 5xx', ...judgeStatus(rb.status, [200, 202, 400]) });
      const proto = presets.find((x) => x.id === 'proto')!;
      const rp = await fire({ endpoint, contentType: proto.contentType, body: proto.body });
      push({ id: 'proto', label: 'Prototype pollution ditolak / dinetralkan', ...judgeStatus(rp.status, [200, 202, 400]) });
      const big = await fire({ endpoint, contentType: 'text/plain', body: 'x'.repeat(262_144 + 512) });
      push({ id: 'big', label: 'Payload > 256 KB ditolak', ...judgeStatus(big.status, [413]) });
      if (secret) {
        const bad = await sendRaw({ endpoint, contentType: 'application/json', body: '{"a":1}', apiKey, secret: secret + 'x' });
        push({ id: 'hmac', label: 'HMAC salah ditolak (401) bila secret server aktif', verdict: bad.status === 401 ? 'pass' : 'warn', detail: bad.status === 401 ? 'HTTP 401' : `HTTP ${bad.status} · server belum menyetel Webhook Secret, atau secret yang Anda isi tidak sama` });
      }
      const acct = presets[0];
      const ra = await fire({ endpoint, contentType: acct.contentType, body: acct.body });
      push({ id: 'acct', label: 'POST account_status', ...judgeStatus(ra.status, [200, 202]) });
      if (ra.status === 200 && acct.account) push(await roundTrip(acct.account));
    } finally { setBusy(false); }
  };

  const deleteProbe = async () => {
    setBusy(true);
    try {
      const slug = slugify(PROBE_GAME);
      const res = await fetch(`/api/games/${slug}`, { method: 'DELETE' });
      setNote(res.ok ? `Tabel uji "${slug}" dihapus.` : res.status === 404 ? 'Tabel uji tidak ada (sudah bersih).' : `Gagal menghapus (HTTP ${res.status}).`);
    } finally { setBusy(false); }
  };

  return (
    <GsapReveal className="space-y-4">
      <div data-reveal className="glass space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-400">Endpoint
            <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="field">{WEBHOOK_ENDPOINTS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="space-y-1 text-xs text-slate-400">Preset
            <select value={presetId} onChange={(e) => pick(e.target.value)} className="field">{presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="space-y-1 text-xs text-slate-400">Content-Type
            <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="field">{CONTENT_TYPES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className="block space-y-1 text-xs text-slate-400">Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} rows={8} maxLength={MAX_BODY_CHARS} className="field font-mono text-xs" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-400">API Key (opsional, tidak disimpan)
            <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="field" placeholder="x-api-key" /></label>
          <label className="space-y-1 text-xs text-slate-400">Webhook Secret HMAC (opsional, tidak disimpan)
            <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className="field" placeholder="menandatangani body → x-webhook-signature" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={sendOne} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Send</Button>
          <Button onClick={runSuite} disabled={busy}><ShieldCheck className="size-4" />Run full suite</Button>
          <Button variant="danger" onClick={deleteProbe} disabled={busy}><Trash2 className="size-4" />Delete probe table</Button>
        </div>
        <p className="text-xs text-slate-500">Uji menulis ke tabel “{PROBE_GAME}” dan akun testlab_*. Akun dibersihkan otomatis; tabel dihapus dengan tombol di atas.</p>
        {note && <p role="status" className="text-xs text-cyan-200">{note}</p>}
      </div>
      <div data-reveal><ResponseView sent={sent} /></div>
      <div data-reveal><Results rows={suite} /></div>
    </GsapReveal>
  );
}

// ---------------- Lua ----------------
function LuaTab({ flow }: { flow: React.RefObject<FlowHandle | null> }) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CheckResult[]>([]);
  const [source, setSource] = useState('');
  const [meta, setMeta] = useState('');
  const lines = useMemo(() => source.split('\n'), [source]);

  const get = async () => {
    const t0 = performance.now();
    const res = await fetch('/scripts/account_status.lua', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { status: res.status, headers, text: await res.text(), ms: Math.round(performance.now() - t0) };
  };

  const run = async () => {
    setBusy(true); setRows([]);
    try {
      const a = await get();
      void flow.current?.run(outcomeOf(a.status));
      const b = a.status === 200 ? await get() : null;
      let maintenanceOk = false;
      try { const m = await fetch('/api/maintenance', { cache: 'no-store', credentials: 'omit' }); maintenanceOk = m.ok && typeof (await m.json()).maintenance === 'boolean'; } catch { maintenanceOk = false; }
      setSource(a.status === 200 ? a.text : '');
      setMeta(`${a.status} · ${a.ms} ms · ${(a.text.length / 1024).toFixed(1)} KB`);
      setRows(analyzeLua({
        status: a.status, headers: a.headers, source: a.text, origin: window.location.origin,
        firstHash: await sha256Hex(a.text), secondHash: b ? await sha256Hex(b.text) : undefined, maintenanceOk,
      }));
    } catch (err) {
      setRows([{ id: 'net', label: 'Ambil skrip', verdict: 'fail', detail: err instanceof Error ? err.message : 'gagal' }]);
    } finally { setBusy(false); }
  };

  return (
    <GsapReveal className="space-y-4">
      <div data-reveal className="glass space-y-3 p-4">
        <p className="text-sm text-slate-300">Mengunduh <code className="font-mono text-cyan-200">/scripts/account_status.lua</code> dua kali (seperti executor, tanpa cookie), lalu memeriksa header, rahasia bocor, endpoint, dan token per unduhan. Sintaks Lua diuji di CI (<code className="font-mono text-cyan-200">tests/lua-script.test.ts</code>, memakai <code className="font-mono">luac -p</code>).</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={run} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Fetch &amp; check script</Button>
          {source && <Button onClick={() => downloadText('account_status.lua', source, 'text/x-lua')}><Download className="size-4" />Download .lua</Button>}
          {meta && <Pill>{meta}</Pill>}
        </div>
      </div>
      <div data-reveal><Results rows={rows} /></div>
      {source && (
        <div data-reveal className="glass p-4">
          <div className="mb-2 text-xs text-slate-400">Source ({lines.length} baris, 300 baris pertama; dirender sebagai teks, bukan HTML)</div>
          <pre className="max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-300">{lines.slice(0, 300).map((l, i) => `${String(i + 1).padStart(4, ' ')}  ${l.length > 400 ? `${l.slice(0, 400)}…` : l}`).join('\n')}</pre>
        </div>
      )}
    </GsapReveal>
  );
}

export function TestLab({ username }: { username: string }) {
  const [tab, setTab] = useState<'webhook' | 'lua'>('webhook');
  const flow = useRef<FlowHandle>(null);
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <GsapReveal className="space-y-4">
        <header data-reveal className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><FlaskConical className="size-5" aria-hidden /></span>
            <div><h1 className="text-xl font-semibold text-white">Test Lab</h1><p className="text-xs text-slate-400">Webhook receiver &amp; Lua script · signed in as {username}</p></div>
          </div>
          <a href="/" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]">← Dashboard</a>
        </header>
        <div data-reveal className="glass px-4 py-3"><WebhookFlow ref={flow} className="mx-auto max-w-3xl" /></div>
        <div data-reveal role="tablist" aria-label="Test type" className="flex gap-2">
          {([['webhook', 'Webhook', Webhook], ['lua', 'Lua script', FileCode2]] as const).map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors ${tab === id ? 'border-cyan-300/40 bg-cyan-300/10 text-white' : 'border-white/10 text-slate-400 hover:bg-white/[0.05]'}`}><Icon className="size-4" aria-hidden />{label}</button>
          ))}
        </div>
      </GsapReveal>
      <div role="tabpanel" key={tab}>{tab === 'webhook' ? <WebhookTab flow={flow} /> : <LuaTab flow={flow} />}</div>
    </main>
  );
}
