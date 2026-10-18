// Operasi admin untuk HWID & watermark (khusus Superadmin lewat izin apikeys:manage).
//   GET    ?keyId=<id>  -> kebocoran terbaru (+ perangkat terdaftar bila keyId diberikan)
//   DELETE ?keyId=<id>  -> reset binding (pengguna ganti perangkat)
//   POST   {token}      -> telusuri salinan skrip bocor: buka token watermark di dalamnya
import { z } from 'zod';
import { actorOf, recordAudit } from '@/lib/audit';
import { isApiKeyActive } from '@/lib/apikeys';
import { HttpError, clampInt, errorResponse, json, readJson } from '@/lib/http';
import { requirePermission } from '@/lib/rbac/guard';
import { getRedis } from '@/lib/redis';
import { listBindings, readLeaks, resetHwidBindings } from '@/lib/scriptguard/binding';
import { isSameOrigin } from '@/lib/scriptguard/origin';
import { openWatermark } from '@/lib/scriptguard/watermark';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY_ID = /^[0-9a-f]{12}$/;
const keyIdOf = (request: Request): string => {
  const id = new URL(request.url).searchParams.get('keyId') ?? '';
  if (!KEY_ID.test(id)) throw new HttpError(400, 'keyId tidak valid');
  return id;
};

export async function GET(request: Request) {
  try {
    const { denied } = await requirePermission('apikeys:manage');
    if (denied) return denied;
    const redis = getRedis();
    const url = new URL(request.url);
    const leaks = await readLeaks(redis, clampInt(url.searchParams.get('limit'), 1, 200, 50));
    const keyId = url.searchParams.get('keyId');
    return json({ success: true, data: { leaks, bindings: keyId ? await listBindings(redis, keyIdOf(request)) : undefined } });
  } catch (err) {
    return errorResponse(err, 'admin/hwid GET');
  }
}

export async function DELETE(request: Request) {
  try {
    const { session, denied } = await requirePermission('apikeys:manage');
    if (denied) return denied;
    if (!isSameOrigin(request)) throw new HttpError(403, 'Origin tidak diizinkan');
    const redis = getRedis();
    const keyId = keyIdOf(request);
    const removed = await resetHwidBindings(redis, keyId);
    await recordAudit(redis, { ...actorOf(session, request.headers), action: 'hwid.reset', target: keyId, detail: removed ? 'binding dihapus' : 'tidak ada binding' });
    return json({ success: true, removed: removed > 0 });
  } catch (err) {
    return errorResponse(err, 'admin/hwid DELETE');
  }
}

const traceSchema = z.object({ token: z.string().min(20).max(2048) });

export async function POST(request: Request) {
  try {
    const { denied } = await requirePermission('apikeys:manage');
    if (denied) return denied;
    if (!isSameOrigin(request)) throw new HttpError(403, 'Origin tidak diizinkan');
    const parsed = traceSchema.safeParse(await readJson(request, 4 * 1024));
    if (!parsed.success) throw new HttpError(400, 'Token wajib diisi');
    const p = openWatermark(parsed.data.token.trim());
    if (!p) throw new HttpError(422, 'Token bukan watermark dari server ini (palsu / diubah / kunci enkripsi berbeda)');
    return json({
      success: true,
      data: { keyId: p.uid, keyActive: await isApiKeyActive(getRedis(), p.uid), issuedAt: new Date(p.ts).toISOString(), jti: p.jti, deviceHw: p.hw.slice(0, 8) },
    });
  } catch (err) {
    return errorResponse(err, 'admin/hwid POST');
  }
}
