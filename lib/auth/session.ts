// Sesi sisi server (runtime Node.js). Jangan diimpor dari proxy.ts.
import { cookies } from 'next/headers';
import { forbidden, unauthorized } from '@/lib/http';
import { tryGetJwtSecret } from '@/lib/env';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/jwt';
import type { SessionClaims } from '@/types';

export async function getSession(): Promise<SessionClaims | null> {
  const secret = tryGetJwtSecret();
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token, secret) : null;
}

type Guard = { session: SessionClaims; denied?: undefined } | { session?: undefined; denied: Response };

export async function requireSession(): Promise<Guard> {
  const session = await getSession();
  return session ? { session } : { denied: unauthorized() };
}

// Hanya role admin: pembersihan log, manajemen tabel, konfigurasi sistem.
export async function requireAdmin(): Promise<Guard> {
  const session = await getSession();
  if (!session) return { denied: unauthorized() };
  if (session.role !== 'admin') return { denied: forbidden() };
  return { session };
}
