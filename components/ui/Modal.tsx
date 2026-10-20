'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';

export function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onClose]);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Modal responsif: kartu di tengah pada layar >= sm, lembar bawah (bottom sheet) pada ponsel.
// Fokus dikunci di dalam dialog, dikembalikan ke pemicu saat ditutup, dan gulir latar belakang dikunci.
// Semua gerak 150 ms; sheet hanya memakai opacity + translateY kecil.
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = panel.current;
    // Fokus awal: elemen autoFocus bila ada, jika tidak elemen fokus pertama, jika tidak panel itu sendiri.
    const raf = requestAnimationFrame(() => {
      if (!node || node.contains(document.activeElement)) return;
      (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();
    });
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); node.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', trap);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`sheet-panel ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}>
            <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-white/25 sm:hidden" aria-hidden />
            <h3 id={id} className="mb-3 flex-none text-lg font-semibold text-white">{title}</h3>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface ConfirmState { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }

export function ConfirmDialog({ dialog, onClose }: { dialog: ConfirmState | null; onClose: () => void }) {
  const { tr } = useI18n();
  const last = useRef<ConfirmState | null>(null);
  if (dialog) last.current = dialog;
  const d = dialog ?? last.current;
  return (
    <Modal open={Boolean(dialog)} onClose={onClose} title={d?.title ?? ''}>
      <p className="mb-5 text-sm leading-relaxed text-slate-200">{d?.message}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose} autoFocus>{tr('Batal')}</Button>
        <Button variant={d?.danger ? 'danger' : 'primary'} onClick={() => { onClose(); d?.onConfirm(); }}>{d?.confirmLabel ?? tr('Ya, lanjutkan')}</Button>
      </div>
    </Modal>
  );
}

// Dialog satu input teks (buat / ganti nama tabel).
export function NameDialog({ open, title, label, initial, submitLabel, onClose, onSubmit }: { open: boolean; title: string; label: string; initial: string; submitLabel: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const { tr } = useI18n();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setValue(initial); setError(''); } }, [open, initial]);
  const id = useId();

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await onSubmit(value); onClose(); } catch (err) { setError(err instanceof Error ? err.message : tr('Gagal')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-300">{label}</label>
          <input id={id} className="field" value={value} onChange={(e) => setValue(e.target.value)} maxLength={64} autoFocus required minLength={2} />
          {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" onClick={onClose}>{tr('Batal')}</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? tr('Menyimpan…') : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
