import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // proxy.ts sudah mengarahkan tamu ke /login; pemeriksaan ini lapisan kedua.
  const session = await getSession();
  if (!session) redirect('/login');
  return <Dashboard username={session.sub} role={session.role} />;
}
