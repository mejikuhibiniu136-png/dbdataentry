// Menjalankan skrip Lua ASLI (yang disajikan route) di VM Fengari + shim Roblox dengan jam virtual:
// UI terbentuk, telemetri terkirim, tombol Pause bekerja, maintenance mengganti tampilan, Offline dikirim saat ditutup.
import { describe, expect, it, vi } from 'vitest';
import { LuaRuntime, checkRequest, type HttpReq, type RenderOp } from '@/lib/lualab/runtime';

process.env.ENCRYPTION_KEY = 'a1'.repeat(32);
let flag: unknown = 'false';
vi.mock('@/lib/redis', () => ({ getRedis: () => ({ hget: async () => flag }) }));
const { GET } = await import('@/app/scripts/account_status.lua/route');
const serve = async (on: boolean) => {
  flag = on ? 'true' : 'false';
  return (await GET(new Request('https://dash.example/scripts/account_status.lua', { headers: { host: 'dash.example' } }))).text();
};

async function harness(source: string, sim = { maintenance: false, fail: false }, startSliceMs?: number) {
  let t = 0;
  const ops: RenderOp[] = [];
  const logs: string[] = [];
  const reqs: (HttpReq & { json?: Record<string, unknown> })[] = [];
  const rt = new LuaRuntime({
    render: (o) => ops.push(o),
    log: (l, m) => logs.push(`${l}: ${m}`),
    now: () => t,
    epoch: () => Date.UTC(2026, 9, 22) + t,
    http: async (req) => {
      let json: Record<string, unknown> | undefined;
      try { json = JSON.parse(req.body); } catch { json = undefined; }
      reqs.push({ ...req, json });
      if (req.url.endsWith('/api/maintenance')) return { status: 200, body: JSON.stringify({ maintenance: sim.maintenance, message: 'Sedang perawatan uji' }) };
      if (req.url.endsWith('/api/receiver/control')) return { status: 200, body: JSON.stringify({ success: true, data: null }) };
      if (sim.maintenance) return { status: 503, body: JSON.stringify({ success: false, maintenance: true, message: 'Sedang perawatan uji' }) };
      if (sim.fail) return { status: 500, body: '{}' };
      return { status: 200, body: JSON.stringify({ success: true, stored: true }) };
    },
  }, { userName: 'testlab_abc', displayName: 'Test Lab', userId: '1234', placeId: '9999', jobId: 'job-1', gameName: 'Probe Game' }, startSliceMs);
  const advance = async (sec: number) => {
    for (let i = 0; i < sec * 30; i += 1) { t += 33; rt.tick(0.033); await Promise.resolve(); await Promise.resolve(); }
  };
  const texts = () => ops.filter((o): o is Extract<RenderOp, { t: 'set' }> => o.t === 'set' && o.prop === 'Text').map((o) => o.v);
  return { rt, ops, logs, reqs, advance, sim, texts, started: rt.start(source) };
}
const accountPosts = (h: Awaited<ReturnType<typeof harness>>) => h.reqs.filter((r) => r.method === 'POST' && r.url.endsWith('/api/receiver/universal'));

describe.each([[false], [true]])('skrip Lua asli di runtime (proteksi %s)', (protectedOn) => {
  it('berjalan tanpa error, membangun panel, dan mengirim Online lalu Heartbeat', async () => {
    const h = await harness(await serve(protectedOn));
    expect(h.started).toBe(true);
    await h.advance(14);
    expect(h.logs.filter((l) => l.startsWith('error'))).toEqual([]);
    expect(h.ops.some((o) => o.t === 'create' && o.cls === 'ScreenGui')).toBe(true);
    expect(h.ops.filter((o) => o.t === 'create' && o.cls === 'TextLabel').length).toBeGreaterThan(3);
    const posts = accountPosts(h);
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(posts[0].json).toMatchObject({ type: 'account_status', username: 'testlab_abc', state: 'ONLINE', event: 'Online', placeId: 9999 });
    expect(posts[1].json).toMatchObject({ event: 'Heartbeat' });
    expect(posts[0].headers['x-wm']).toBeTruthy(); // token publik per salinan ikut terkirim
    expect(h.reqs.some((r) => r.url.endsWith('/api/maintenance'))).toBe(true);
    h.rt.dispose();
  });

  it('maintenance dari server: pengiriman dijeda dan teks maintenance tampil di panel', async () => {
    const h = await harness(await serve(protectedOn));
    await h.advance(8);
    h.sim.maintenance = true;
    await h.advance(14);
    expect(h.texts().some((t) => t.includes('Sedang perawatan uji'))).toBe(true);
    const before = accountPosts(h).length;
    await h.advance(12);
    // data tidak dikirim lagi saat maintenance (hanya cek status); begitu mati, lanjut sendiri
    expect(accountPosts(h).length).toBe(before);
    h.sim.maintenance = false;
    await h.advance(14);
    expect(accountPosts(h).length).toBeGreaterThan(before);
    h.rt.dispose();
  });

  it('close() mengirim Offline', async () => {
    const h = await harness(await serve(protectedOn));
    await h.advance(8);
    h.rt.close();
    await h.advance(4);
    expect(accountPosts(h).some((r) => r.json?.state === 'OFFLINE')).toBe(true);
    h.rt.dispose();
  });
});

describe('keamanan runtime', () => {
  it('sandbox: tanpa io/os.execute/debug/require/package, loadstring terkurung di ENV', async () => {
    const h = await harness(`
      local leaks = {}
      for _, n in ipairs({"io","debug","require","package","dofile","loadfile","dostring","process","window"}) do if _G[n] ~= nil or rawget(_G, n) ~= nil then leaks[#leaks+1] = n end end
      if os.execute or os.exit or os.remove or os.getenv or string.dump then leaks[#leaks+1] = "os/string" end
      local f = loadstring("return io")
      if f and f() ~= nil then leaks[#leaks+1] = "loadstring" end
      warn("LEAKS=" .. table.concat(leaks, ","))
    `);
    await h.advance(1);
    expect(h.logs).toContain('warn: LEAKS=');
  });
  it('loop tak berujung dihentikan watchdog (tidak membekukan tab)', async () => {
    const h = await harness('while true do end', undefined, 300);
    await h.advance(1);
    expect(h.logs.some((l) => l.includes('script timeout'))).toBe(true);
  });
  it('checkRequest: hanya same-origin + path daftar putih + header tertentu', () => {
    const base: HttpReq = { id: 1, method: 'POST', url: 'https://dash.example/api/receiver/universal', headers: { 'x-wm': 'a', cookie: 'x', authorization: 'y' }, body: '{}' };
    const ok = checkRequest(base, 'https://dash.example');
    expect(ok.ok && Object.keys(ok.headers)).toEqual(['x-wm']);
    for (const bad of [
      { ...base, url: 'https://evil.example/api/receiver/universal' },
      { ...base, url: 'https://dash.example/api/admin/users' },
      { ...base, url: 'https://dash.example/api/receiver/universal/../../admin/users' },
      { ...base, method: 'DELETE' },
      { ...base, body: 'x'.repeat(300_000) },
    ]) expect(checkRequest(bad, 'https://dash.example').ok).toBe(false);
  });
});
