// Regresi: respons PUT /api/admin/settings harus punya bentuk yang sama dengan GET
// (termasuk encryptionReady), karena klien mengganti seluruh state dengan hasil PUT.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, string> = {};
const fakeRedis = {
  hgetall: async () => ({ ...store }),
  hset: async (_k: string, obj: Record<string, string>) => void Object.assign(store, obj),
  hdel: async (_k: string, f: string) => void delete store[f],
};

vi.mock('@/lib/auth/session', () => ({ requireSuperadmin: async () => ({ denied: null }) }));
vi.mock('@/lib/redis', () => ({ getRedis: () => fakeRedis }));

const { GET, PUT } = await import('@/app/api/admin/settings/route');
const put = (body: unknown) => PUT(new Request('http://t/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) }));

describe('admin/settings: encryptionReady konsisten GET vs PUT', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('ENCRYPTION_KEY valid: GET dan PUT sama-sama encryptionReady=true', async () => {
    expect((await (await GET()).json()).encryptionReady).toBe(true);
    const body = await (await put({ luaObfuscationEnabled: true })).json();
    expect(body.success).toBe(true);
    expect(body.encryptionReady).toBe(true);
  });

  it('ENCRYPTION_KEY tidak ada: PUT melaporkan false (bukan undefined)', async () => {
    delete process.env.ENCRYPTION_KEY;
    const body = await (await put({ maintenanceMode: true })).json();
    expect(body.encryptionReady).toBe(false);
  });
});
