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

// PENTING — baca ini sebelum mengandalkan fungsi ini untuk apa pun yang sifatnya keamanan:
// User-Agent dikirim oleh KLIEN dan bisa diisi bebas oleh siapa pun (termasuk lewat `curl -A`
// atau `request.Headers` di executor). Ini BUKAN access control, cuma penyaring kasar supaya
// orang yang asal klik link di browser tidak langsung melihat source mentah. Siapa pun yang
// benar-benar mau mengambil source tetap bisa, tinggal ganti User-Agent requestnya.
//
// Heuristik: Roblox (baik HttpService resmi maupun hampir semua executor pihak ketiga) TIDAK
// mengirim User-Agent bergaya browser ("Mozilla/5.0 ..."); browser asli (Chrome/Firefox/Safari/
// Edge) selalu mengirimnya. Jadi: UA kosong ATAU tidak match pola browser -> anggap klien game,
// kirim script. UA cocok pola browser -> anggap orang buka link manual, kirim halaman netral.
const BROWSER_UA = /Mozilla\/5\.0|AppleWebKit|Gecko\/|Chrome\/|Safari\/|Firefox\/|Edg(e|A|iOS)?\//i;

function looksLikeBrowser(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BROWSER_UA.test(userAgent);
}

function decoyResponse(): Response {
  // Netral dan jujur, bukan konten menyesatkan — cukup supaya orang yang iseng buka URL di
  // browser tidak langsung disodori source Lua mentah untuk disalin.
  return new Response('Not found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(request: Request) {
  if (looksLikeBrowser(request.headers.get('user-agent'))) {
    return decoyResponse();
  }

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
      // Vary: User-Agent -> CDN/edge cache tidak boleh menyimpan satu respons lalu menyajikannya
      // silang ke kedua jenis klien (browser vs game), karena isinya beda per cabang di atas.
      'Cache-Control': obfuscate ? 'public, max-age=30, s-maxage=30' : 'public, max-age=60, s-maxage=60',
      Vary: 'User-Agent',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
