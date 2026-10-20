'use client';
import { Loader2, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { apiJson } from '@/lib/client';
import type { Notify } from '@/components/views/system/format';
import type { EncryptionStatus } from '@/types';

const PREVIOUS_LABEL = { unset: 'Tidak diatur', valid: 'Terisi', invalid: 'Tidak valid' } as const; // diterjemahkan saat render

// Rotasi ENCRYPTION_KEY tanpa kehilangan secret: kunci lama dititipkan di ENCRYPTION_KEY_PREVIOUS,
// lalu secret dienkripsi ulang dengan kunci baru lewat tombol di sini.
export function EncryptionPanel({ ready, status, toast, onChanged }: { ready: boolean; status: EncryptionStatus; toast: Notify; onChanged: () => void }) {
  const { tr } = useI18n();
  const [working, setWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canRotate = ready && status.previousKey === 'valid' && status.stale > 0;

  // Alasan tombol nonaktif ditampilkan, bukan dibiarkan misterius.
  const blocked = !ready ? tr('ENCRYPTION_KEY belum diatur di Vercel.') : status.previousKey !== 'valid' ? tr('Isi ENCRYPTION_KEY_PREVIOUS dengan kunci lama (hex 64 karakter), lalu redeploy.') : status.stale === 0 ? tr('Semua secret sudah memakai kunci saat ini. Tidak ada yang perlu dirotasi.') : null;

  const rotate = async () => {
    setConfirmOpen(false);
    setWorking(true);
    try {
      const res = await apiJson<{ data: { rotated: number; alreadyCurrent: number; failed: number } }>('/api/admin/encryption/rotate', 'POST');
      const { rotated, failed } = res.data;
      toast(failed > 0 ? tr('{n} secret dienkripsi ulang, {f} gagal', { n: rotated, f: failed }) : tr('{n} secret dienkripsi ulang', { n: rotated }), failed > 0 ? 'error' : 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('Gagal mengenkripsi ulang'), 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="glass p-5">
      <h3 className="mb-1 text-sm font-semibold text-white">{tr('Rotasi kunci enkripsi')}</h3>
      <p className="mb-4 text-xs text-slate-500">{tr('Mengganti ENCRYPTION_KEY tanpa kehilangan Webhook Secret.')}</p>
      <ul className="mb-4 space-y-2 text-sm">
        <li className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-slate-200">ENCRYPTION_KEY</span><Pill tone={ready ? 'ok' : 'bad'}>{ready ? tr('Terisi') : tr('Belum diatur')}</Pill></li>
        <li className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-slate-200">ENCRYPTION_KEY_PREVIOUS</span><Pill tone={status.previousKey === 'invalid' ? 'bad' : status.previousKey === 'valid' ? 'accent' : 'neutral'}>{tr(PREVIOUS_LABEL[status.previousKey])}</Pill></li>
        <li className="flex items-center justify-between gap-3"><span className="text-slate-300">{tr('Secret masih pakai kunci lama')}</span><Pill tone={status.stale > 0 ? 'warn' : 'neutral'}>{status.stale}</Pill></li>
        <li className="flex items-center justify-between gap-3"><span className="text-slate-300">{tr('Secret tidak bisa dibuka')}</span><Pill tone={status.undecryptable > 0 ? 'bad' : 'neutral'}>{status.undecryptable}</Pill></li>
      </ul>
      {status.undecryptable > 0 && <p className="mb-3 text-xs text-rose-300">{tr('Ada secret yang tidak bisa dibuka oleh kunci mana pun. Pulihkan kunci yang benar di Vercel, atau isi ulang Webhook Secret.')}</p>}
      {status.previousKey === 'invalid' && <p className="mb-3 text-xs text-rose-300">{tr('ENCRYPTION_KEY_PREVIOUS harus berupa hex 64 karakter.')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!canRotate || working} onClick={() => setConfirmOpen(true)} aria-busy={working}>
          {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
          {working ? tr('Merotasi kunci…') : tr('Rotasi kunci enkripsi')}
        </Button>
        {blocked && !working && <span className="text-xs text-slate-500">{blocked}</span>}
        {working && <span className="text-xs text-cyan-300" role="status">{tr('Mengenkripsi ulang secret, jangan tutup halaman ini.')}</span>}
      </div>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={tr('Rotasi kunci enkripsi?')}>
        <p className="mb-3 text-sm leading-relaxed text-slate-300">
          {tr('{n} secret akan dienkripsi ulang dari kunci lama ke ENCRYPTION_KEY saat ini. Proses aman diulang dan secret tetap terbaca selama berjalan.', { n: status.stale })}
        </p>
        <p className="mb-5 text-xs leading-relaxed text-amber-300/90">{tr('Setelah selesai dan angka "masih pakai kunci lama" menjadi 0, hapus ENCRYPTION_KEY_PREVIOUS di Vercel lalu redeploy. Aksi ini dicatat di audit log.')}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmOpen(false)} autoFocus>{tr('Batal')}</Button>
          <Button variant="primary" onClick={() => void rotate()}><RotateCw className="size-4" aria-hidden />{tr('Ya, rotasi sekarang')}</Button>
        </div>
      </Modal>
      <details className="mt-4 text-xs leading-relaxed text-slate-400">
        <summary className="cursor-pointer text-slate-300">{tr('Cara memutar kunci')}</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>{tr('Buat kunci baru:')} <code className="break-all text-slate-300">node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;</code></li>
          <li>{tr('Di Vercel, salin nilai ENCRYPTION_KEY yang lama ke ENCRYPTION_KEY_PREVIOUS, isi ENCRYPTION_KEY dengan kunci baru, lalu redeploy.')}</li>
          <li>{tr('Buka halaman ini dan klik Enkripsi ulang sekarang. Selama itu, Webhook Secret tetap terbaca.')}</li>
          <li>{tr('Setelah angka "masih pakai kunci lama" menjadi 0, hapus ENCRYPTION_KEY_PREVIOUS dan redeploy.')}</li>
        </ol>
      </details>
    </section>
  );
}
