'use client';
import { useI18n } from '@/components/i18n/I18nProvider';

/** Teks terjemahan untuk komponen server (tanpa hook): <Tr text="kalimat Indonesia" />. */
export function Tr({ text, params }: { text: string; params?: Record<string, string | number> }) {
  const { tr } = useI18n();
  return <>{tr(text, params)}</>;
}
