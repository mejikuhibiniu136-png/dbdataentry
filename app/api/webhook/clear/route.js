import { getSession } from '@/lib/auth';
import { ACCOUNT_KEY, LOG_KEY } from '@/lib/constants';
import { errorResponse, json, unauthorized } from '@/lib/http';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    // Hapus riwayat log webhook dan seluruh status akun dalam satu perintah.
    await getRedis().del(LOG_KEY, ACCOUNT_KEY);

    return json({
      success: true,
      message: 'Riwayat log dan data status akun berhasil dibersihkan total.',
    });
  } catch (err) {
    return errorResponse(err, 'webhook/clear');
  }
}
