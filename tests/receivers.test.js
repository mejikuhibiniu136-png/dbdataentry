import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { store: [], quarantine: [], rate: 0, evals: [] };

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({
    incr: async () => ++state.rate,
    expire: async () => 1,
    ttl: async () => 30,
    get: async () => null, // saklar receiver: default aktif
    hget: async () => null,
    eval: async (_s, _k, args) => {
      state.evals.push(args);
      return 1;
    },
    multi: () => {
      const ops = [];
      return {
        lpush: (key, value) => ops.push([key, value]),
        ltrim: () => {},
        exec: async () => {
          ops.forEach(([key, value]) => (key === 'webhook_quarantine' ? state.quarantine : state.store).push(JSON.parse(value)));
          return [];
        },
      };
    },
  }),
  REDIS_URL: 'x',
  REDIS_TOKEN: 'y',
}));

const KEY = 'k'.repeat(24);
const { handleDiceWebhook } = await import('@/lib/server/handlers/diceWebhook');
const { handleAccountHeartbeat } = await import('@/lib/server/handlers/accountHeartbeat');

const post = (url, body, headers = {}) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  process.env.RECEIVER_API_KEY = KEY;
  process.env.WEBHOOK_INGEST_TOKEN = 'ingest-token-0123456789';
  state.store = [];
  state.quarantine = [];
  state.rate = 0;
  state.evals = [];
});

describe('webhook Anime Dice (pihak ketiga)', () => {
  const url = '/api/receiver/dice?key=ingest-token-0123456789';

  it('token salah / kosong -> 401, RECEIVER_API_KEY tidak berlaku saat token ingest diset', async () => {
    expect((await handleDiceWebhook(post('/api/receiver/dice?key=salah', {}))).status).toBe(401);
    expect((await handleDiceWebhook(post('/api/receiver/dice', {}, { 'x-api-key': KEY }))).status).toBe(401);
  });

  it('payload normal tersimpan sebagai log, tidak menyentuh daftar akun', async () => {
    const res = await handleDiceWebhook(post(url, { username: 'bot', embeds: [{ title: 'Unit baru' }] }));
    expect(res.status).toBe(202);
    expect(state.store).toHaveLength(1);
    expect(state.store[0].eventType).toBe('Unit baru');
    expect(state.evals).toHaveLength(0);
  });

  it('struktur berubah total tidak membuat server error', async () => {
    const res = await handleDiceWebhook(post(url, { embeds: 'string', content: 123, deep: { a: { b: { c: 1 } } } }));
    expect(res.status).toBe(202);
    expect(state.store).toHaveLength(1);
  });

  it('bukan JSON dan bukan object -> 202 + karantina, bukan 500', async () => {
    expect((await handleDiceWebhook(post(url, 'payload_json=%7B%7D'))).status).toBe(202);
    expect((await handleDiceWebhook(post(url, [1, 2, 3]))).status).toBe(202);
    expect(state.quarantine).toHaveLength(2);
    expect(state.store).toHaveLength(0);
  });

  it('body terlalu besar -> 413', async () => {
    const res = await handleDiceWebhook(post(url, { content: 'a'.repeat(70_000) }));
    expect(res.status).toBe(413);
  });

  it('banjir request -> 429 dengan Retry-After', async () => {
    state.rate = 600;
    const res = await handleDiceWebhook(post(url, {}));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('100 request serentak: semua diterima, tidak ada yang hilang', async () => {
    state.rate = -1000; // abaikan rate limit untuk uji ini
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => handleDiceWebhook(post(url, { embeds: [{ title: `Roll ${i}` }] })))
    );
    expect(results.every((r) => r.status === 202)).toBe(true);
    expect(new Set(state.store.map((l) => l.id)).size).toBe(100);
  });
});

describe('status akun (script Lua)', () => {
  const body = { username: 'Tester', state: 'ONLINE', event: 'Aktif', latencyMs: 120, gameName: 'Anime Dice' };

  it('tanpa / dengan key salah -> 401', async () => {
    expect((await handleAccountHeartbeat(post('/api/receiver/account', body))).status).toBe(401);
    expect((await handleAccountHeartbeat(post('/api/receiver/account', body, { 'x-api-key': 'salah' }))).status).toBe(401);
  });

  it('payload valid -> 200, akun + log ditulis dalam satu EVAL', async () => {
    const res = await handleAccountHeartbeat(post('/api/receiver/account', body, { 'x-api-key': KEY }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, state: 'ONLINE' });
    expect(state.evals).toHaveLength(1);
    expect(JSON.parse(state.evals[0][2]).latencyMs).toBe(120);
  });

  it('payload salah bentuk -> 400 dengan daftar masalah, tidak ada yang tertulis', async () => {
    const res = await handleAccountHeartbeat(
      post('/api/receiver/account', { username: '', latencyMs: -5 }, { 'x-api-key': KEY })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).issues.length).toBeGreaterThan(0);
    expect(state.evals).toHaveLength(0);
  });
});
