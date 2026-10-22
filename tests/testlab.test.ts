// Logika murni Test Lab: preset valid, daftar putih, vonis, HMAC kompatibel dengan server, pemindai rahasia Lua.
import { describe, expect, it } from 'vitest';
import { verifyHmacSignature } from '@/lib/keys';
import { accountPayloadSchema } from '@/schemas/account';
import { slugify } from '@/lib/slug';
import {
  PROBE_GAME, analyzeLua, buildPresets, hmacHex, isAllowedContentType, isAllowedEndpoint, judgeStatus, probeUsername, summarize, type LuaProbe,
} from '@/lib/testlab';

const okHeaders = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'x-content-type-options': 'nosniff', 'x-script-protection': 'off', 'x-script-control': 'on' };
const probe = (over: Partial<LuaProbe> = {}): LuaProbe => ({
  status: 200, headers: okHeaders, origin: 'https://dash.example',
  source: 'local H = game:GetService("HttpService")\nlocal URL = "https://dash.example/api/receiver/universal"\n', ...over,
});
const verdict = (rs: ReturnType<typeof analyzeLua>, id: string) => rs.find((r) => r.id === id)?.verdict;

describe('presets & daftar putih', () => {
  it('preset akun lolos skema server dan memakai nama uji berawalan testlab_', () => {
    const acct = buildPresets(probeUsername('abc123'))[0];
    const parsed = accountPayloadSchema.safeParse(JSON.parse(acct.body));
    expect(parsed.success).toBe(true);
    expect(acct.account).toBe('testlab_abc123');
  });
  it('probeUsername membuang karakter berbahaya', () => {
    expect(probeUsername('../x;y')).toMatch(/^testlab_[a-z0-9]+$/i);
  });
  it('hanya path same-origin dan content-type yang terdaftar', () => {
    expect(isAllowedEndpoint('/api/receiver/universal')).toBe(true);
    for (const bad of ['https://evil.example/x', '//evil.example', '/api/admin/users', '/api/receiver/universal?x=1', '']) expect(isAllowedEndpoint(bad)).toBe(false);
    expect(isAllowedContentType('application/json')).toBe(true);
    expect(isAllowedContentType('text/html')).toBe(false);
  });
  it('slug tabel uji stabil: tombol hapus hanya menyasar tabel ini', () => {
    expect(slugify(PROBE_GAME)).toBe('dbd-testlab-probe');
  });
});

describe('judgeStatus', () => {
  it('pass, warn (auth/rate/maintenance), fail (5xx / tak terduga)', () => {
    expect(judgeStatus(200, [200, 202]).verdict).toBe('pass');
    expect(judgeStatus(401, [200]).verdict).toBe('warn');
    expect(judgeStatus(429, [200]).verdict).toBe('warn');
    expect(judgeStatus(503, [200]).verdict).toBe('warn');
    expect(judgeStatus(500, [200, 400]).verdict).toBe('fail');
    expect(judgeStatus(404, [200]).verdict).toBe('fail');
    expect(judgeStatus(413, [413]).verdict).toBe('pass');
  });
});

describe('HMAC', () => {
  it('tanda tangan klien diterima verifyHmacSignature server dan salah secret ditolak', async () => {
    const body = '{"a":1}';
    const sig = await hmacHex('s3cret', body);
    expect(verifyHmacSignature(new TextEncoder().encode(body), `sha256=${sig}`, 's3cret')).toBe(true);
    expect(verifyHmacSignature(new TextEncoder().encode(body), `sha256=${sig}`, 'other')).toBe(false);
  });
});

describe('analyzeLua', () => {
  it('skrip sehat: tanpa FAIL', () => {
    expect(summarize(analyzeLua(probe())).fail).toBe(0);
  });
  it('mendeteksi rahasia bocor, placeholder tersisa, header cache hilang, dan endpoint salah', () => {
    const rs = analyzeLua(probe({ headers: { ...okHeaders, 'cache-control': 'public, max-age=60' }, source: 'x = "JWT_SECRET" y = "__WM_TOKEN__" z = "$argon2id$v=19$m=1"' }));
    expect(verdict(rs, 'secrets')).toBe('fail');
    expect(verdict(rs, 'placeholder')).toBe('fail');
    expect(verdict(rs, 'nocache')).toBe('fail');
    expect(verdict(rs, 'endpoint')).toBe('fail');
  });
  it('proteksi menyala: URL polos = FAIL, tersembunyi = PASS', () => {
    const on = { ...okHeaders, 'x-script-protection': 'on' };
    expect(verdict(analyzeLua(probe({ headers: on })), 'endpoint')).toBe('fail');
    expect(verdict(analyzeLua(probe({ headers: on, source: 'loadstring(game:HttpGet("x"))' })), 'endpoint')).toBe('pass');
  });
  it('dua unduhan identik = WARN, berbeda = PASS; 410 dilewati', () => {
    expect(verdict(analyzeLua(probe({ firstHash: 'a', secondHash: 'a' })), 'nonce')).toBe('warn');
    expect(verdict(analyzeLua(probe({ firstHash: 'a', secondHash: 'b' })), 'nonce')).toBe('pass');
    expect(analyzeLua(probe({ status: 410 }))).toHaveLength(1);
  });
});

describe('gerbang proxy /test-lab', () => {
  it('tamu tanpa sesi dialihkan ke /login (bukan 200)', async () => {
    process.env.JWT_SECRET = 'x'.repeat(40);
    const { NextRequest } = await import('next/server');
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest('https://dash.example/test-lab'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
  });
});
