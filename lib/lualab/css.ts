// Pemetaan murni nilai Roblox (string "tag:isi" dari prelude) -> CSS. Tanpa DOM, jadi bisa diuji di vitest.
export type Val =
  | { k: 'n'; v: number } | { k: 'b'; v: boolean } | { k: 's'; v: string }
  | { k: 'u2'; v: [number, number, number, number] } | { k: 'u'; v: [number, number] }
  | { k: 'v2'; v: [number, number] } | { k: 'c'; v: [number, number, number] } | { k: 'e'; v: string };

const nums = (s: string, n: number): number[] | null => {
  const a = s.split(',').map(Number);
  return a.length === n && a.every(Number.isFinite) ? a : null;
};

export function decode(raw: string): Val | null {
  const i = raw.indexOf(':');
  if (i < 0) return null;
  const tag = raw.slice(0, i);
  const body = raw.slice(i + 1);
  switch (tag) {
    case 'n': { const v = Number(body); return Number.isFinite(v) ? { k: 'n', v } : null; }
    case 'b': return { k: 'b', v: body === '1' };
    case 's': return { k: 's', v: body };
    case 'e': return { k: 'e', v: body };
    case 'u2': { const a = nums(body, 4); return a ? { k: 'u2', v: a as [number, number, number, number] } : null; }
    case 'u': { const a = nums(body, 2); return a ? { k: 'u', v: a as [number, number] } : null; }
    case 'v2': { const a = nums(body, 2); return a ? { k: 'v2', v: a as [number, number] } : null; }
    case 'c': { const a = nums(body, 3); return a ? { k: 'c', v: a as [number, number, number] } : null; }
    default: return null;
  }
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;
export const calc = (scale: number, offset: number) => (scale === 0 ? px(offset) : offset === 0 ? pct(scale) : `calc(${pct(scale)} + ${px(offset)})`);

export function rgba(c: [number, number, number] | undefined, transparency = 0): string {
  const [r, g, b] = (c ?? [0, 0, 0]).map((x) => Math.round(Math.min(Math.max(x, 0), 1) * 255));
  return `rgba(${r}, ${g}, ${b}, ${Math.round((1 - Math.min(Math.max(transparency, 0), 1)) * 1000) / 1000})`;
}

export const DEFAULT_BG: [number, number, number] = [163 / 255, 162 / 255, 165 / 255];
export const GUI_CLASSES = new Set(['Frame', 'TextLabel', 'TextButton', 'ImageLabel', 'ImageButton', 'ScrollingFrame', 'TextBox', 'CanvasGroup']);
export const BUTTON_CLASSES = new Set(['TextButton', 'ImageButton']);

/** Gaya posisi/ukuran dari UDim2 + AnchorPoint. */
export function layoutStyle(prop: string, v: Val): Record<string, string> | null {
  if (prop === 'Position' && v.k === 'u2') return { left: calc(v.v[0], v.v[1]), top: calc(v.v[2], v.v[3]) };
  if (prop === 'Size' && v.k === 'u2') return { width: calc(v.v[0], v.v[1]), height: calc(v.v[2], v.v[3]) };
  if (prop === 'AnchorPoint' && v.k === 'v2') return { transform: v.v[0] === 0 && v.v[1] === 0 ? '' : `translate(${pct(-v.v[0])}, ${pct(-v.v[1])})` };
  return null;
}

export function fontStyle(font: string): Record<string, string> {
  const name = font.replace(/^Font\./, '');
  const mono = /Code|Mono|Courier|Consolas/i.test(name);
  const weight = /Black|Heavy/i.test(name) ? '800' : /Bold|Semi/i.test(name) ? '700' : /Medium/i.test(name) ? '500' : '400';
  return { fontFamily: mono ? 'var(--font-mono, ui-monospace, monospace)' : 'var(--font-sans, Inter, system-ui, sans-serif)', fontWeight: weight };
}

export const alignX = (e: string) => (/Left/.test(e) ? 'flex-start' : /Right/.test(e) ? 'flex-end' : 'center');
export const alignY = (e: string) => (/Top/.test(e) ? 'flex-start' : /Bottom/.test(e) ? 'flex-end' : 'center');

export function cornerRadius(v: Val): string | null {
  if (v.k !== 'u') return null;
  const [scale, offset] = v.v;
  return scale >= 0.5 ? '9999px' : scale > 0 ? `calc(${pct(scale)} + ${px(offset)})` : px(offset);
}
