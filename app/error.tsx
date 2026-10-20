'use client';
import { createElement, useEffect } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }): any {
  const { tr } = useI18n();
  useEffect(() => { console.error(error); }, [error]);
  return createElement(
    'main',
    { className: 'grid min-h-dvh place-items-center p-4' },
    createElement(
      'div',
      { className: 'glass max-w-sm space-y-4 p-7 text-center' },
      createElement('h1', { className: 'text-lg font-semibold text-white' }, tr('Terjadi kesalahan')),
      createElement('p', { className: 'text-sm text-slate-400', role: 'alert' }, tr('Halaman gagal dimuat. Data Anda aman; coba muat ulang.')),
      createElement(
        'div',
        { className: 'flex justify-center gap-2' },
        createElement(Button, { variant: 'primary', onClick: () => reset(), children: tr('Coba lagi') }),
        createElement(Button, { onClick: () => { window.location.href = '/'; }, children: tr('Ke beranda') }),
      ),
    ),
  );
}
