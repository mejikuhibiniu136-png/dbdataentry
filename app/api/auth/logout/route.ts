import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth/jwt';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ success: true });
}
