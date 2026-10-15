import { requireAdmin } from '@/lib/auth/session';
import { getAdminConfig } from '@/lib/env';
import { errorResponse, json } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { listUsers, readDevices, userKey } from '@/lib/users';
import type { UserSummary } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;
    const redis = getRedis();
    const users = await listUsers(redis);

    // Admin berasal dari env (bukan users:*), tetapi login-nya tetap dicatat dan ditampilkan.
    const admin = getAdminConfig();
    const adminRow: UserSummary = {
      username: admin.username,
      role: 'admin',
      createdAt: null,
      lastLogin: (await readDevices(redis, userKey(admin.username), 1))[0] ?? null,
    };
    return json({ success: true, data: [adminRow, ...users] });
  } catch (err) {
    return errorResponse(err, 'admin/users GET');
  }
}
