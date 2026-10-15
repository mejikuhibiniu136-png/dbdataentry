import { NextResponse } from 'next/server';
import { SESSION_COOKIE, getSessionSecret, verifySessionToken } from '@/lib/server/session';

// Endpoint API yang boleh diakses tanpa sesi login, per metode HTTP.
// - login / logout: bagian dari alur login
// - receiver (webhook, game, status akun) menerima data dari script dan diperiksa
//   dengan RECEIVER_API_KEY di dalam route-nya masing-masing
// Semua endpoint API lain WAJIB memiliki sesi yang valid (default tertutup).
const PUBLIC_API = {
  '/api/login': ['POST'],
  '/api/logout': ['POST'],
  '/api/webhook': ['POST'],
  '/api/receiver/account': ['POST'],
  '/api/receiver/dice': ['POST'],
  '/api/receiver/game': ['POST'],
  '/api/accounts/status': ['POST'],
};

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export async function proxy(request) {
  const pathname = normalizePath(request.nextUrl.pathname);
  const method = request.method.toUpperCase();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = getSessionSecret();
  const session = token && secret ? await verifySessionToken(token, secret) : null;

  // ----- API -----
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const allowedMethods = Object.prototype.hasOwnProperty.call(PUBLIC_API, pathname)
      ? PUBLIC_API[pathname]
      : null;
    if (allowedMethods && allowedMethods.includes(method)) {
      return NextResponse.next();
    }
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.next();
  }

  // ----- Halaman -----
  const isLoginPage = pathname === '/login';

  if (!session && !isLoginPage) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token) response.cookies.delete(SESSION_COOKIE); // cookie lama / tidak valid
    return response;
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
