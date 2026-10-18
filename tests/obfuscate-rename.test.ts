import { describe, expect, it } from 'vitest';
import { renameLocalIdentifiers } from '@/lib/lua/obfuscate';
import { ACCOUNT_STATUS_LUA } from '@/lib/lua/accountStatus';

describe('renameLocalIdentifiers', () => {
  it('tidak merusak parameter fungsi yang namanya sama dengan local lain', () => {
    const src = [
      'local function pushHist(list, value)',
      '  list[#list + 1] = value',
      'end',
      'local list = {}',
      'pushHist(list, 1)',
    ].join('\n');
    const out = renameLocalIdentifiers(src);
    // `list` dikecualikan dari rename, jadi badan fungsi tetap merujuk parameter yang sama.
    expect(out).toContain('list[#list + 1] = value');
    expect(out).toContain('local list = {}');
  });

  it('tidak merusak variabel for yang namanya sama dengan local lain', () => {
    const src = ['local v = 1', 'for _, v in ipairs({}) do print(v) end'].join('\n');
    expect(renameLocalIdentifiers(src)).toContain('for _, v in ipairs({}) do print(v) end');
  });

  it('tetap me-rename local biasa', () => {
    const out = renameLocalIdentifiers('local counter = 1\nprint(counter)');
    expect(out).not.toContain('counter');
  });

  it('account_status.lua: tiap parameter/for-var tetap utuh setelah rename', () => {
    const out = renameLocalIdentifiers(ACCOUNT_STATUS_LUA);
    expect(out).toMatch(/local function \w+\(list, value\)/);
    expect(out).toMatch(/local function \w+\(inst, props, duration\)/);
    expect(out).toMatch(/local function \w+\(status, body\)/);
    expect(out).toMatch(/local function \w+\(r, g, b\)/);
  });
});
