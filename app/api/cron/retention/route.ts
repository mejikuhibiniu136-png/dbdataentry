import { createHash, timingSafeEqual } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { errorResponse, json } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { purgeOldLogs } from '@/lib/retention';
import { readSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const sha = (s: string) => createHash('sha256').update(s).digest();

// Dipanggil Vercel Cron (vercel.json) tiap hari. Tanpa sesi dashboard: dijaga CRON_SECRET, yang
// otomatis dikirim Vercel sebagai "Authorization: Bearer <CRON_SECRET>". CRON_SECRET kosong = ditolak.
export async function GET(request: Request) {
  try {
    const secret = (process.env.CRON_SECRET ?? '').trim();
    if (!secret) return json({ success: false, message: 'CRON_SECRET belum diatur di Vercel' }, 503);
    const auth = request.headers.get('authorization') ?? '';
    const provided = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
    if (!provided || !timingSafeEqual(sha(provided), sha(secret))) return json({ success: false, message: 'Unauthorized' }, 401);

    const redis = getRedis();
    const { logRetentionDays } = await readSettings(redis);
    if (logRetentionDays <= 0) return json({ success: true, skipped: true, message: 'Retensi log nonaktif' });
    const result = await purgeOldLogs(redis, logRetentionDays);
    if (result.removed > 0) {
      await recordAudit(redis, { actor: 'cron', role: 'system', action: 'retention.purge', detail: `log > ${logRetentionDays} hari: ${result.removed} dihapus dari ${result.keys} tabel` });
    }
    return json({ success: true, data: result });
  } catch (err) {
    return errorResponse(err, 'cron/retention');
  }
}
