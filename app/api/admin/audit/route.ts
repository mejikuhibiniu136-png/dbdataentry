import { readAudit } from '@/lib/audit';
import { requireSuperadmin } from '@/lib/auth/session';
import { clampInt, errorResponse, json } from '@/lib/http';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Superadmin: jejak audit terbaru. ?limit=1..200 (bawaan 50); ?from=&to= (ISO) menyaring rentang waktu
export async function GET(request: Request) {
  try {
    const { denied } = await requireSuperadmin();
    if (denied) return denied;
    const limit = clampInt(new URL(request.url).searchParams.get('limit'), 1, 200, 50);
    const params = new URL(request.url).searchParams;
    const ms = (v: string | null) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : undefined; };
    return json({ success: true, data: await readAudit(getRedis(), limit, { fromMs: ms(params.get('from')), toMs: ms(params.get('to')) }) });
  } catch (err) {
    return errorResponse(err, 'admin/audit GET');
  }
}
