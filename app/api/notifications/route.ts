import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { markRead, readFeed } from '@/lib/announcements';
import { errorResponse, json, readJson } from '@/lib/http';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Semua pengguna yang login: riwayat pengumuman (sesuai role), jumlah belum dibaca, dan yang baru sejak login sebelumnya.
export async function GET() {
  try {
    const { session, denied } = await requireSession();
    if (denied) return denied;
    return json({ success: true, data: await readFeed(getRedis(), session.sub, session.role) });
  } catch (err) {
    return errorResponse(err, 'notifications GET');
  }
}

const readSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(100).optional() });

// Tandai terbaca: {ids:[...]} atau {} untuk semua.
export async function POST(request: Request) {
  try {
    const { session, denied } = await requireSession();
    if (denied) return denied;
    const parsed = readSchema.safeParse(await readJson(request, 8 * 1024));
    if (!parsed.success) return json({ success: false, message: 'Permintaan tidak valid' }, 400);
    const redis = getRedis();
    await markRead(redis, session.sub, session.role, parsed.data.ids);
    return json({ success: true, data: await readFeed(redis, session.sub, session.role) });
  } catch (err) {
    return errorResponse(err, 'notifications POST');
  }
}
