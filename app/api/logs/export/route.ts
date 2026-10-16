import { requireSession } from '@/lib/auth/session';
import { errorResponse, json } from '@/lib/http';
import { readLogs } from '@/lib/ingest/store';
import { logsToCsv } from '@/lib/logStats';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9-]{1,64}$/;
const MAX_EXPORT = 5000; // sama dengan batas atas LOG_MAX_PER_TABLE / LOG_MAX_STREAM

// Ekspor PENUH dari server (semua log yang tersimpan, bukan hanya yang dimuat di layar).
// ?game=<slug>|all &format=csv|json
export async function GET(request: Request) {
  try {
    const { denied } = await requireSession();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const game = params.get('game') ?? 'all';
    if (game !== 'all' && !SLUG.test(game)) return json({ success: false, message: 'Parameter game tidak valid' }, 400);
    const format = params.get('format') === 'json' ? 'json' : 'csv';

    const logs = await readLogs(getRedis(), game, MAX_EXPORT);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const body = format === 'json' ? JSON.stringify(logs, null, 2) : logsToCsv(logs);
    return new Response(body, {
      headers: {
        'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="logs-${game}-${stamp}.${format}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(err, 'logs/export GET');
  }
}
