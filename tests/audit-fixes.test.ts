// Regresi untuk perbaikan audit keamanan: batas akun terlacak, throttle log kebocoran, pepper HWID.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { writeAccountAndLog } from '@/lib/ingest/store';
import { KEYS } from '@/lib/keys';
import { readLeaks, recordLeak } from '@/lib/scriptguard/binding';
import { hwidDigest } from '@/lib/scriptguard/hwid';
import type { TrackedAccount } from '@/types';
import { connectTestRedis } from './helpers/redis';

const conn = await connectTestRedis();
const d = conn ? describe : describe.skip;
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const P1 = 'c'.repeat(64);
const P2 = 'd'.repeat(64);

d('perbaikan audit (Redis sungguhan)', () => {
  // describe.skip tetap menjalankan callback ini saat koleksi: jangan melempar bila Redis tidak ada.
  const { redis, raw } = conn ?? ({} as NonNullable<typeof conn>);
  beforeEach(async () => {
    await raw.flushdb();
    process.env.MAX_TRACKED_ACCOUNTS = '50';
  });
  afterAll(async () => {
    delete process.env.MAX_TRACKED_ACCOUNTS;
    await raw.quit();
  });

  const game = { slug: 'g', name: 'G', metaJson: '{}', isNew: true };
  const acc = (username: string, rev: number) => ({ username, rev } as unknown as TrackedAccount);

  it('T2: akun baru ditolak 429 setelah batas, tetapi akun yang sudah ada tetap bisa diperbarui', async () => {
    for (let i = 0; i < 50; i += 1) await writeAccountAndLog(redis, game, `u${i}`, () => ({ account: acc(`u${i}`, 1), log: null }));
    await expect(writeAccountAndLog(redis, game, 'u-baru', () => ({ account: acc('u-baru', 1), log: null }))).rejects.toMatchObject({ status: 429 });
    expect(Number(await raw.hlen(KEYS.trackerAccounts))).toBe(50);
    await writeAccountAndLog(redis, game, 'u0', () => ({ account: acc('u0', 2), log: null }));
    expect(JSON.parse((await raw.hget(KEYS.trackerAccounts, 'u0'))!).rev).toBe(2);
  });

  it('S3: log kebocoran dibatasi per pemilik lisensi (HWID acak tidak membanjiri log)', async () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5' });
    for (let i = 0; i < 25; i += 1) await recordLeak(redis, { reason: 'hwid_mismatch', source: 'report', uid: 'abcdef012345', observedHw: `${i}`.padStart(32, '0'), headers });
    expect((await readLeaks(redis, 100)).length).toBe(20);
    expect(Number(await raw.hget(KEYS.leakStats, 'hwid_mismatch:suppressed'))).toBe(5);
  });
});

describe('S5: pepper HWID terpisah dari ENCRYPTION_KEY', () => {
  it('rotasi ENCRYPTION_KEY tidak mengubah digest bila HWID_PEPPER diisi; ganti pepper mengubahnya', () => {
    const hw = 'HWID-PERANGKAT-1';
    expect(hwidDigest(hw, { ENCRYPTION_KEY: A, HWID_PEPPER: P1 })).toBe(hwidDigest(hw, { ENCRYPTION_KEY: B, HWID_PEPPER: P1 }));
    expect(hwidDigest(hw, { ENCRYPTION_KEY: A, HWID_PEPPER: P1 })).not.toBe(hwidDigest(hw, { ENCRYPTION_KEY: A, HWID_PEPPER: P2 }));
  });
  it('tanpa HWID_PEPPER: perilaku lama (turunan ENCRYPTION_KEY) tetap sama', () => {
    const hw = 'HWID-PERANGKAT-1';
    expect(hwidDigest(hw, { ENCRYPTION_KEY: A })).toBe(hwidDigest(hw, { ENCRYPTION_KEY: A, HWID_PEPPER: '' }));
    expect(hwidDigest(hw, { ENCRYPTION_KEY: A })).not.toBe(hwidDigest(hw, { ENCRYPTION_KEY: B }));
  });
});
