import { renderAccountStatusLua } from '@/lib/lua/accountStatus';

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
export function GET(request: Request) {
  const lua = renderAccountStatusLua(`${originOf(request)}/api/receiver/universal`);
  return new Response(lua, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
