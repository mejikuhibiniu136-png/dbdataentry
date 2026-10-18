// Analitik universal: tabel otomatis per jenis event, tanpa asumsi game tertentu.
import { describe, expect, it } from 'vitest';
import { computeInsights, extractFacts, parseCompactNumber } from '@/lib/logInsights';
import type { LogEntry } from '@/types';

let n = 0;
const log = (payload: Record<string, unknown>, extra: Partial<LogEntry> = {}): LogEntry => ({
  id: `l${++n}`, game: 'g', gameName: 'G', eventType: 'Webhook', payload, format: 'json', bytes: 1,
  processingTimeMs: 1, receivedAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), ...extra,
});

describe('parseCompactNumber', () => {
  it('angka murni dan sufiks ringkas; teks bukan angka = null', () => {
    expect(parseCompactNumber('12')).toBe(12);
    expect(parseCompactNumber('x3')).toBe(3);
    expect(parseCompactNumber('1,200')).toBe(1200);
    expect(parseCompactNumber('1.5M')).toBe(1_500_000);
    expect(parseCompactNumber('Megalodon')).toBeNull();
    expect(parseCompactNumber('1/50k')).toBeNull();
  });
});

describe('extractFacts', () => {
  it('field embed, baris deskripsi, dan field JSON datar', () => {
    const facts = extractFacts({
      embeds: [{ title: 'x', fields: [{ name: 'Fish', value: '**Megalodon**' }], description: 'Weight: 120\nLuck: x2' }],
      content: 'Zone: Deep Sea',
      level: 7,
      stats: { coins: 5 },
    });
    const m = Object.fromEntries(facts.map((f) => [f.key, f.num ?? f.value]));
    expect(m).toMatchObject({ Fish: 'Megalodon', Weight: 120, Luck: 2, Zone: 'Deep Sea', level: 7, 'stats coins': 5 });
  });
});

describe('computeInsights', () => {
  it('game baru dengan event "rare fish" langsung jadi tabel sendiri; heartbeat/online/offline tidak', () => {
    const logs = [
      log({ type: 'account_status', username: 'a', event: 'Heartbeat' }),
      log({ type: 'account_status', username: 'a', event: 'Online' }),
      log({ username: 'budi', embeds: [{ title: 'Rare Fish Caught!', description: 'Fish: Megalodon\nWeight: 120' }] }),
      log({ username: 'budi', embeds: [{ title: 'Rare Fish Caught!', description: 'Fish: Kraken\nWeight: 300' }] }),
      log({ username: 'sari', content: 'Boss Defeated: Dragon (1/50k)' }),
    ];
    const s = computeInsights(logs.reverse()); // Redis menyimpan log terbaru di depan (LPUSH)
    expect(s.systemEvents).toBe(2);
    expect(s.gameEvents).toBe(3);
    expect(s.categories.map((c) => c.label)).toEqual(['Rare Fish Caught!', 'Boss Defeated']);
    const fish = s.categories[0];
    expect(fish.count).toBe(2);
    expect(fish.columns).toEqual(expect.arrayContaining(['Fish', 'Weight']));
    expect(fish.rows[0].cells.Fish).toBe('Kraken'); // log terbaru di atas
    expect(s.metrics.find((m) => m.name === 'Weight')?.max).toBe(300);
  });

  it('judul beda hanya di peluang/angka = satu kategori', () => {
    const s = computeInsights([
      log({ username: 'a', embeds: [{ title: 'New Unit! 1/50k!' }] }),
      log({ username: 'a', embeds: [{ title: 'New Unit! 1/2M!' }] }),
    ]);
    expect(s.categories).toHaveLength(1);
    expect(s.categories[0].count).toBe(2);
  });

  it('tanpa log game: kosong, tidak melempar', () => {
    const s = computeInsights([log({ type: 'account_status', username: 'a', event: 'Offline' })]);
    expect(s.categories).toEqual([]);
    expect(s.gameEvents).toBe(0);
  });
});
