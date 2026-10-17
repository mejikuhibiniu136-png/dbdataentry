import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { getSession } from '@/lib/auth/session';
import { WELCOME_COOKIE } from '@/lib/welcome';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // proxy.ts sudah mengarahkan tamu ke /login dan akun belum aktif ke /pending-approval;
  // pemeriksaan ini lapisan kedua.
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'superadmin' && session.status !== 'active') redirect('/pending-approval');
  // Halaman penyambut tampil sekali per sesi browser (cookie dihapus saat logout).
  if ((await cookies()).get(WELCOME_COOKIE)?.value !== '1') redirect('/welcome');
  return <Dashboard username={session.sub} role={session.role} />;
}
