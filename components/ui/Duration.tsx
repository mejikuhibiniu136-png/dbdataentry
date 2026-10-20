'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { durationParts } from '@/lib/i18n/format';

// Durasi rapi: angka besar + satuan kecil, membungkus ke baris berikutnya bila kartu sempit (tanpa overflow).
export function Duration({ seconds, className = '' }: { seconds: number; className?: string }) {
  const { locale } = useI18n();
  const parts = durationParts(locale, seconds);
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0 tabular-nums ${className}`} aria-label={parts.map((p) => `${p.value} ${p.unit}`).join(' ')}>
      {parts.map((p) => (
        <span key={p.unit} className="whitespace-nowrap" aria-hidden>
          {p.value}<span className="ml-0.5 text-[0.5em] font-medium text-slate-400">{p.unit}</span>
        </span>
      ))}
    </span>
  );
}
