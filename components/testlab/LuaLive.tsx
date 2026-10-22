'use client';
import { Loader2, Play, Square, Keyboard, FlaskConical } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GsapReveal } from '@/components/motion/GsapReveal';
import type { FlowHandle, FlowOutcome } from '@/components/motion/WebhookFlow';
import { Button } from '@/components/ui/Button';
import { Pill, type Tone } from '@/components/ui/Pill';
import type { Stage } from '@/lib/lualab/stage';
import type { HttpReq, HttpRes, LuaRuntime } from '@/lib/lualab/runtime';
import { probeUsername, summarize, type CheckResult } from '@/lib/testlab';

// Menjalankan skrip Lua ASLI (yang disajikan /scripts/account_status.lua) di VM Lua dalam browser (Fengari) dengan
// shim Roblox. UI panel digambar langsung dari pohon Instance; tombol, geser header, dan RightCtrl bekerja.
//  - Dry-run : permintaan jaringan dicegat dan dijawab simulasi (tidak ada yang menyentuh server). Bisa dipercepat.
//  - Live    : permintaan benar-benar dikirim, tapi hanya ke path daftar putih di origin ini, tanpa cookie.

interface Net { t: string; method: string; path: string; status: number; ms: number; note: string }
interface Sim { maintenance: boolean; fail: boolean; latency: number }
const outcomeOf = (s: number): FlowOutcome => (s >= 200 && s < 300 ? 'ok' : s >= 500 || s === 0 ? 'error' : 'rejected');
const MAINT_TEXT = 'Sedang perawatan uji';
const MAX_ROWS = 200;

