// Semua teks yang dibungkus tr('…') di komponen harus punya terjemahan en/ja/zh, dengan placeholder {x} yang sama.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/literals/en';
import { ja } from '@/lib/i18n/literals/ja';
import { zh } from '@/lib/i18n/literals/zh';
import { durationParts, formatDuration } from '@/lib/i18n/format';
import { timeAgo } from '@/lib/logStats';

const ROOT = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  if (n === 'node_modules' || n === '.next') return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
});

// tr('literal'...) / tr(`literal`...) dengan literal polos (tanpa ${}).
function usedLiterals(): { text: string; file: string }[] {
  const out: { text: string; file: string }[] = [];
  const re = /\btr\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
  for (const file of [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))]) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      out.push({ text: raw.replace(/\\(['"`\\$])/g, '$1').replace(/\\n/g, '\n'), file: path.relative(ROOT, file) });
    }
  }
  return out;
}
const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('terjemahan literal tr()', () => {
  const used = usedLiterals();
  it('ada pemakaian tr() yang terdeteksi', () => { expect(used.length).toBeGreaterThan(200); });
  it.each([['en', en], ['ja', ja], ['zh', zh]] as const)('semua literal punya terjemahan %s dengan placeholder sama', (_n, dict) => {
    const missing = [...new Set(used.map((u) => u.text))].filter((t) => !dict[t]);
    expect(missing).toEqual([]);
    const bad = Object.entries(dict).filter(([k, v]) => !v.trim() || ph(k) !== ph(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe('durasi', () => {
  it('detik / menit+detik / jam+menit+detik / hari+jam+menit, satuan nol dibuang', () => {
    expect(formatDuration('id', 27)).toBe('27 dtk');
    expect(formatDuration('id', 65)).toBe('1 mnt 5 dtk');
    expect(formatDuration('id', 3600)).toBe('1 jam');
    expect(formatDuration('id', 3605)).toBe('1 jam 5 dtk');
    expect(formatDuration('id', 27190)).toBe('7 jam 33 mnt 10 dtk');
    expect(formatDuration('en', 27190)).toBe('7 h 33 m 10 s');
    expect(formatDuration('ja', 27190)).toBe('7時間33分10秒');
    expect(formatDuration('zh', 27190)).toBe('7小时33分10秒');
    expect(formatDuration('id', 90061)).toBe('1 hari 1 jam 1 mnt');
    expect(formatDuration('id', 0)).toBe('0 dtk');
    expect(formatDuration('id', -5)).toBe('0 dtk');
    expect(formatDuration('id', Number.NaN)).toBe('0 dtk');
  });
  it('maksimal 3 satuan', () => { expect(durationParts('en', 10 * 86400 + 3 * 3600 + 7 * 60 + 9)).toHaveLength(3); });
});

describe('timeAgo mengikuti bahasa', () => {
  it('tanpa locale tetap format Indonesia lama; dengan locale memakai Intl', () => {
    expect(timeAgo(0, 30_000)).toBe('30 dtk lalu');
    expect(timeAgo(0, 30_000, 'en')).toMatch(/30 seconds ago/);
    expect(timeAgo(0, 30_000, 'ja')).toMatch(/30\s?秒前/);
  });
});
