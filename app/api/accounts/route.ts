import { requireAdmin, requireSession } from '@/lib/auth/session';
import { applyOfflineTimeout, normalizeUsername } from '@/lib/accounts';
import { deleteAccount, readAccounts } from '@/lib/ingest/store';
import { HttpError, errorResponse, json } from '@/lib/http';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { denied } = await requireSession();
    if (denied) return denied;
    const now = Date.now();
    return json({ success: true, data: (await readAccounts(getRedis())).map((a) => applyOfflineTimeout(a, now)) });
  } catch (err) {
    return errorResponse(err, 'accounts GET');
  }
}

// Admin: menghapus satu akun dari daftar tracker. ?username=...
export async function DELETE(request: Request) {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;
    const username = normalizeUsername(new URL(request.url).searchParams.get('username'));
    if (!username) throw new HttpError(400, 'Username tidak valid');
    if (!(await deleteAccount(getRedis(), username))) throw new HttpError(404, 'Akun tidak ditemukan');
    return json({ success: true });
  } catch (err) {
    return errorResponse(err, 'accounts DELETE');
  }
}