export function LuaLive({ flow }: { flow: React.RefObject<FlowHandle | null> }) {
  const stageHost = useRef<HTMLDivElement>(null);
  const rt = useRef<LuaRuntime | null>(null);
  const stage = useRef<Stage | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clock = useRef({ t0: 0, speed: 1 });
  const sim = useRef<Sim>({ maintenance: false, fail: false, latency: 80 });
  const live = useRef(false);
  const user = useRef('');
  const posts = useRef<{ json: Record<string, unknown> | null; status: number }[]>([]);

  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'dry' | 'live'>('dry');
  const [speed, setSpeed] = useState(1);
  const [simUi, setSimUi] = useState<Sim>(sim.current);
  const [logs, setLogs] = useState<string[]>([]);
  const [net, setNet] = useState<Net[]>([]);
  const [meta, setMeta] = useState('');
  const [nodes, setNodes] = useState(0);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const logBuf = useRef<string[]>([]);
  const netBuf = useRef<Net[]>([]);

  // Log dan jaringan ditampung di ref lalu disiram ke state tiap 250 ms (skrip bisa berisik).
  useEffect(() => {
    const id = setInterval(() => {
      if (logBuf.current.length) { const add = logBuf.current.splice(0); setLogs((l) => [...l, ...add].slice(-MAX_ROWS)); }
      if (netBuf.current.length) { const add = netBuf.current.splice(0); setNet((n) => [...add.reverse(), ...n].slice(0, MAX_ROWS)); }
      setNodes(stage.current?.nodeCount() ?? 0);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const log = useCallback((level: string, msg: string) => { logBuf.current.push(`${level === 'info' ? '·' : level === 'warn' ? '!' : '✖'} ${msg}`); }, []);
  const vnow = () => (performance.now() - clock.current.t0) * clock.current.speed;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // Menunggu kondisi sampai `maxVirtualMs` (jam virtual) lewat; kembali true bila terpenuhi.
  const until = async (cond: () => boolean, maxVirtualMs: number) => {
    const end = vnow() + maxVirtualMs;
    while (vnow() < end) { if (cond()) return true; await wait(100); }
    return cond();
  };

  const http = useCallback(async (req: HttpReq): Promise<HttpRes> => {
    const { checkRequest } = await import('@/lib/lualab/runtime');
    const started = performance.now();
    const path = (() => { try { return new URL(req.url).pathname; } catch { return req.url.slice(0, 40); } })();
    let json: Record<string, unknown> | null = null;
    try { json = req.body ? JSON.parse(req.body) : null; } catch { json = null; }
    const token = req.headers['x-wm'];
    const note = (res: HttpRes) => {
      const bits: string[] = [];
      if (json?.event) bits.push(`${String(json.event)} / ${String(json.state ?? '')}`);
      if (token) bits.push(`x-wm ${token.slice(0, 8)}…`);
      if (res.status === 0) bits.push('diblokir/gagal');
      return bits.join(' · ');
    };
    const done = (res: HttpRes, ms: number) => {
      netBuf.current.push({ t: new Date().toLocaleTimeString(), method: req.method, path, status: res.status, ms, note: note(res) });
      if (req.method === 'POST' && path === '/api/receiver/universal') { posts.current.push({ json, status: res.status }); void flow.current?.run(outcomeOf(res.status)); }
      return res;
    };

    if (live.current) {
      const chk = checkRequest(req, window.location.origin);
      if (!chk.ok) { log('warn', `Permintaan diblokir sandbox: ${chk.reason}`); return done({ status: 0, body: '' }, 0); }
      try {
        const r = await fetch(chk.url, { method: req.method, headers: chk.headers, body: req.method === 'GET' ? undefined : req.body, credentials: 'omit', cache: 'no-store', redirect: 'error' });
        return done({ status: r.status, body: await r.text() }, Math.round(performance.now() - started));
      } catch { return done({ status: 0, body: '' }, Math.round(performance.now() - started)); }
    }

    // Dry-run: jawaban simulasi, tidak ada request keluar.
    await wait(sim.current.latency / clock.current.speed);
    const s = sim.current;
    let res: HttpRes;
    if (path === '/api/maintenance') res = { status: 200, body: JSON.stringify({ maintenance: s.maintenance, message: MAINT_TEXT }) };
    else if (path === '/api/receiver/control') res = { status: 200, body: JSON.stringify({ success: true, data: null }) };
    else if (s.maintenance) res = { status: 503, body: JSON.stringify({ success: false, maintenance: true, message: MAINT_TEXT }) };
    else if (s.fail) res = { status: 500, body: '{"success":false}' };
    else res = { status: 200, body: JSON.stringify({ success: true, stored: true }) };
    return done(res, Math.round(sim.current.latency));
  }, [flow, log]);

  const cleanupLive = async () => {
    if (!live.current || !user.current.startsWith('testlab_')) return;
    try { await fetch(`/api/accounts?username=${encodeURIComponent(user.current)}`, { method: 'DELETE' }); log('info', `Akun uji ${user.current} dihapus dari tracker.`); } catch { /* best effort */ }
  };

  const stop = useCallback(async () => {
    const r = rt.current;
    if (!r) return;
    setBusy(true);
    r.close(); // game:BindToClose + PlayerRemoving -> skrip mengirim Offline
    await wait(1800 / clock.current.speed + 400);
    if (live.current) await wait(600);
    r.dispose();
    rt.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    await cleanupLive();
    stage.current?.destroyAll();
    stage.current = null;
    setRunning(false);
    setBusy(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rt.current?.dispose();
    stage.current?.destroyAll();
  }, []);

  const start = useCallback(async (opts?: { mode?: 'dry' | 'live'; speed?: number }) => {
    if (rt.current || !stageHost.current) return false;
    setBusy(true); setLogs([]); setNet([]); setChecks([]); setMeta('');
    logBuf.current = []; netBuf.current = []; posts.current = [];
    const m = opts?.mode ?? mode;
    live.current = m === 'live';
    clock.current = { t0: performance.now(), speed: live.current ? 1 : (opts?.speed ?? speed) };
    try {
      const res = await fetch('/scripts/account_status.lua', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (res.status !== 200) { log('error', `Skrip tidak tersedia (HTTP ${res.status})`); setBusy(false); return false; }
      const source = await res.text();
      setMeta(`${(source.length / 1024).toFixed(1)} KB · proteksi ${res.headers.get('x-script-protection') ?? '?'} · kontrol ${res.headers.get('x-script-control') ?? '?'}`);
      const [{ LuaRuntime }, { Stage }] = await Promise.all([import('@/lib/lualab/runtime'), import('@/lib/lualab/stage')]);
      user.current = probeUsername();
      const stg = new Stage(stageHost.current, (id, ev, kind, x, y) => rt.current?.fire(id, ev, kind, x, y));
      stage.current = stg;
      const t0 = clock.current.t0;
      const base = Date.now();
      const runtime = new LuaRuntime({
        render: (op) => stg.apply(op),
        log, http,
        now: () => (performance.now() - t0) * clock.current.speed,
        epoch: () => base + (performance.now() - t0) * clock.current.speed,
      }, { userName: user.current, displayName: 'Test Lab', userId: String(100_000_000 + Math.floor(Math.random() * 899_999_999)), placeId: '9999999', jobId: crypto.randomUUID(), gameName: 'Test Lab Place' });
      rt.current = runtime;
      setRunning(true);
      log('info', `Memulai skrip sebagai ${user.current} (${live.current ? 'LIVE' : 'dry-run'}, ${clock.current.speed}×)…`);
      if (!runtime.start(source)) { log('error', 'Skrip gagal dimulai'); }
      timer.current = setInterval(() => runtime.tick(0.033), 33);
      setBusy(false);
      return true;
    } catch (err) {
      log('error', err instanceof Error ? err.message : 'gagal memulai');
      setBusy(false);
      return false;
    }
  }, [http, log, mode, speed]);

  const setSimField = <K extends keyof Sim>(k: K, v: Sim[K]) => { sim.current = { ...sim.current, [k]: v }; setSimUi(sim.current); };

  // ----- Self-test fungsional (dry-run, dipercepat): menekan tombol panel sungguhan dan memeriksa efeknya -----
  const selfTest = async () => {
    if (rt.current) await stop();
    setChecks([]);
    const rows: CheckResult[] = [];
    const push = (id: string, label: string, ok: boolean, detail: string, warn = false) => { rows.push({ id, label, verdict: ok ? 'pass' : warn ? 'warn' : 'fail', detail }); setChecks([...rows]); };
    sim.current = { maintenance: false, fail: false, latency: 60 }; setSimUi(sim.current);
    if (!(await start({ mode: 'dry', speed: 5 }))) { push('start', 'Skrip dimulai', false, 'lihat console'); return; }
    setBusy(true);
    const acct = () => posts.current.filter((p) => p.json?.type === 'account_status');
    try {
      const first = await until(() => acct().length >= 1, 15_000);
      const p0 = acct()[0]?.json ?? {};
      push('online', 'Payload pertama: account_status / ONLINE / Online', first && p0.state === 'ONLINE' && p0.event === 'Online' && p0.username === user.current, first ? `username=${String(p0.username)} state=${String(p0.state)} event=${String(p0.event)}` : 'tidak ada pengiriman dalam 15 dtk (virtual)');
      push('fields', 'Field wajib ada (userId, placeId, jobId, timestamp)', ['userId', 'placeId', 'jobId', 'timestamp', 'sessionStart'].every((k) => p0[k] !== undefined), Object.keys(p0).join(', ') || '-');
      await wait(600);
      const st = stage.current;
      push('ui', 'Panel UI tampil (tombol Jeda terlihat)', !!st?.hasVisibleText('Jeda'), `${st?.nodeCount() ?? 0} instance dirender`);
      push('hb', 'Heartbeat berikutnya terkirim', await until(() => acct().some((p) => p.json?.event === 'Heartbeat'), 15_000), 'event Heartbeat');

      // Jeda
      const clickedPause = !!st?.clickText('Jeda');
      await wait(400);
      const pausedAt = acct().length;
      await wait((14_000 / clock.current.speed));
      push('pause', 'Tombol Jeda menghentikan pengiriman', clickedPause && st?.hasVisibleText('Lanjut') === true && acct().length === pausedAt, clickedPause ? `kiriman tetap ${pausedAt} selama jeda` : 'tombol Jeda tidak ditemukan');
      st?.clickText('Lanjut');
      push('resume', 'Tombol Lanjut melanjutkan pengiriman', await until(() => acct().length > pausedAt, 16_000), `${acct().length} kiriman`);

      // Maintenance dari server
      setSimField('maintenance', true);
      const showed = await until(() => stage.current?.hasVisibleText(MAINT_TEXT) === true, 20_000);
      push('maint-on', 'Maintenance: kartu teks server tampil di panel', showed, showed ? `"${MAINT_TEXT}"` : 'teks maintenance tidak muncul dalam 20 dtk (virtual)');
      const frozen = acct().length;
      await wait(9_000 / clock.current.speed);
      push('maint-hold', 'Maintenance: data tidak dikirim', acct().length === frozen, `kiriman tetap ${frozen}`);
      setSimField('maintenance', false);
      push('maint-off', 'Maintenance selesai: kartu hilang dan kirim lanjut', await until(() => stage.current?.hasVisibleText(MAINT_TEXT) !== true && acct().length > frozen, 20_000), 'pulih otomatis');

      // RightCtrl
      const before = stage.current?.hasVisibleText('Jeda') ?? false;
      rt.current?.fire(0, 'Key', 'RightControl');
      await wait(300);
      const hidden = stage.current?.hasVisibleText('Jeda') === false;
      rt.current?.fire(0, 'Key', 'RightControl');
      await wait(300);
      push('hotkey', 'RightCtrl menyembunyikan / menampilkan panel', before && hidden && stage.current?.hasVisibleText('Jeda') === true, 'ScreenGui.Enabled toggle', true);
    } finally {
      await stop();
      push('offline', 'Saat ditutup: Offline terkirim', acct().some((p) => p.json?.state === 'OFFLINE'), 'BindToClose / PlayerRemoving');
    }
  };

  const s = summarize(checks);
  const tone = (st: number): Tone => (st >= 200 && st < 300 ? 'ok' : st === 0 || st >= 500 ? 'bad' : 'warn');

  return (
    <GsapReveal className="space-y-4">
      <div data-reveal className="glass space-y-3 p-4">
        <p className="text-sm text-slate-300">Menjalankan <code className="font-mono text-cyan-200">/scripts/account_status.lua</code> yang sebenarnya di VM Lua dalam browser dengan shim Roblox. Panel digambar dari pohon Instance asli; klik tombol, geser header, dan tekan RightCtrl. Rute gambar Roblox (avatar) diganti placeholder.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Network mode" className="inline-flex overflow-hidden rounded-xl border border-white/10 text-sm">
            {(['dry', 'live'] as const).map((m) => (
              <button key={m} disabled={running || busy} onClick={() => { setMode(m); if (m === 'live') setSpeed(1); }} aria-pressed={mode === m} className={`px-3 py-1.5 ${mode === m ? 'bg-cyan-300/15 text-white' : 'text-slate-400 hover:bg-white/[0.05]'} disabled:opacity-60`}>{m === 'dry' ? 'Dry-run (simulasi)' : 'Live (kirim ke server)'}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">Kecepatan
            <select disabled={running || busy || mode === 'live'} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="field !min-h-8 !w-auto !py-1">{[1, 2, 5, 10].map((v) => <option key={v} value={v}>{v}×</option>)}</select></label>
          {!running ? <Button variant="primary" onClick={() => void start()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Start script</Button>
            : <Button variant="danger" onClick={() => void stop()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}Stop (kirim Offline)</Button>}
          <Button onClick={() => void selfTest()} disabled={busy}><FlaskConical className="size-4" />Run self-test (dry-run 5×)</Button>
          <Button onClick={() => rt.current?.fire(0, 'Key', 'RightControl')} disabled={!running}><Keyboard className="size-4" />RightCtrl</Button>
          {meta && <Pill>{meta}</Pill>}
          <Pill>{nodes} instance</Pill>
        </div>
        {mode === 'live' && <p className="text-xs text-amber-300">Live mengirim telemetri uji ke receiver Anda sebagai akun testlab_*; akun dihapus saat Stop. Hanya /api/receiver/universal, /api/maintenance, /api/receiver/control di origin ini yang boleh dipanggil skrip.</p>}
        {mode === 'dry' && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <span className="text-slate-500">Simulasi server:</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={simUi.maintenance} onChange={(e) => setSimField('maintenance', e.target.checked)} />Maintenance ON</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={simUi.fail} onChange={(e) => setSimField('fail', e.target.checked)} />Error 500</label>
            <label className="flex items-center gap-1.5">Latensi
              <select value={simUi.latency} onChange={(e) => setSimField('latency', Number(e.target.value))} className="field !min-h-7 !w-auto !py-0.5">{[40, 80, 250, 700].map((v) => <option key={v} value={v}>{v} ms</option>)}</select></label>
          </div>
        )}
      </div>

      <div data-reveal className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="glass p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400"><span>Roblox screen (960×540)</span><span>{running ? 'running' : 'stopped'}</span></div>
          <div ref={stageHost} aria-label="Roblox screen preview" className="aspect-video w-full rounded-xl border border-white/10" style={{ background: 'linear-gradient(160deg, #1b2b4a 0%, #0e1a2e 55%, #15211a 100%)' }} />
        </div>
        <div className="space-y-4">
          <div className="glass p-3">
            <div className="mb-2 text-xs text-slate-400">Network ({net.length})</div>
            <ul className="max-h-48 space-y-1 overflow-auto font-mono text-[11px]">
              {net.length === 0 && <li className="text-slate-500">belum ada permintaan</li>}
              {net.map((n, i) => <li key={`${n.t}-${i}`} className="flex items-start gap-2"><Pill tone={tone(n.status)}>{n.status || 'ERR'}</Pill><span className="min-w-0 break-all text-slate-300">{n.method} {n.path} · {n.ms} ms{n.note ? ` · ${n.note}` : ''}</span></li>)}
            </ul>
          </div>
          <div className="glass p-3">
            <div className="mb-2 text-xs text-slate-400">Console ({logs.length})</div>
            <pre className="max-h-40 overflow-auto font-mono text-[11px] break-words whitespace-pre-wrap text-slate-300">{logs.length ? logs.join('\n') : 'kosong'}</pre>
          </div>
        </div>
      </div>

      {checks.length > 0 && (
        <div data-reveal className="glass p-4" aria-live="polite">
          <div className="mb-3 flex flex-wrap items-center gap-2"><Pill tone="ok">{s.pass} pass</Pill><Pill tone="warn">{s.warn} warn</Pill><Pill tone={s.fail ? 'bad' : 'neutral'}>{s.fail} fail</Pill></div>
          <ul className="divide-y divide-white/5">
            {checks.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2"><div className="min-w-0 flex-1"><div className="text-sm text-slate-100">{r.label}</div><div className="break-words font-mono text-xs text-slate-400">{r.detail}</div></div><Pill tone={r.verdict === 'pass' ? 'ok' : r.verdict === 'warn' ? 'warn' : 'bad'}>{r.verdict.toUpperCase()}</Pill></li>
            ))}
          </ul>
        </div>
      )}
    </GsapReveal>
  );
}
