import { cookies } from 'next/headers';
import { json } from '@/lib/server/http';
import { SESSION_COOKIE } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ success: true });
}
