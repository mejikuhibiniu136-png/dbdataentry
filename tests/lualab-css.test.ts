// Pemetaan nilai Roblox -> CSS (murni) dan kunci keamanan stage: hanya textContent, tanpa innerHTML.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alignX, alignY, calc, cornerRadius, decode, fontStyle, layoutStyle, rgba } from '@/lib/lualab/css';

describe('decode', () => {
  it('nilai valid', () => {
    expect(decode('n:1.5')).toEqual({ k: 'n', v: 1.5 });
    expect(decode('b:1')).toEqual({ k: 'b', v: true });
    expect(decode('s:a:b')).toEqual({ k: 's', v: 'a:b' });
    expect(decode('u2:0,16,0.5,-4')).toEqual({ k: 'u2', v: [0, 16, 0.5, -4] });
    expect(decode('c:1,0.5,0')).toEqual({ k: 'c', v: [1, 0.5, 0] });
  });
  it('menolak input rusak / non-angka', () => {
    for (const bad of ['', 'zzz', 'u2:1,2,3', 'n:abc', 'c:1,2', 'x:1', 'u2:NaN,1,2,3']) expect(decode(bad)).toBeNull();
  });
});

describe('css', () => {
  it('UDim2 -> left/top/width/height dan anchor', () => {
    expect(layoutStyle('Position', decode('u2:0,16,0,80')!)).toEqual({ left: '16px', top: '80px' });
    expect(layoutStyle('Size', decode('u2:1,-20,0,16')!)).toEqual({ width: 'calc(100% + -20px)', height: '16px' });
    expect(layoutStyle('AnchorPoint', decode('v2:0.5,0.5')!)).toEqual({ transform: 'translate(-50%, -50%)' });
    expect(calc(0.5, 0)).toBe('50%');
  });
  it('warna, transparansi, font, alignment, corner', () => {
    expect(rgba([1, 0, 0], 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(rgba([2, -1, 0], 2)).toBe('rgba(255, 0, 0, 0)'); // dijepit
    expect(fontStyle('GothamBold').fontWeight).toBe('700');
    expect(fontStyle('Code').fontFamily).toContain('mono');
    expect([alignX('Enum.TextXAlignment.Left'), alignY('Enum.TextYAlignment.Bottom')]).toEqual(['flex-start', 'flex-end']);
    expect(cornerRadius(decode('u:0,8')!)).toBe('8px');
    expect(cornerRadius(decode('u:1,0')!)).toBe('9999px');
  });
});

describe('stage.ts aman', () => {
  const src = readFileSync('lib/lualab/stage.ts', 'utf8').replace(/\/\/.*$/gm, '');
  it('tidak memakai innerHTML / insertAdjacentHTML / eval / document.write', () => {
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval(', 'new Function', 'document.write']) expect(src.includes(bad), bad).toBe(false);
  });
  it('bundel Fengari browser tanpa eval/Function (CSP tanpa unsafe-eval tetap jalan) dan tanpa akses fs/child_process', () => {
    const b = readFileSync('lib/lualab/vendor/fengari.browser.js', 'utf8');
    expect(/\beval\(|new Function\(/.test(b)).toBe(false);
    expect(/require\(["'](fs|child_process|tmp)["']\)/.test(b)).toBe(false);
  });
});
