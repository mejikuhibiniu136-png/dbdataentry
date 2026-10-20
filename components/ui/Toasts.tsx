'use client';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { Toast } from '@/lib/client';

const ICON = { success: CheckCircle2, error: TriangleAlert, info: Info };
const TONE = { success: 'border-emerald-300/40 text-emerald-200', error: 'border-rose-300/40 text-rose-200', info: 'border-cyan-300/40 text-cyan-100' };
const MAX_VISIBLE = 3;

// Maksimal 3 toast tampil bersamaan (yang terbaru menang). Tiap toast hilang otomatis (lihat useToasts),
// bisa ditutup manual, dan diumumkan pembaca layar: error memakai role="alert", sisanya role="status".
// Tinggi toast tidak beranimasi sehingga tidak menggeser konten (fixed, di luar alur dokumen).
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss?: (id: number) => void }) {
  const { tr } = useI18n();
  const visible = toasts.slice(-MAX_VISIBLE);
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 lg:bottom-4" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {visible.map((t) => {
          const Icon = ICON[t.type];
          return (
            <motion.div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className={`glass pointer-events-auto flex w-full items-start gap-2.5 bg-slate-900/95 px-4 py-3 text-sm sm:w-96 ${TONE[t.type]}`}>
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 break-words text-slate-100">{t.message}</span>
              {onDismiss && (
                <button type="button" onClick={() => onDismiss(t.id)} aria-label={tr('Tutup')} className="touch-target -m-1 grid size-7 flex-none cursor-pointer place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white">
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
