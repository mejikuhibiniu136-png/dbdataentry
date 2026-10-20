import { Tr } from '@/components/i18n/Tr';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="glass max-w-sm space-y-4 p-7 text-center">
        <h1 className="text-lg font-semibold text-white"><Tr text="404 · Tidak ditemukan" /></h1>
        <p className="text-sm text-slate-400"><Tr text="Halaman yang Anda cari tidak ada." /></p>
        <Link href="/" className="inline-block rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-sm font-semibold text-slate-950"><Tr text="Kembali ke dashboard" /></Link>
      </div>
    </main>
  );
}
