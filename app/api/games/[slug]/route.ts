import { requireAdmin } from '@/lib/auth/session';
import { deleteGame, renameGame } from '@/lib/games';
import { errorResponse, json, readJson } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { renameGameSchema } from '@/schemas/game';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };
const SLUG = /^[a-z0-9-]{1,64}$/;

// Admin: mengubah nama tabel (data log ikut dipindahkan).
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;
    const { slug } = await params;
    if (!SLUG.test(slug)) return json({ success: false, message: 'Slug tidak valid' }, 400);
    const parsed = renameGameSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) return json({ success: false, message: parsed.error.issues[0]?.message ?? 'Nama tidak valid' }, 400);
    return json({ success: true, data: await renameGame(getRedis(), slug, parsed.data.name) });
  } catch (err) {
    return errorResponse(err, 'games PATCH');
  }
}

// Admin: menghapus tabel beserta seluruh lognya.
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;
    const { slug } = await params;
    if (!SLUG.test(slug)) return json({ success: false, message: 'Slug tidak valid' }, 400);
    await deleteGame(getRedis(), slug);
    return json({ success: true });
  } catch (err) {
    return errorResponse(err, 'games DELETE');
  }
}
