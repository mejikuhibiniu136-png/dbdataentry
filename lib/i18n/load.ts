// Pemuat kamus per bahasa lewat import() dinamis: bundler memecahnya menjadi chunk terpisah, jadi
// klien hanya mengunduh bahasa yang dipakai (bukan keempatnya).
import type { Locale } from '@/lib/i18n/config';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries/en';

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import('@/lib/i18n/dictionaries/en').then((m) => m.en),
  id: () => import('@/lib/i18n/dictionaries/id').then((m) => m.id),
  ja: () => import('@/lib/i18n/dictionaries/ja').then((m) => m.ja),
  zh: () => import('@/lib/i18n/dictionaries/zh').then((m) => m.zh),
};

// Teks yang ditulis langsung di komponen (sumber: Bahasa Indonesia) diterjemahkan lewat tr(); terjemahannya digabung ke kamus
// yang sama, berkunci kalimat Indonesia aslinya. Locale 'id' tidak punya berkas literal: tr() mengembalikan kalimat aslinya.
const literalLoaders: Partial<Record<Locale, () => Promise<Record<string, string>>>> = {
  en: () => import('@/lib/i18n/literals/en').then((m) => m.en),
  ja: () => import('@/lib/i18n/literals/ja').then((m) => m.ja),
  zh: () => import('@/lib/i18n/literals/zh').then((m) => m.zh),
};

export async function loadDictionary(locale: Locale): Promise<Dictionary> {
  const dict = await (loaders[locale] ?? loaders[DEFAULT_LOCALE])();
  const lit = literalLoaders[locale];
  return lit ? ({ ...dict, ...(await lit()) } as Dictionary) : dict;
}
