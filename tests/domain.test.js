import { describe, expect, it } from 'vitest';
import { accountPayloadSchema, gameWebhookSchema } from '@/lib/domain/schemas';
import { sanitizeDeep } from '@/lib/domain/sanitize';
import { mergeAccount } from '@/lib/domain/accounts';

const luaPayload = {
  username: 'Tester',
  displayName: 'Test Er',
  state: 'ONLINE',
  gameName: 'Anime Dice',
  userId: 12345,
  placeId: 987654321,
  jobId: 'abc-def',
  event: 'Aktif',
  latencyMs: 142,
  sessionStart: '2026-10-15T01:00:00Z',
  timestamp: '2026-10-15T01:00:20Z',
  avatarUrl: 'https://www.roblox.com/headshot-thumbnail/image?userId=1',
};

describe('accountPayloadSchema (strict)', () => {
  it('menerima payload Lua dan mengubah angka menjadi string', () => {
    const r = accountPayloadSchema.safeParse(luaPayload);
    expect(r.success).toBe(true);
    expect(r.data.userId).toBe('12345');
    expect(r.data.placeId).toBe('987654321');
  });

  it('menolak tanpa username, username berbahaya, latensi negatif, avatar http', () => {
    expect(accountPayloadSchema.safeParse({ ...luaPayload, username: undefined }).success).toBe(false);
    expect(accountPayloadSchema.safeParse({ ...luaPayload, username: '__proto__' }).success).toBe(false);
    expect(accountPayloadSchema.safeParse({ ...luaPayload, latencyMs: -1 }).success).toBe(false);
    expect(accountPayloadSchema.safeParse({ ...luaPayload, avatarUrl: 'http://x.test/a.png' }).success).toBe(false);
  });

  it('membuang field tak dikenal (lastUpdate dari klien tidak dipercaya)', () => {
    const r = accountPayloadSchema.safeParse({ ...luaPayload, lastUpdate: '1999-01-01T00:00:00Z', evil: 1 });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('lastUpdate');
    expect(r.data).not.toHaveProperty('evil');
  });

  it('state tidak peka huruf besar-kecil', () => {
    expect(accountPayloadSchema.parse({ ...luaPayload, state: 'offline' }).state).toBe('OFFLINE');
  });
});

describe('gameWebhookSchema (lenient)', () => {
  it('struktur berubah: field salah tipe dibuang, payload tetap lolos', () => {
    const r = gameWebhookSchema.safeParse({
      content: 12345,
      embeds: 'bukan array',
      username: 'bot',
      fieldBaru: { a: 1 },
    });
    expect(r.success).toBe(true);
    expect(r.data.content).toBeUndefined();
    expect(r.data.embeds).toBeUndefined();
    expect(r.data.username).toBe('bot');
    expect(r.data.fieldBaru).toEqual({ a: 1 });
  });

  it('embed rusak menjadi object kosong, embed baik tetap utuh', () => {
    const r = gameWebhookSchema.parse({ embeds: [{ title: 'Rare!', color: 255 }, 'rusak', { title: 5 }] });
    expect(r.embeds[0]).toMatchObject({ title: 'Rare!', color: 255 });
    expect(r.embeds[1]).toEqual({});
    expect(r.embeds[2].title).toBeUndefined();
  });

  it('bukan object -> gagal (akan dikarantina oleh handler)', () => {
    expect(gameWebhookSchema.safeParse([1, 2]).success).toBe(false);
    expect(gameWebhookSchema.safeParse('x').success).toBe(false);
  });
});

describe('sanitizeDeep', () => {
  it('membuang kunci berbahaya dan karakter kontrol', () => {
    const evil = JSON.parse('{"__proto__":{"polluted":1},"a":"x\\u0000y","constructor":2,"ok":true}');
    const clean = sanitizeDeep(evil);
    expect(Object.keys(clean).sort()).toEqual(['a', 'ok']);
    expect(clean.a).toBe('xy');
    expect({}.polluted).toBeUndefined();
  });

  it('membatasi kedalaman, panjang string, dan nilai non-JSON', () => {
    let deep = { v: 1 };
    for (let i = 0; i < 20; i += 1) deep = { n: deep };
    expect(JSON.stringify(sanitizeDeep(deep)).length).toBeLessThan(200);
    expect(sanitizeDeep({ s: 'a'.repeat(10000) }).s).toHaveLength(4096);
    expect(sanitizeDeep({ f: () => 1, n: NaN, i: Infinity, ok: 1 })).toEqual({ ok: 1 });
  });

  it('input bukan object menghasilkan {}', () => {
    expect(sanitizeDeep(null)).toEqual({});
    expect(sanitizeDeep([1, 2])).toEqual({});
    expect(sanitizeDeep('x')).toEqual({});
  });
});

describe('mergeAccount', () => {
  const now = Date.parse('2026-10-15T01:00:30Z');

  it('memakai latencyMs dari klien, mengisi state/sessionStart/rev', () => {
    const acc = mergeAccount(null, accountPayloadSchema.parse(luaPayload), { nowMs: now, latencyMs: 9 });
    expect(acc).toMatchObject({
      username: 'Tester',
      state: 'ONLINE',
      status: 'ONLINE',
      latencyMs: 142,
      sessionStart: '2026-10-15T01:00:00.000Z',
      rev: 1,
    });
    expect(acc.lastUpdate).toBe(new Date(now).toISOString());
  });

  it('tanpa latencyMs klien memakai waktu pemrosesan server (null bukan 0)', () => {
    const { latencyMs, ...rest } = luaPayload;
    expect(mergeAccount(null, { ...rest, latencyMs: null }, { nowMs: now, latencyMs: 37 }).latencyMs).toBe(37);
    expect(mergeAccount(null, rest, { nowMs: now, latencyMs: 37 }).latencyMs).toBe(37);
  });

  it('event Offline / state OFFLINE menandai OFFLINE; rev bertambah', () => {
    const first = mergeAccount(null, luaPayload, { nowMs: now });
    const off = mergeAccount(first, { username: 'Tester', event: 'Offline', state: 'OFFLINE' }, { nowMs: now + 1000 });
    expect(off.state).toBe('OFFLINE');
    expect(off.rev).toBe(2);
    expect(off.gameName).toBe('Anime Dice'); // dipertahankan dari data lama
  });
});
