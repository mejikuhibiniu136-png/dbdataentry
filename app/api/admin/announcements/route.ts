import { z } from 'zod';
import { actorOf, recordAudit } from '@/lib/audit';
import { deleteAnnouncement, postAnnouncement } from '@/lib/announcements';
import { requireSuperadmin } from '@/lib/auth/session';
import { HttpError, errorResponse, json, readJson } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { isSameOrigin } from '@/lib/scriptguard/origin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().max(600).default(''),
  audience: z.enum(['all', 'staff']).default('all'),
  level: z.enum(['info', 'warn', 'critical']).default('info'),
});

// Superadmin: terbitkan pengumuman. Muncul di lonceng semua pengguna (atau hanya staf) dan sebagai peringatan melayang setelah masuk.
export async function POST(request: Request) {
  try {
    const { session, denied } = await requireSuperadmin();
    if (denied) return denied;
    if (!isSameOrigin(request)) throw new HttpError(403, 'Origin tidak diizinkan');
    const parsed = schema.safeParse(await readJson(request, 4 * 1024));
    if (!parsed.success) throw new HttpError(400, 'Judul wajib (maks 100 karakter), isi maks 600 karakter');
    const redis = getRedis();
    const a = await postAnnouncement(redis, { by: session.sub, ...parsed.data });
    await recordAudit(redis, { ...actorOf(session, request.headers), action: 'announce.post', target: a.audience, detail: a.title });
    return json({ success: true, data: a });
  } catch (err) {
    return errorResponse(err, 'admin/announcements POST');
  }
}

// Superadmin: tarik pengumuman. ?id=<uuid>
export async function DELETE(request: Request) {
  try {
    const { session, denied } = await requireSuperadmin();
    if (denied) return denied;
    if (!isSameOrigin(request)) throw new HttpError(403, 'Origin tidak diizinkan');
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'id tidak valid');
    const redis = getRedis();
    if (!(await deleteAnnouncement(redis, id))) throw new HttpError(404, 'Pengumuman tidak ditemukan');
    await recordAudit(redis, { ...actorOf(session, request.headers), action: 'announce.delete', target: id });
    return json({ success: true });
  } catch (err) {
    return errorResponse(err, 'admin/announcements DELETE');
  }
}
