import { requireSuperadmin } from '@/lib/auth/session';
import { tryGetEncryptionKeyHex } from '@/lib/env';
import { errorResponse, json, readJson } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import { getRedis } from '@/lib/redis';
import { readSettings, writeSecretSetting, writeSetting } from '@/lib/settings';
import { settingsUpdateSchema } from '@/schemas/admin';

export const dynamic = 'force-dynamic';

// Superadmin: status pengaturan dinamis saat ini. Nilai sensitif TIDAK pernah dikirim ke
// klien, hanya flag "sudah diisi" (webhookSecretSet / apiKeySet).
export async function GET() {
  try {
    const { denied } = await requireSuperadmin();
    if (denied) return denied;
    const data = await readSettings(getRedis());
    return json({ success: true, data, encryptionReady: Boolean(tryGetEncryptionKeyHex()) });
  } catch (err) {
    return errorResponse(err, 'admin/settings GET');
  }
}

// Superadmin: perbarui pengaturan. WEBHOOK_SECRET dienkripsi AES-256-GCM sebelum disimpan;
// field lain disimpan langsung. Kirim string kosong pada webhookSecret untuk menghapusnya.
export async function PUT(request: Request) {
  try {
    const { denied } = await requireSuperadmin();
    if (denied) return denied;
    const parsed = settingsUpdateSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success) return json({ success: false, message: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, 400);

    const redis = getRedis();
    const { maintenanceMode, rateLimitPerMin, luaObfuscationEnabled, webhookSecret } = parsed.data;

    if (maintenanceMode !== undefined) await writeSetting(redis, 'MAINTENANCE_MODE', maintenanceMode);
    if (rateLimitPerMin !== undefined) await writeSetting(redis, 'RATE_LIMIT_PER_MIN', rateLimitPerMin);
    if (luaObfuscationEnabled !== undefined) await writeSetting(redis, 'LUA_OBFUSCATION_ENABLED', luaObfuscationEnabled);
    if (webhookSecret !== undefined) {
      if (webhookSecret === '') await redis.hdel(KEYS.settings, 'WEBHOOK_SECRET');
      else await writeSecretSetting(redis, 'WEBHOOK_SECRET', webhookSecret);
    }

    // Bentuk respons harus sama dengan GET: klien mengganti seluruh state dengan hasil PUT,
    // jadi tanpa encryptionReady input Webhook Secret ikut terkunci setelah toggle apa pun.
    return json({ success: true, data: await readSettings(redis), encryptionReady: Boolean(tryGetEncryptionKeyHex()) });
  } catch (err) {
    return errorResponse(err, 'admin/settings PUT');
  }
}
