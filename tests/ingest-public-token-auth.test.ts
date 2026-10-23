// Regresi: token publik (terbit anonim dari /scripts/account_status.lua) hanya identitas rate-limit/kontrol.
// Ia TIDAK boleh menggantikan WEBHOOK_INGEST_TOKEN / "Wajibkan API Key" pada jalur ingest.
import type IORedis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIngest } from '@/lib/ingest/handler';
import { __resetReceiverCache } from '@/lib/ingest/store';
import { __clearResolveCache } from '@/lib/games';
import { KEYS } from '@/lib/keys';
import { __resetRuntimeSettingsCache } from '@/lib/settings';
import { issuePublicToken } from '@/lib/scriptguard/publicToken';
import type { RedisLike } from '@/lib/redis';
import { connectTestRedis } from './helpers/redis';

const conn = await connectTestRedis();
const d = conn ? describe : describe.skip;

let redis: RedisLike;
let raw: IORedis;
let n = 0;
const post = (headers: Record<string, string>) =>
  handleIngest(
    new Request('http://t/api/receiver/universal', {
      method: 'POST',
      body: JSON.stringify({ game_name: 'G', event: 'x' }),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${(n += 1) % 250}.1`, ...headers },
    }),
    {},
    { redis }
  );

d('ingest: token publik vs kewajiban kredensial', () => {
  beforeAll(() => {
    vi.stubEnv('ENCRYPTION_KEY', 'a1'.repeat(32));
    redis = conn!.redis;
    raw = conn!.raw;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await raw?.flushdb();
    raw?.disconnect();
  });
  beforeEach(async () => {
    await raw.flushdb();
    __resetReceiverCache();
    __resetRuntimeSettingsCache();
    __clearResolveCache();
    delete process.env.WEBHOOK_INGEST_TOKEN;
  });

  it('WEBHOOK_INGEST_TOKEN diset: token publik tanpa kredensial ditolak 401', async () => {
    vi.stubEnv('WEBHOOK_INGEST_TOKEN', 'rahasia-ingest');
    const res = await post({ 'x-wm': issuePublicToken().token });
    expect(res.status).toBe(401);
  });

  it('"Wajibkan API Key" aktif: token publik tanpa API Key ditolak 401', async () => {
    await raw.hset(KEYS.settings, 'API_KEY_REQUIRED', 'true');
    const res = await post({ 'x-wm': issuePublicToken().token });
    expect(res.status).toBe(401);
  });

  it('tanpa kewajiban kredensial: token publik tetap diterima (perilaku lama)', async () => {
    const res = await post({ 'x-wm': issuePublicToken().token });
    expect(res.status).toBe(200);
  });

  it('WEBHOOK_INGEST_TOKEN benar + token publik: diterima', async () => {
    vi.stubEnv('WEBHOOK_INGEST_TOKEN', 'rahasia-ingest');
    const res = await post({ 'x-wm': issuePublicToken().token, 'x-api-key': 'rahasia-ingest' });
    expect(res.status).toBe(200);
  });

  it.each(['on', 'true', '1', 'yes', ' ON '])('INGEST_REQUIRE_TOKEN=%j aktif: request tanpa token ditolak 401', async (v) => {
    vi.stubEnv('INGEST_REQUIRE_TOKEN', v);
    expect((await post({})).status).toBe(401);
  });

  it.each(['off', '0', 'false', ''])('INGEST_REQUIRE_TOKEN=%j mati: request anonim diterima', async (v) => {
    vi.stubEnv('INGEST_REQUIRE_TOKEN', v);
    expect((await post({})).status).toBe(200);
  });
});
