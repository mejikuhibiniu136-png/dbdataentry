import { requireSuperadmin } from '@/lib/auth/session';
import { errorResponse, json } from '@/lib/http';
import { generateApiKey } from '@/lib/keys';
import { getRedis } from '@/lib/redis';
import { writeSecretSetting, clearSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Superadmin: buat API Key baru (menggantikan yang lama bila ada). Nilai plain HANYA
// dikembalikan sekali di response ini; setelahnya hanya tersimpan terenkripsi di Redis.
export async function POST() {
  try {
    const { denied } = await requireSuperadmin();
    if (denied) return denied;
    const apiKey = generateApiKey();
    await writeSecretSetting(getRedis(), 'API_KEY', apiKey);
    return json({ success: true, apiKey });
  } catch (err) {
    return errorResponse(err, 'admin/apikey POST');
  }
}

// Superadmin: cabut API Key yang aktif.
export async function DELETE() {
  try {
    const { denied } = await requireSuperadmin();
    if (denied) return denied;
    await clearSetting(getRedis(), 'API_KEY');
    return json({ success: true });
  } catch (err) {
    return errorResponse(err, 'admin/apikey DELETE');
  }
}
