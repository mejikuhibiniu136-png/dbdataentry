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

// Disajikan sebagai teks biasa untuk game:HttpGet. Tanpa cookie, tanpa rahasia.
// Proteksi/obfuscation (fitur 1) dikontrol sakelar Superadmin (config:settings di Redis);
// bila Redis tidak terjangkau, gagal aman ke skrip tanpa obfuscation agar executor tetap jalan.
export async function GET(request: Request) {
  let obfuscate = false;
  try {
    obfuscate = await readLuaObfuscationEnabled(getRedis());
  } catch {
    obfuscate = false;
  }
  const lua = renderAccountStatusLua(`${originOf(request)}/api/receiver/universal`, { obfuscate });
  return new Response(lua, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
