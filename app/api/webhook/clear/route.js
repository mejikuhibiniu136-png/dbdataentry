import { getSession } from '@/lib/server/auth';
import { ACCOUNT_KEY, LOG_KEY, QUARANTINE_KEY } from '@/lib/domain/constants';
import { HttpError, errorResponse, json, readJsonObject, unauthorized } from '@/lib/server/http';
import { getRedis } from '@/lib/server/redis';

export const dynamic = 'force-dynamic';

const SCOPES = {
  all: { keys: [LOG_KEY, ACCOUNT_KEY, QUARANTINE_KEY], message: 'Riwayat log dan data status akun berhasil dibersihkan total.' },
  logs: { keys: [LOG_KEY], message: 'Riwayat log berhasil dibersihkan.' },
  accounts: { keys: [ACCOUNT_KEY], message: 'Data status akun berhasil dibersihkan.' },
};

// Body opsional: { "scope": "all" | "logs" | "accounts" }. Tanpa body = "all" (kompatibel dengan versi lama).
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    let scope = 'all';
    const raw = await request.text();
    if (raw.trim()) {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, 'Body harus berupa JSON yang valid');
      }
      if (body && typeof body === 'object' && body.scope !== undefined) scope = body.scope;
    }
    if (typeof scope !== 'string' || !Object.prototype.hasOwnProperty.call(SCOPES, scope)) {
      throw new HttpError(400, 'scope harus "all", "logs", atau "accounts"');
    }

    const target = SCOPES[scope];
    await getRedis().del(...target.keys);
    return json({ success: true, scope, message: target.message });
  } catch (err) {
    return errorResponse(err, 'webhook/clear');
  }
}
