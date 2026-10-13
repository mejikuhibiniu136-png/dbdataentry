import { getSession } from '@/lib/auth';
import { HttpError, errorResponse, json, readJsonObject, unauthorized } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { readWebhookEnabled, setWebhookEnabled } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Status saklar saat ini (default aktif jika belum pernah diset).
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const enabled = await readWebhookEnabled(getRedis());
    return json({ success: true, enabled });
  } catch (err) {
    return errorResponse(err, 'webhook/toggle GET');
  }
}

// Ubah status On/Off. `enabled` harus boolean.
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const { enabled } = await readJsonObject(request, 1024);
    if (typeof enabled !== 'boolean') {
      throw new HttpError(400, 'Field "enabled" harus bernilai true atau false');
    }

    await setWebhookEnabled(getRedis(), enabled);
    return json({ success: true, enabled });
  } catch (err) {
    return errorResponse(err, 'webhook/toggle POST');
  }
}
