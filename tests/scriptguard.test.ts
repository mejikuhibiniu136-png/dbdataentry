// HWID fingerprinting, watermark, pengikatan perangkat, dan kill-switch. Bagian murni selalu jalan; bagian Redis
// memakai Redis sungguhan (script Lua server dijalankan) dan dilewati bila Redis uji tidak tersedia.
import type IORedis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiKey, revokeApiKey } from '@/lib/apikeys';
import { ackCommand, clampTtl, issueCommand, peekCommand, readControlStates } from '@/lib/control/commands';
import { KEYS } from '@/lib/keys';
import type { RedisLike } from '@/lib/redis';
import { authenticateScript } from '@/lib/scriptguard/auth';
import { bindHwid, isHwidBound, listBindings, readLeaks, recordLeak, resetHwidBindings } from '@/lib/scriptguard/binding';
import { composeGuardedLua, injectWatermark, readLuaModules } from '@/lib/scriptguard/compose';
import { fingerprint, hwidDigest, normalizeHwid } from '@/lib/scriptguard/hwid';
import { issueWatermark, openWatermark } from '@/lib/scriptguard/watermark';
import { CryptoError, sealJson } from '@/lib/security/crypto';
import { connectTestRedis } from './helpers/redis';

const KEY_A = 'a1'.repeat(32);
const HW1 = 'HWID-AAAA-1111-2222';
const HW2 = 'HWID-BBBB-3333-4444';

beforeAll(() => { vi.stubEnv('ENCRYPTION_KEY', KEY_A); });
afterAll(() => { vi.unstubAllEnvs(); });

describe('hwid', () => {
  it('normalizeHwid menolak spasi, terlalu pendek/panjang, dan non-string', () => {
    expect(normalizeHwid(HW1)).toBe(HW1);
    for (const bad of ['short', 'has space in it', 'x'.repeat(129), 'tab\there1234', 'üñíçødé-1234', 42, null, undefined]) expect(normalizeHwid(bad)).toBeNull();
  });

  it('hwidDigest: 32 hex, stabil, berbeda per HWID dan per kunci', () => {
    const d = hwidDigest(HW1);
    expect(d).toMatch(/^[0-9a-f]{32}$/);
    expect(hwidDigest(HW1)).toBe(d);
    expect(hwidDigest(HW2)).not.toBe(d);
    expect(hwidDigest(HW1, { ENCRYPTION_KEY: 'b2'.repeat(32) })).not.toBe(d);
    expect(d).not.toContain(HW1);
  });

  it('fingerprint: deterministik, bergantung salt dan HWID, 16 hex', () => {
    const f = fingerprint(HW1, 'salt1');
    expect(f).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint(HW1, 'salt1')).toBe(f);
    expect(fingerprint(HW1, 'salt2')).not.toBe(f);
    expect(fingerprint(HW2, 'salt1')).not.toBe(f);
    // Vektor dari eksekusi lua/guard.lua (aritmetika bit32 + double): TS dan Lua harus identik.
    expect(f).toBe('fc09220dae328c69');
  });
});

describe('watermark', () => {
  it('round-trip: membawa uid, hash HWID, timestamp, jti; HWID mentah tidak ada di token', () => {
    const wm = issueWatermark({ uid: 'abc123abc123', hwid: HW1 }, 1_700_000_000_000);
    const p = openWatermark(wm.token)!;
    expect(p).toMatchObject({ uid: 'abc123abc123', hw: hwidDigest(HW1), ts: 1_700_000_000_000, jti: wm.jti, salt: wm.salt });
    expect(wm.token).not.toContain(HW1);
    expect(wm.fp).toBe(fingerprint(HW1, wm.salt));
    expect(wm.token).toMatch(/^[A-Za-z0-9._-]+$/); // aman disisipkan ke literal string Lua
  });

  it('setiap unduhan unik (jti, salt, token, fp)', () => {
    const a = issueWatermark({ uid: 'u', hwid: HW1 }), b = issueWatermark({ uid: 'u', hwid: HW1 });
    expect(new Set([a.jti, b.jti]).size).toBe(2);
    expect(a.token).not.toBe(b.token);
    expect(a.fp).not.toBe(b.fp);
  });

  it('token diubah / konteks lain / kunci lain / sampah -> null', () => {
    const { token } = issueWatermark({ uid: 'u', hwid: HW1 });
    const parts = token.split('.');
    const i = Math.floor(parts.length / 2);
    parts[i] = parts[i].slice(0, -2) + (parts[i].endsWith('AA') ? 'BB' : 'AA');
    expect(openWatermark(parts.join('.'))).toBeNull();
    expect(openWatermark(sealJson({ v: 1, uid: 'u', hw: 'x', ts: 1, jti: 'j', salt: 's' }, 'konteks-lain'))).toBeNull();
    vi.stubEnv('ENCRYPTION_KEY', 'b2'.repeat(32));
    expect(openWatermark(token)).toBeNull();
    vi.stubEnv('ENCRYPTION_KEY', KEY_A);
    for (const junk of ['', 'abc', 'x'.repeat(5000), null, 7, {}]) expect(openWatermark(junk)).toBeNull();
  });

  it('payload sah secara kriptografis tetapi bentuknya salah ditolak', () => {
    expect(openWatermark(sealJson({ v: 2, uid: 'u' }, 'script-watermark:v1'))).toBeNull();
    expect(() => { throw new CryptoError('format', 'x'); }).toThrow();
  });
});

