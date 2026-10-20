// Kanal kontrol untuk skrip publik: tanpa ini tombol Pause/Resume/Kill di dashboard tidak pernah sampai ke skrip.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authenticateControl } from '@/lib/scriptguard/auth';
import { composePublicLua, readLuaModules, readPublicGuard } from '@/lib/scriptguard/compose';
import { issuePublicToken, openPublicToken } from '@/lib/scriptguard/publicToken';

beforeAll(() => { vi.stubEnv('ENCRYPTION_KEY', 'a1'.repeat(32)); });
afterAll(() => { vi.unstubAllEnvs(); });

const req = (token?: string) => new Request('https://x.test/api/receiver/control', { headers: token ? { 'x-wm': token } : {} });
const noRedis = {} as never; // jalur publik tidak menyentuh Redis

describe('token publik', () => {
  it('terbit lalu terbuka; token acak ditolak; token kedaluwarsa ditolak', async () => {
    const { token, jti } = issuePublicToken(1_000);
    expect(openPublicToken(token)?.jti).toBe(jti);
    expect(openPublicToken('bukan-token')).toBeNull();
    const ok = await authenticateControl(req(issuePublicToken().token), noRedis);
    expect(ok.ok).toBe(true);
    const old = await authenticateControl(req(token), noRedis, 1_000 + 31 * 86_400_000);
    expect(old).toMatchObject({ ok: false, reason: 'expired' });
    expect(await authenticateControl(req(), noRedis)).toMatchObject({ ok: false, status: 401 });
  });

  it('SCRIPT_PUBLIC_CONTROL=off menolak token publik', async () => {
    vi.stubEnv('SCRIPT_PUBLIC_CONTROL', 'off');
    expect(await authenticateControl(req(issuePublicToken().token), noRedis)).toMatchObject({ ok: false });
    vi.stubEnv('SCRIPT_PUBLIC_CONTROL', '');
  });
});

describe('composePublicLua', () => {
  it('memuat kontrol + guard publik, placeholder terisi, skrip utama di akhir', async () => {
    const [mods, guardPublic] = await Promise.all([readLuaModules(), readPublicGuard()]);
    const out = composePublicLua({ guardPublic, control: mods.control }, { token: 'tok.en-1', base: 'https://x.test' }, '-- MAIN');
    expect(out).toContain('tok.en-1');
    expect(out).toContain('https://x.test');
    expect(out).not.toContain('__WM_');
    expect(out).toContain('__dbde_control.start()');
    expect(out.trimEnd().endsWith('-- MAIN')).toBe(true);
    expect(out.indexOf('__dbde_control.start()')).toBeLessThan(out.indexOf('-- MAIN'));
  });

  it('nilai tak aman ditolak', async () => {
    const [mods, guardPublic] = await Promise.all([readLuaModules(), readPublicGuard()]);
    expect(() => composePublicLua({ guardPublic, control: mods.control }, { token: 'a"b', base: 'https://x.test' }, '')).toThrow();
  });
});
