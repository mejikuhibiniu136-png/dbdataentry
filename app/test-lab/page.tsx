import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TestLab } from '@/components/testlab/TestLab';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Test Lab', robots: { index: false, follow: false } };

// Hanya staf (admin / superadmin) yang aktif: halaman ini mengirim data uji ke receiver dan menghapus akun uji.
// proxy.ts sudah menolak tamu; pemeriksaan ini lapisan kedua dan menyaring viewer.
export default async function TestLabPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'superadmin' && session.status !== 'active') redirect('/pending-approval');
  if (session.role !== 'superadmin' && session.role !== 'admin') redirect('/');
  return <TestLab username={session.sub} />;
}