describe('compose', () => {
  const vars = { token: 'tok.en-1', salt: 'abcdef123456', fp: '0123456789abcdef', jti: '11111111-2222-3333-4444-555555555555', base: 'https://dash.example' };

  it('injectWatermark mengganti semua placeholder, menolak karakter tak aman / placeholder hilang', () => {
    const src = 'a="__WM_TOKEN__" b="__WM_SALT__" c="__WM_FP__" d="__WM_JTI__" e="__WM_BASE__" t2="__WM_TOKEN__"';
    const out = injectWatermark(src, vars);
    expect(out).not.toContain('__WM_');
    expect(out).toContain('t2="tok.en-1"');
    expect(() => injectWatermark(src, { ...vars, token: 'a"; os.execute("x") --' })).toThrow(/tak aman/);
    expect(() => injectWatermark(src, { ...vars, base: 'https://x y' })).toThrow(/tak aman/);
    expect(() => injectWatermark('tanpa placeholder', vars)).toThrow(/tidak ada/);
  });

  it('berkas lua/ asli memuat kelima placeholder dan perakitan berurutan: guard -> control -> enforce -> start -> utama', async () => {
    const mods = await readLuaModules();
    for (const ph of ['__WM_TOKEN__', '__WM_SALT__', '__WM_FP__', '__WM_JTI__', '__WM_BASE__']) expect(mods.guard).toContain(ph);
    const out = composeGuardedLua(mods, vars, '--MAIN--');
    expect(out).not.toContain('__WM_');
    const order = ['local __dbde_guard', 'local __dbde_control', 'if not __dbde_guard.enforce()', '__dbde_control.start()', '--MAIN--'].map((s) => out.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(out).toContain(vars.jti);
  });
});

describe('clampTtl', () => {
  it('batas 10-600 detik, bawaan 120', () => {
    expect([clampTtl(1), clampTtl(99999), clampTtl('abc'), clampTtl(undefined), clampTtl(45)]).toEqual([10, 600, 120, 120, 45]);
  });
});

const conn = await connectTestRedis();
const d = conn ? describe : describe.skip;
let redis: RedisLike;
let raw: IORedis;

d('pengikatan HWID, kebocoran, autentikasi skrip, kill-switch (Redis sungguhan)', () => {
  beforeAll(() => { redis = conn!.redis; raw = conn!.raw; });
  afterAll(async () => { await raw?.flushdb(); raw?.disconnect(); });
  beforeEach(async () => { await raw.flushdb(); });

  const headersOf = (token: string, hwid: string) => new Headers({ 'x-wm': token, 'x-hwid': hwid, 'x-forwarded-for': '9.9.9.9', 'user-agent': 'RobloxApp/1.0' });
  const req = (token: string, hwid: string) => new Request('https://dash.example/api/receiver/control?account=bob', { headers: headersOf(token, hwid) });

  it('bindHwid: pertama terikat, sama = known, perangkat lain ditolak pada batas 1, diizinkan pada batas 2; reset membuka lagi', async () => {
    const h1 = hwidDigest(HW1), h2 = hwidDigest(HW2);
    expect(await bindHwid(redis, 'k1', h1, { max: 1, ip: '1.1.1.1' })).toEqual({ status: 'bound', count: 1 });
    expect(await bindHwid(redis, 'k1', h1, { max: 1, ip: '1.1.1.1' })).toEqual({ status: 'known', count: 1 });
    expect((await bindHwid(redis, 'k1', h2, { max: 1, ip: '2.2.2.2' })).status).toBe('denied');
    expect(await isHwidBound(redis, 'k1', h2)).toBe(false);
    expect((await bindHwid(redis, 'k1', h2, { max: 2, ip: '2.2.2.2' })).status).toBe('bound');
    expect((await listBindings(redis, 'k1')).map((b) => b.ip).sort()).toEqual(['1.1.1.1', '2.2.2.2']);
    expect(await resetHwidBindings(redis, 'k1')).toBe(1);
    expect((await bindHwid(redis, 'k1', h2, { max: 1, ip: '2.2.2.2' })).status).toBe('bound');
  });

  it('bindHwid atomik: 8 perangkat berbeda serentak pada batas 1 -> tepat satu yang terikat', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => bindHwid(redis, 'race', hwidDigest(`HWID-RACE-${i}-xxxxx`), { max: 1, ip: '3.3.3.3' })));
    expect(results.filter((r) => r.status === 'bound')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'denied')).toHaveLength(7);
    expect(Number(await redis.hlen(KEYS.hwidBinds('race')))).toBe(1);
  });

  it('recordLeak: masuk Redis (log + statistik), tanpa HWID mentah, dipangkas ke LEAK_MAX', async () => {
    await recordLeak(redis, { reason: 'hwid_mismatch', source: 'report', uid: 'k1', jti: 'j1', ownerHw: hwidDigest(HW1), observedHw: hwidDigest(HW2), headers: headersOf('t', HW2) });
    const [ev] = await readLeaks(redis, 10);
    expect(ev).toMatchObject({ reason: 'hwid_mismatch', source: 'report', uid: 'k1', jti: 'j1', ip: '9.9.9.9' });
    expect(ev.observedHw).toBe(hwidDigest(HW2).slice(0, 8));
    expect(JSON.stringify(ev)).not.toContain(HW2);
    expect(await raw.hget(KEYS.leakStats, 'hwid_mismatch')).toBe('1');
  });

  it('authenticateScript: perangkat sah lolos; HWID lain ditolak + tercatat bocor; perangkat terdaftar kedua lolos; key dicabut / token palsu / tanpa token ditolak', async () => {
    const { key, view } = await createApiKey(redis, { label: 't', by: 'tester' });
    expect(key).toMatch(/^dbde_/);
    const wm = issueWatermark({ uid: view.id, hwid: HW1 });

    const ok = await authenticateScript(req(wm.token, HW1), redis);
    expect(ok.ok).toBe(true);

    const bad = await authenticateScript(req(wm.token, HW2), redis);
    expect(bad).toMatchObject({ ok: false, status: 403, reason: 'hwid' });
    const leaks = await readLeaks(redis, 5);
    expect(leaks[0]).toMatchObject({ reason: 'hwid_mismatch', source: 'poll', uid: view.id, jti: wm.jti });

    await bindHwid(redis, view.id, hwidDigest(HW2), { max: 2, ip: '2.2.2.2' });
    expect((await authenticateScript(req(wm.token, HW2), redis)).ok).toBe(true);

    expect(await authenticateScript(req(wm.token, 'bad'), redis)).toMatchObject({ ok: false, reason: 'hwid' });
    expect(await authenticateScript(req('garbage', HW1), redis)).toMatchObject({ ok: false, status: 403, reason: 'invalid' });
    expect(await authenticateScript(new Request('https://x/'), redis)).toMatchObject({ ok: false, status: 401, reason: 'missing' });

    expect(await authenticateScript(req(wm.token, HW1), redis, Date.now() + 31 * 86_400_000)).toMatchObject({ ok: false, reason: 'expired' });

    await revokeApiKey(redis, view.id);
    expect(await authenticateScript(req(wm.token, HW1), redis)).toMatchObject({ ok: false, reason: 'revoked' });
  });

  it('kill-switch: terbit -> peek -> ack menghapus; ack id lama tidak menghapus perintah baru; perintah baru menimpa', async () => {
    const first = await issueCommand(redis, { account: 'Bob', cmd: 'PAUSE', by: 'mod', ttlSeconds: 30 });
    expect((await peekCommand(redis, 'bob'))?.id).toBe(first.id); // kunci tidak peka huruf besar/kecil
    expect(await raw.ttl(KEYS.controlCmd('bob'))).toBeGreaterThan(0);
    expect(await raw.ttl(KEYS.controlCmd('bob'))).toBeLessThanOrEqual(30);

    const second = await issueCommand(redis, { account: 'Bob', cmd: 'KILL', by: 'mod' });
    expect((await peekCommand(redis, 'Bob'))?.cmd).toBe('KILL');
    expect(await ackCommand(redis, 'Bob', first.id)).toBe(false); // ack lambat milik perintah lama
    expect((await peekCommand(redis, 'Bob'))?.id).toBe(second.id);

    expect(await ackCommand(redis, 'Bob', second.id)).toBe(true);
    expect(await peekCommand(redis, 'Bob')).toBeNull();
    expect(await ackCommand(redis, 'Bob', second.id)).toBe(false); // idempotent
    const states = await readControlStates(redis);
    expect(states.bob).toMatchObject({ cmd: 'KILL', id: second.id });
    expect(states.bob.ackedAt).not.toBeNull();
  });

  it('readControlStates: perintah hangus / ack lama tidak ditampilkan; issue menaikkan penanda SSE', async () => {
    const before = Number((await raw.get(KEYS.streamSeq)) ?? 0);
    const s = await issueCommand(redis, { account: 'amy', cmd: 'RESUME', by: 'mod', ttlSeconds: 10 }, 1_000_000);
    expect(Number(await raw.get(KEYS.streamSeq))).toBe(before + 1);
    expect((await readControlStates(redis, 1_000_000 + 5_000)).amy?.id).toBe(s.id);
    expect((await readControlStates(redis, 1_000_000 + 11_000)).amy).toBeUndefined();
  });
});
