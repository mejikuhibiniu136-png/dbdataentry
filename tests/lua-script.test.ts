// Skrip Lua yang benar-benar disajikan route: sintaks valid (luac -p), tanpa rahasia, dan lolos pemindai Test Lab.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { analyzeLua, summarize } from '@/lib/testlab';

process.env.ENCRYPTION_KEY = 'a1'.repeat(32); // kanal kontrol butuh kunci enkripsi
let obfuscated: unknown = 'false';
vi.mock('@/lib/redis', () => ({ getRedis: () => ({ hget: async () => obfuscated }) }));
const { GET } = await import('@/app/scripts/account_status.lua/route');

const luac = ['luac5.4', 'luac', 'luac5.3'].find((b) => spawnSync(b, ['-v']).status === 0);
const serve = async (on: boolean) => {
  obfuscated = on ? 'true' : 'false';
  const res = await GET(new Request('https://dash.example/scripts/account_status.lua', { headers: { host: 'dash.example' } }));
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { res, headers, source: await res.text() };
};
const syntaxErrors = (source: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lua-'));
  try {
    const f = path.join(dir, 's.lua');
    writeFileSync(f, source);
    const r = spawnSync(luac!, ['-p', f], { encoding: 'utf8' });
    return r.status === 0 ? '' : r.stderr;
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

describe.each([[false], [true]])('skrip publik (proteksi %s)', (on) => {
  it('200, kanal kontrol terpasang, tanpa FAIL dari pemindai Test Lab', async () => {
    const { res, headers, source } = await serve(on);
    expect(res.status).toBe(200);
    expect(headers['x-script-control']).toBe('on');
    const results = analyzeLua({ status: 200, headers, source, origin: 'https://dash.example' });
    expect(results.filter((r) => r.verdict === 'fail'), JSON.stringify(results.filter((r) => r.verdict === 'fail'))).toEqual([]);
    expect(summarize(results).pass).toBeGreaterThan(5);
  });
  it('tiap unduhan berbeda (token publik per salinan)', async () => {
    expect((await serve(on)).source).not.toBe((await serve(on)).source);
  });
  it.skipIf(!luac)('sintaks Lua valid (luac -p)', async () => {
    expect(syntaxErrors((await serve(on)).source)).toBe('');
  });
});
