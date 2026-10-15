import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/jwt';
import { tryGetJwtSecret } from '@/lib/env';

// API yang boleh diakses tanpa sesi, per metode HTTP. Selain ini, semua /api/* wajib login
// (default tertutup); route handler memeriksa sesi + role sekali lagi di dalamnya.
const PUBLIC_API: Record<string, string[]> = {
  '/api/auth/login': ['POST'],
  '/api/auth/register': ['POST'],
  '/api/auth/logout': ['POST'],
};
// Penerima webhook terbuka untuk semua sumber (token opsional dicek di handler-nya).
const PUBLIC_API_PREFIXES = ['/api/receiver/'];
const PUBLIC_API_EXACT_ANY_METHOD = ['/api/webhook'];

const AUTH_PAGES = ['/login', '/register'];
// Skrip Lua dimuat executor tanpa cookie.
const PUBLIC_PATHS = ['/scripts/'];

const normalize = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

export async function proxy(request: NextRequest) {
  const pathname = normalize(request.nextUrl.pathname);
  const method = request.method.toUpperCase();

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = tryGetJwtSecret();
  const session = token && secret ? await verifySession(token, secret) : null;

  // ----- API -----
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const methods = Object.prototype.hasOwnProperty.call(PUBLIC_API, pathname) ? PUBLIC_API[pathname] : null;
    if (
      (methods && methods.includes(method)) ||
      PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
      PUBLIC_API_EXACT_ANY_METHOD.includes(pathname)
    ) {
      return NextResponse.next();
    }
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.next();
  }

  // ----- Halaman -----
  const isAuthPage = AUTH_PAGES.includes(pathname);
  if (!session && !isAuthPage) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token) response.cookies.delete(SESSION_COOKIE); // cookie lama / tidak valid
    return response;
  }
  if (session && isAuthPage) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
