'use client';
import { Loader2, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { apiJson } from '@/lib/client';
import type { Notify } from '@/components/views/system/format';
import type { EncryptionStatus } from '@/types';

const PREVIOUS_LABEL = { unset: 'Tidak diatur', valid: 'Terisi', invalid: 'Tidak valid' } as const;

// Rotasi ENCRYPTION_KEY tanpa kehilangan secret: kunci lama dititipkan di ENCRYPTION_KEY_PREVIOUS,
// lalu secret dienkripsi ulang dengan kunci baru lewat tombol di sini.
export function EncryptionPanel({ ready, status, toast, onChanged }: { ready: boolean; status: EncryptionStatus; toast: Notify; onChanged: () => void }) {
  const [working, setWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canRotate = ready && status.previousKey === 'valid' && status.stale > 0;

  // Alasan tombol nonaktif ditampilkan, bukan dibiarkan misterius.
  const blocked = !ready ? 'ENCRYPTION_KEY belum diatur di Vercel.' : status.previousKey !== 'valid' ? 'Isi ENCRYPTION_KEY_PREVIOUS dengan kunci lama (hex 64 karakter), lalu redeploy.' : status.stale === 0 ? 'Semua secret sudah memakai kunci saat ini. Tidak ada yang perlu dirotasi.' : null;

  const rotate = async () => {
    setConfirmOpen(false);
    setWorking(true);
    try {
      const res = await apiJson<{ data: { rotated: number; alreadyCurrent: number; failed: number } }>('/api/admin/encryption/rotate', 'POST');
      const { rotated, failed } = res.data;
      toast(failed > 0 ? `${rotated} secret dienkripsi ulang, ${failed} gagal` : `${rotated} secret dienkripsi ulang`, failed > 0 ? 'error' : 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mengenkripsi ulang', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="glass p-5">
      <h3 className="mb-1 text-sm font-semibold text-white">Rotasi kunci enkripsi</h3>
      <p className="mb-4 text-xs text-slate-500">Mengganti <code className="text-slate-300">ENCRYPTION_KEY</code> tanpa kehilangan Webhook Secret.</p>
      <ul className="mb-4 space-y-2 text-sm">
        <li className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-slate-200">ENCRYPTION_KEY</span><Pill tone={ready ? 'ok' : 'bad'}>{ready ? 'Terisi' : 'Belum diatur'}</Pill></li>
        <li className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-slate-200">ENCRYPTION_KEY_PREVIOUS</span><Pill tone={status.previousKey === 'invalid' ? 'bad' : status.previousKey === 'valid' ? 'accent' : 'neutral'}>{PREVIOUS_LABEL[status.previousKey]}</Pill></li>
        <li className="flex items-center justify-between gap-3"><span className="text-slate-300">Secret masih pakai kunci lama</span><Pill tone={status.stale > 0 ? 'warn' : 'neutral'}>{status.stale}</Pill></li>
        <li className="flex items-center justify-between gap-3"><span className="text-slate-300">Secret tidak bisa dibuka</span><Pill tone={status.undecryptable > 0 ? 'bad' : 'neutral'}>{status.undecryptable}</Pill></li>
      </ul>
      {status.undecryptable > 0 && <p className="mb-3 text-xs text-rose-300">Ada secret yang tidak bisa dibuka oleh kunci mana pun. Pulihkan kunci yang benar di Vercel, atau isi ulang Webhook Secret.</p>}
      {status.previousKey === 'invalid' && <p className="mb-3 text-xs text-rose-300">ENCRYPTION_KEY_PREVIOUS harus berupa hex 64 karakter.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!canRotate || working} onClick={() => setConfirmOpen(true)} aria-busy={working}>
          {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
          {working ? 'Merotasi kunci…' : 'Rotasi kunci enkripsi'}
        </Button>
        {blocked && !working && <span className="text-xs text-slate-500">{blocked}</span>}
        {working && <span className="text-xs text-cyan-300" role="status">Mengenkripsi ulang secret, jangan tutup halaman ini.</span>}
      </div>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Rotasi kunci enkripsi?">
        <p className="mb-3 text-sm leading-relaxed text-slate-300">
          {status.stale} secret akan dienkripsi ulang dari kunci lama ke <code className="text-slate-100">ENCRYPTION_KEY</code> saat ini. Proses aman diulang dan secret tetap terbaca selama berjalan.
        </p>
        <p className="mb-5 text-xs leading-relaxed text-amber-300/90">Setelah selesai dan angka &quot;masih pakai kunci lama&quot; menjadi 0, hapus <code>ENCRYPTION_KEY_PREVIOUS</code> di Vercel lalu redeploy. Aksi ini dicatat di audit log.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmOpen(false)} autoFocus>Batal</Button>
          <Button variant="primary" onClick={() => void rotate()}><RotateCw className="size-4" aria-hidden />Ya, rotasi sekarang</Button>
        </div>
      </Modal>
      <details className="mt-4 text-xs leading-relaxed text-slate-400">
        <summary className="cursor-pointer text-slate-300">Cara memutar kunci</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Buat kunci baru: <code className="break-all text-slate-300">node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;</code></li>
          <li>Di Vercel, salin nilai <code className="text-slate-300">ENCRYPTION_KEY</code> yang lama ke <code className="text-slate-300">ENCRYPTION_KEY_PREVIOUS</code>, isi <code className="text-slate-300">ENCRYPTION_KEY</code> dengan kunci baru, lalu redeploy.</li>
          <li>Buka halaman ini dan klik <em>Enkripsi ulang sekarang</em>. Selama itu, Webhook Secret tetap terbaca.</li>
          <li>Setelah angka &quot;masih pakai kunci lama&quot; menjadi 0, hapus <code className="text-slate-300">ENCRYPTION_KEY_PREVIOUS</code> dan redeploy.</li>
        </ol>
      </details>
    </section>
  );
}
