// Alur ujung-ke-ujung lewat route handler asli: unduh terlindungi -> laporan kebocoran -> kill-switch.
// Redis sungguhan (dilewati bila tidak tersedia); sesi dashboard disimulasikan lewat mock requirePermission.
import type IORedis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiKey } from '@/lib/apikeys';
import { isIngestPath } from '@/lib/maintenance';
import { openScript } from '@/lib/lua/scriptCrypto';
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import { readLeaks } from '@/lib/scriptguard/binding';
import { connectTestRedis } from './helpers/redis';

const holder = vi.hoisted(() => ({ redis: null as unknown, session: null as unknown }));
vi.mock('@/lib/redis', () => ({ getRedis: () => holder.redis }));
vi.mock('@/lib/rbac/guard', () => ({
  requirePermission: async () => (holder.session ? { session: holder.session } : { denied: Response.json({ success: false }, { status: 401 }) }),
}));

const conn = await connectTestRedis();
const d = conn ? describe : describe.skip;
let redis: RedisLike;
let raw: IORedis;

const HW1 = 'HWID-AAAA-1111-2222';
const HW2 = 'HWID-BBBB-3333-4444';
const HOST = 'dash.example';
const MOD = { sub: 'mod', role: 'admin', status: 'active', sid: 's1' };

