import { describe, expect, it, vi } from 'vitest';
import { MAX_CAS_RETRIES, casWriteAccount, pushLog, quarantinePayload, recordEvent } from '@/lib/server/store';

function fakeRedis({ evalResults }) {
  const calls = [];
  const queue = [...evalResults];
  return {
    calls,
    hget: vi.fn(async () => null),
    eval: vi.fn(async (script, keys, args) => {
      calls.push(args);
      return queue.length ? queue.shift() : 1;
    }),
    multi() {
      const ops = [];
      return {
        lpush: (...a) => ops.push(['lpush', ...a]),
        ltrim: (...a) => ops.push(['ltrim', ...a]),
        exec: async () => {
          calls.push(ops);
          return ops.map(() => 1);
        },
      };
    },
  };
}

describe('casWriteAccount', () => {
  it('kalah balapan dua kali lalu berhasil: build dipanggil ulang tiap percobaan', async () => {
    const redis = fakeRedis({ evalResults: [0, 0, 1] });
    const build = vi.fn(() => ({ account: { rev: 1 }, logData: null }));
    const r = await casWriteAccount(redis, 'u', build);
    expect(r.attempts).toBe(3);
    expect(build).toHaveBeenCalledTimes(3);
    expect(redis.calls.every((args) => args[1] === '-1')).toBe(true); // akun baru: expectedRev -1
  }, 10_000);

  it('selalu kalah: percobaan terakhir menulis tanpa syarat (-2), data tidak dibuang', async () => {
    const redis = fakeRedis({ evalResults: Array(MAX_CAS_RETRIES).fill(0) });
    const r = await casWriteAccount(redis, 'u', () => ({ account: { rev: 1 }, logData: { id: 'x' } }));
    expect(r.attempts).toBe(MAX_CAS_RETRIES + 1);
    expect(redis.calls.at(-1)[1]).toBe('-2');
  }, 30_000);
});

describe('recordEvent', () => {
  it('tanpa username: hanya log, lewat transaksi push+trim', async () => {
    const redis = fakeRedis({ evalResults: [] });
    const { logData, account } = await recordEvent(redis, {
      payload: { content: 'halo' },
      eventType: 'X',
      startedAt: Date.now(),
    });
    expect(account).toBeNull();
    expect(logData.eventType).toBe('X');
    expect(redis.eval).not.toHaveBeenCalled();
    expect(redis.calls[0].map((o) => o[0])).toEqual(['lpush', 'ltrim']);
  });

  it('dengan username: akun dan log ditulis dalam satu EVAL', async () => {
    const redis = fakeRedis({ evalResults: [1] });
    const { account } = await recordEvent(redis, {
      payload: { username: 'Tester', event: 'Aktif' },
      eventType: 'Aktif',
      startedAt: Date.now(),
    });
    expect(account.username).toBe('Tester');
    expect(redis.eval).toHaveBeenCalledTimes(1);
    const args = redis.calls[0];
    expect(JSON.parse(args[2]).rev).toBe(1);
    expect(JSON.parse(args[3]).eventType).toBe('Aktif');
  });
});

describe('quarantine & pushLog', () => {
  it('karantina memotong raw menjadi 4096 karakter', async () => {
    const redis = fakeRedis({ evalResults: [] });
    const e = await quarantinePayload(redis, { reason: 'x', raw: 'a'.repeat(9000), ip: '1.2.3.4' });
    expect(e.raw).toHaveLength(4096);
    await pushLog(redis, { id: 1 });
  });
});
