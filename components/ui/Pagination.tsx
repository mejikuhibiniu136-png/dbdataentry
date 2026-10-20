'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';

// Hook paginasi sisi klien. Halaman otomatis dijepit saat jumlah item berubah (mis. filter).
export function usePagination<T>(items: T[], pageSize = 25) {
  const [requested, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requested, pages);
  const slice = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page, pages, slice, setPage, from: items.length === 0 ? 0 : (page - 1) * pageSize + 1, to: Math.min(items.length, page * pageSize), total: items.length, pageSize };
}

export function Pagination({ page, pages, total, from, to, onPage }: { page: number; pages: number; total: number; from: number; to: number; onPage: (p: number) => void }) {
  const { tr, n } = useI18n();
  if (total === 0) return null;
  return (
    <nav className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-xs text-slate-300" aria-label={tr('Paginasi')}>
      <span aria-live="polite">{n(from)}–{n(to)} / {n(total)}</span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={tr('Halaman sebelumnya')}><ChevronLeft className="size-3.5" aria-hidden /></Button>
        <span className="tabular min-w-16 text-center" aria-current="page">{page} / {pages}</span>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={tr('Halaman berikutnya')}><ChevronRight className="size-3.5" aria-hidden /></Button>
      </div>
    </nav>
  );
}
