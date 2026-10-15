import { requireSuperadmin } from '@/lib/auth/session';
import { setReceiverEnabled } from '@/lib/ingest/store';
import { HttpError, errorResponse, json, readJson } from '@/lib/http';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Admin: saklar On/Off penerima webhook. Saat OFF, payload diabaikan dan dijawab 202.
export async function POST(request: Request) {
  try {
    const { denied } = await requireSuperadmin();
    if (denied) return denied;
    const { enabled } = await readJson(request, 1024);
    if (typeof enabled !== 'boolean') throw new HttpError(400, 'Field "enabled" harus true atau false');
    await setReceiverEnabled(getRedis(), enabled);
    return json({ success: true, enabled });
  } catch (err) {
    return errorResponse(err, 'system/receiver');
  }
}