const download = async (key: string, hwid?: string) => {
  const { GET } = await import('@/app/api/scripts/download/route');
  const headers: Record<string, string> = { 'x-script-key': key, host: HOST, 'x-forwarded-for': '5.5.5.5' };
  if (hwid) headers['x-hwid'] = hwid;
  return GET(new Request(`https://${HOST}/api/scripts/download`, { headers }));
};
const unseal = async (res: Response, key: string) => {
  const [nonce, hex] = (await res.text()).trim().split('\n');
  return openScript(hex, key, nonce);
};
const wmOf = (lua: string) => {
  const m = lua.match(/local WM_TOKEN, SALT, FP, JTI, BASE = "([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)"/);
  return m ? { token: m[1], salt: m[2], fp: m[3], jti: m[4], base: m[5] } : null;
};
const poll = async (token: string, hwid: string, account = 'Bob') => {
  const { GET } = await import('@/app/api/receiver/control/route');
  return GET(new Request(`https://${HOST}/api/receiver/control?account=${account}`, { headers: { 'x-wm': token, 'x-hwid': hwid, 'x-forwarded-for': '5.5.5.5' } }));
};
const ackReq = async (token: string, hwid: string, id: string, account = 'Bob') => {
  const { PUT } = await import('@/app/api/receiver/control/route');
  return PUT(new Request(`https://${HOST}/api/receiver/control`, { method: 'PUT', headers: { 'x-wm': token, 'x-hwid': hwid, 'content-type': 'application/json' }, body: JSON.stringify({ account, id }) }));
};
const issue = async (body: unknown, origin: string | null = `https://${HOST}`) => {
  const { POST } = await import('@/app/api/receiver/control/route');
  const headers: Record<string, string> = { host: HOST, 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return POST(new Request(`https://${HOST}/api/receiver/control`, { method: 'POST', headers, body: JSON.stringify(body) }));
};

beforeAll(() => { vi.stubEnv('ENCRYPTION_KEY', 'a1'.repeat(32)); });
afterAll(async () => { vi.unstubAllEnvs(); await raw?.flushdb(); raw?.disconnect(); });

it('kontrol jarak jauh dikecualikan dari penolakan maintenance (kill-switch harus tetap bisa dijangkau)', () => {
  expect(isIngestPath('/api/receiver/control')).toBe(false);
  expect(isIngestPath('/api/receiver/universal')).toBe(true);
});

d('route: unduhan terlindungi, laporan, kill-switch', () => {
  let key = '';
  let keyId = '';
  beforeAll(() => { redis = conn!.redis; raw = conn!.raw; holder.redis = redis; });
  beforeEach(async () => {
    await raw.flushdb();
    holder.session = MOD;
    const k = await createApiKey(redis, { label: 'uji', by: 'tester' });
    key = k.key; keyId = k.view.id;
    await raw.hset(KEYS.trackerAccounts, 'Bob', JSON.stringify({ username: 'Bob', rev: 1 }));
  });

  it('unduhan: tanpa key 401, tanpa HWID 400, sukses = skrip tersegel yang hanya terbuka dengan key, watermark unik per unduhan', async () => {
    expect((await download('dbde_' + '0'.repeat(48), HW1)).status).toBe(401);
    expect((await download(key)).status).toBe(400);

    const res = await download(key, HW1);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('x-device-bound')).toBe('bound');
    const lua = await unseal(res.clone(), key);
    expect(lua.startsWith('--dbde-ok\n')).toBe(true);
    expect(lua).toContain('local __dbde_guard');
    expect(lua).toContain('KONFIGURASI'); // skrip utama ikut
    expect(lua).toContain(`https://${HOST}/api/receiver/universal`);
    expect(lua).not.toContain('__WM_');
    expect(lua).not.toContain(HW1); // HWID tidak pernah ditanam di skrip
    expect((await res.text()).includes(key)).toBe(false);

    const second = await download(key, HW1);
    expect(second.headers.get('x-device-bound')).toBe('known');
    const a = wmOf(lua)!, b = wmOf(await unseal(second, key))!;
    expect(a.token).not.toBe(b.token);
    expect(a.jti).not.toBe(b.jti);
    expect(a.base).toBe(`https://${HOST}`);
  });

  it('perangkat lain ditolak 403 dan tercatat di Redis sebagai kebocoran (device_limit)', async () => {
    expect((await download(key, HW1)).status).toBe(200);
    const res = await download(key, HW2);
    expect(res.status).toBe(403);
    const [leak] = await readLeaks(redis, 5);
    expect(leak).toMatchObject({ reason: 'device_limit', source: 'download', uid: keyId });
  });

  it('laporan Lua: HWID cocok -> match; tidak cocok -> KILL + log kebocoran; token palsu 403', async () => {
    const wm = wmOf(await unseal(await download(key, HW1), key))!;
    const { POST } = await import('@/app/api/scripts/report/route');
    const report = (body: unknown) => POST(new Request(`https://${HOST}/api/scripts/report`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '6.6.6.6' }, body: JSON.stringify(body) }));

    expect(await (await report({ token: wm.token, hwid: HW1 })).json()).toMatchObject({ success: true, match: true });
    expect(await readLeaks(redis, 5)).toHaveLength(0);

    const bad = await (await report({ token: wm.token, hwid: HW2 })).json();
    expect(bad).toMatchObject({ success: true, match: false, action: 'KILL' });
    expect(await readLeaks(redis, 5)).toMatchObject([{ reason: 'hwid_mismatch', source: 'report', uid: keyId, jti: wm.jti }]);

    expect((await report({ token: 'palsu', hwid: HW1 })).status).toBe(403);
  });

  it('kill-switch ujung-ke-ujung: dashboard KILL -> skrip poll -> ack -> kosong; salinan di perangkat lain mendapat KILL + tercatat', async () => {
    const wm = wmOf(await unseal(await download(key, HW1), key))!;

    expect(await (await poll(wm.token, HW1)).json()).toMatchObject({ success: true, cmd: 'NONE', id: null });

    const issued = await issue({ accountId: 'Bob', command: 'KILL', ttlSeconds: 60 });
    expect(issued.status).toBe(200);
    const state = (await issued.json()).data;
    expect(state).toMatchObject({ cmd: 'KILL', issuedBy: 'mod', ackedAt: null });
    expect(await raw.lrange(KEYS.auditLog, 0, 0).then((l) => JSON.parse(l[0]))).toMatchObject({ action: 'control.issue', target: 'Bob', actor: 'mod' });

    const polled = await (await poll(wm.token, HW1)).json();
    expect(polled).toMatchObject({ cmd: 'KILL', id: state.id });
    expect(polled.ttl).toBeGreaterThan(0);

    // Salinan di perangkat lain: ditolak + KILL, walau ada perintah menunggu.
    const stolen = await poll(wm.token, HW2);
    expect(stolen.status).toBe(403);
    expect(await stolen.json()).toMatchObject({ success: false, cmd: 'KILL', reason: 'hwid' });
    expect((await readLeaks(redis, 5))[0]).toMatchObject({ reason: 'hwid_mismatch', source: 'poll' });

    expect((await (await ackReq(wm.token, HW1, state.id)).json()).acked).toBe(true);
    expect(await (await poll(wm.token, HW1)).json()).toMatchObject({ cmd: 'NONE' }); // salinan ini sudah ack
    // Ack satu salinan TIDAK menghapus perintah bagi salinan lain (token tak terikat akun: tidak boleh jadi tombol "hapus KILL").
    const wm2 = wmOf(await unseal(await download(key, HW1), key))!;
    expect(await (await poll(wm2.token, HW1)).json()).toMatchObject({ cmd: 'KILL', id: state.id });
    expect((await (await ackReq(wm.token, HW1, 'id-asing')).json()).acked).toBe(false);
  });

  it('POST: tanpa sesi ditolak, tanpa Origin / Origin asing 403, akun tak dikenal 404, perintah/ttl tak valid 400', async () => {
    holder.session = null;
    expect((await issue({ accountId: 'Bob', command: 'KILL' })).status).toBe(401);
    holder.session = MOD;
    expect((await issue({ accountId: 'Bob', command: 'KILL' }, null)).status).toBe(403);
    expect((await issue({ accountId: 'Bob', command: 'KILL' }, 'https://evil.example')).status).toBe(403);
    expect((await issue({ accountId: 'Ghost', command: 'KILL' })).status).toBe(404);
    expect((await issue({ accountId: 'Bob', command: 'DESTROY' })).status).toBe(400);
    expect((await issue({ accountId: 'Bob', command: 'PAUSE', ttlSeconds: 1 })).status).toBe(400);
    expect(await raw.exists(KEYS.controlCmd('bob'))).toBe(0); // tidak ada perintah yang lolos
  });
});
