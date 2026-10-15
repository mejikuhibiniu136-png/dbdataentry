// Akun pengguna dashboard & riwayat perangkat (namespace users:*).
// Tidak ada fungsi di sini (atau di modul log) yang menghapus users:* secara massal.
import { KEYS } from '@/lib/keys';
import { HttpError, parseStored } from '@/lib/http';
import { hashPassword } from '@/lib/auth/password';
import type { RedisLike } from '@/lib/redis';
import type { DeviceEntry, UserSummary } from '@/types';

export const MAX_DEVICE_HISTORY = 50;

export interface StoredUser {
  username: string;
  passwordHash: string;
  role: 'user';
  createdAt: string;
}

// Username tidak peka huruf besar/kecil: "Alice" dan "alice" adalah akun yang sama.
export const userKey = (username: string) => username.trim().toLowerCase();

export async function getUser(redis: RedisLike, username: string): Promise<StoredUser | null> {
  const raw = await redis.get(KEYS.userAccount(userKey(username)));
  const user = parseStored<StoredUser>(raw);
  return user && typeof user.passwordHash === 'string' ? user : null;
}

// SET NX membuat pendaftaran serentak dengan username sama hanya berhasil satu kali.
export async function createUser(
  redis: RedisLike,
  username: string,
  password: string,
  reservedKeys: string[] = [],
  nowMs = Date.now()
): Promise<StoredUser> {
  const key = userKey(username);
  if (reservedKeys.includes(key)) throw new HttpError(409, 'Username tidak tersedia');

  const user: StoredUser = {
    username: username.trim(),
    passwordHash: await hashPassword(password),
    role: 'user',
    createdAt: new Date(nowMs).toISOString(),
  };
  const created = await redis.set(KEYS.userAccount(key), JSON.stringify(user), { nx: true });
  if (!created) throw new HttpError(409, 'Username tidak tersedia');
  await redis.zadd(KEYS.usersList, { score: nowMs, member: key });
  return user;
}

export async function recordDevice(redis: RedisLike, key: string, entry: DeviceEntry): Promise<void> {
  await redis.lpush(KEYS.userDevices(key), JSON.stringify(entry));
  await redis.ltrim(KEYS.userDevices(key), 0, MAX_DEVICE_HISTORY - 1);
}

export async function readDevices(redis: RedisLike, key: string, limit = MAX_DEVICE_HISTORY): Promise<DeviceEntry[]> {
  const raw = await redis.lrange(KEYS.userDevices(key), 0, Math.min(limit, MAX_DEVICE_HISTORY) - 1);
  return (raw ?? []).map((r) => parseStored<DeviceEntry>(r)).filter((d): d is DeviceEntry => d !== null);
}

// Daftar pengguna terdaftar + login terakhir. Admin (dari env) ditambahkan oleh pemanggil.
export async function listUsers(redis: RedisLike, limit = 200): Promise<UserSummary[]> {
  const keys = ((await redis.zrange(KEYS.usersList, 0, limit - 1, { rev: true })) ?? []).map(String);
  const rows = await Promise.all(
    keys.map(async (key) => {
      const [user, devices] = await Promise.all([
        redis.get(KEYS.userAccount(key)).then((r) => parseStored<StoredUser>(r)),
        readDevices(redis, key, 1),
      ]);
      if (!user) return null;
      return { username: user.username, role: 'user' as const, createdAt: user.createdAt, lastLogin: devices[0] ?? null };
    })
  );
  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
}
