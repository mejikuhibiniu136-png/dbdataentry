import { getSession } from '@/lib/server/auth';
import { json, unauthorized } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return json({ username: session.u });
}
