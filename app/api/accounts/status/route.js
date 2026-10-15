import { getSession, requireReceiverKey } from '@/lib/server/auth';
import { HttpError, errorResponse, json, readJsonObject, unauthorized } from '@/lib/server/http';
import { normalizeUsername } from '@/lib/domain/accounts';
import { accountPayloadSchema } from '@/lib/domain/schemas';
import { getRedis } from '@/lib/server/redis';
import { deleteAccount, readAccounts, upsertAccount } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

// Dashboard: daftar akun (butuh sesi login). Akun tanpa heartbeat > 45 detik ditandai OFFLINE.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const data = await readAccounts(getRedis());
    return json({ success: true, data });
  } catch (err) {
    return errorResponse(err, 'accounts/status GET');
  }
}

// Script: memperbarui status satu akun (butuh API key receiver).
export async function POST(request) {
  try {
    const denied = await requireReceiverKey(request);
    if (denied) return denied;

    const body = await readJsonObject(request);
    const parsed = accountPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Payload tidak valid: username wajib dan tipe field harus benar');
    }

    const account = await upsertAccount(getRedis(), parsed.data);
    return json({ success: true, data: account });
  } catch (err) {
    return errorResponse(err, 'accounts/status POST');
  }
}

// Dashboard: menghapus satu akun dari daftar (butuh sesi login).
export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const { username } = await readJsonObject(request, 1024);
    if (!normalizeUsername(username)) {
      throw new HttpError(400, 'Username tidak valid');
    }

    const removed = await deleteAccount(getRedis(), username);
    if (!removed) throw new HttpError(404, 'Akun tidak ditemukan');
    return json({ success: true });
  } catch (err) {
    return errorResponse(err, 'accounts/status DELETE');
  }
}
