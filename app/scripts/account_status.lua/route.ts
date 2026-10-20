import { getClientIp } from '@/lib/http';
import { KEYS } from '@/lib/keys';
import { renderAccountStatusLua } from '@/lib/lua/accountStatus';
import { hitRateLimit } from '@/lib/rateLimit';
import { getRedis } from '@/lib/redis';
import { composePublicLua, readLuaModules, readPublicGuard } from '@/lib/scriptguard/compose';
import { issuePublicToken, publicControlEnabled } from '@/lib/scriptguard/publicToken';
import { readLuaObfuscationEnabled } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // membaca lua/*.lua lewat fs

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
  // SCRIPT_PUBLIC_ENABLED=off mematikan jalur publik (tanpa key/HWID) sehingga hanya loader berlisensi yang bisa mengambil skrip.
  // Bawaan: aktif (kompatibel dengan skrip yang sudah terpasang).
  if (['0', 'false', 'off', 'no'].includes((process.env.SCRIPT_PUBLIC_ENABLED ?? '').trim().toLowerCase())) {
    return new Response('-- Skrip publik dinonaktifkan. Gunakan loader berlisensi.\n', {
      status: 410,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  // Render + obfuscate per request itu mahal dan anonim: batasi per IP. Redis bermasalah -> tetap dilayani.
  try {
    const rl = await hitRateLimit(getRedis(), KEYS.rateLimit('script-pub', getClientIp(request.headers)), { limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      return new Response('-- rate limited\n', { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  } catch (err) {
    console.error('[scripts/account_status.lua] rate limit tidak dapat diperiksa:', err instanceof Error ? err.message : err);
  }

  const endpoint = `${originOf(request)}/api/receiver/universal`;

  let obfuscate = false;
  try {
    obfuscate = await readLuaObfuscationEnabled(getRedis());
  } catch (err) {
    console.error('[scripts/account_status.lua] gagal membaca LUA_OBFUSCATION_ENABLED, fallback ke skrip polos:', err);
  }

  const main = renderAccountStatusLua(endpoint, { obfuscate });

  // Kanal kontrol (Pause/Resume/Kill dari dashboard) ikut dirakit ke skrip publik. Tanpa ini, tombol kontrol di
  // dashboard menerbitkan perintah yang tidak pernah diambil siapa pun. Gagal merakit (kunci enkripsi belum diset,
  // berkas modul hilang) -> fail open ke skrip tanpa kontrol, supaya skrip tetap bisa diambil executor.
  let lua = main;
  let control = false;
  if (publicControlEnabled()) {
    try {
      const [mods, guardPublic] = await Promise.all([readLuaModules(), readPublicGuard()]);
      lua = composePublicLua({ guardPublic, control: mods.control }, { token: issuePublicToken().token, base: originOf(request) }, main);
      control = true;
    } catch (err) {
      console.error('[scripts/account_status.lua] kanal kontrol tidak dirakit, melayani skrip tanpa kontrol:', err);
    }
  }

  return new Response(lua, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Tanpa cache di mana pun (CDN, browser, proxy): perubahan toggle Proteksi Skrip Lua harus
      // langsung terlihat di pemuatan berikutnya, dan kunci XOR + nama variabel acak harus baru
      // di setiap permintaan. Header CDN-spesifik memastikan Vercel tidak menyimpannya.
      'Cache-Control': 'no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Untuk diagnosis: curl -I menunjukkan versi mana yang disajikan.
      'X-Script-Protection': obfuscate ? 'on' : 'off',
      'X-Script-Control': control ? 'on' : 'off',
    },
  });
}
