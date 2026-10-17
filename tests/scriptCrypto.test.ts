import { describe, expect, it } from 'vitest';
import { SCRIPT_MAGIC, openScript, sealScript } from '@/lib/lua/scriptCrypto';

const KEY = 'dbde_' + 'a'.repeat(48);

describe('scriptCrypto', () => {
  it('round-trip dengan key yang benar', () => {
    const { nonce, hex } = sealScript('print("halo ✓")', KEY);
    expect(openScript(hex, KEY, nonce)).toBe(SCRIPT_MAGIC + 'print("halo ✓")');
  });
  it('key salah tidak menghasilkan penanda', () => {
    const { nonce, hex } = sealScript('print(1)', KEY);
    expect(openScript(hex, 'dbde_' + 'b'.repeat(48), nonce).startsWith(SCRIPT_MAGIC)).toBe(false);
  });
  it('nonce baru tiap unduhan', () => {
    expect(sealScript('x', KEY).hex).not.toBe(sealScript('x', KEY).hex);
  });
});
