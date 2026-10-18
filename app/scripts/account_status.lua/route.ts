import { renderAccountStatusLua } from '@/lib/lua/accountStatus';
import { getRedis } from '@/lib/redis';
import { readLuaObfuscationEnabled } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Origin dari domain yang sedang melayani request (Vercel mengisi x-forwarded-host/proto).
function originOf(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    return `${proto === 'http' ? 'http' : 'https'}://${host}`;
  }
  return new URL(request.url).origin;
}

// Disajikan sebagai teks biasa untuk game:HttpGet. Tanpa cookie, tanpa API key dari pengguna:
// toggle LUA_OBFUSCATION_ENABLED (Pengaturan Sistem, khusus Superadmin) menentukan apakah
// server menyajikan source asli atau versi ter-obfuscate. Gagal baca Redis -> fail open ke
// source polos, supaya skrip tetap bisa diambil executor walau Redis sedang bermasalah.
export async function GET(request: Request) {
  const endpoint = `${originOf(request)}/api/receiver/universal`;

  let obfuscate = false;
  try {
    obfuscate = await readLuaObfuscationEnabled(getRedis());
  } catch (err) {
    console.error('[scripts/account_status.lua] gagal membaca LUA_OBFUSCATION_ENABLED, fallback ke skrip polos:', err);
  }

  const lua = renderAccountStatusLua(endpoint, { obfuscate });

  return new Response(lua, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Obfuscation aktif -> kunci XOR & nama variabel acak dibangkitkan ulang tiap render, jadi
      // cache dipersingkat (30 dtk) supaya bentuk skrip yang beredar publik ikut berotasi dan
      // perubahan toggle Superadmin cepat terlihat. Nonaktif -> cache seperti semula (60 dtk).
      'Cache-Control': obfuscate ? 'public, max-age=30, s-maxage=30' : 'public, max-age=60, s-maxage=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
