import { LOCALE_NAMES, type Locale } from '@/lib/i18n/config';

export type Params = Record<string, string | number>;

/** Interpolasi "{nama}". Placeholder tak dikenal dibiarkan apa adanya agar kesalahan terlihat. */
export const interpolate = (template: string, params?: Params): string =>
  params ? template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : template;

export const formatNumber = (locale: Locale, n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(LOCALE_NAMES[locale].intl, opts).format(n);
export const formatDateTime = (locale: Locale, d: Date | string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) =>
  new Intl.DateTimeFormat(LOCALE_NAMES[locale].intl, opts).format(new Date(d));
export const formatRelative = (locale: Locale, deltaSeconds: number): string => {
  const rtf = new Intl.RelativeTimeFormat(LOCALE_NAMES[locale].intl, { numeric: 'auto' });
  const abs = Math.abs(deltaSeconds);
  if (abs < 60) return rtf.format(Math.round(deltaSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(deltaSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(deltaSeconds / 3600), 'hour');
  return rtf.format(Math.round(deltaSeconds / 86400), 'day');
};

// ---------- Durasi ----------
export interface DurationPart { value: number; unit: string }
// Satuan pendek per bahasa. Spasi antar angka-satuan diatur tampilan; ja/zh tanpa spasi.
const DURATION_UNITS: Record<Locale, readonly [string, string, string, string]> = {
  en: ['d', 'h', 'm', 's'],
  id: ['hari', 'jam', 'mnt', 'dtk'],
  ja: ['日', '時間', '分', '秒'],
  zh: ['天', '小时', '分', '秒'],
};

/**
 * Durasi jadi maksimal 3 satuan berurutan mulai dari yang terbesar yang ada isinya:
 *   < 1 mnt: detik · < 1 jam: menit+detik · < 1 hari: jam+menit+detik · >= 1 hari: hari+jam+menit.
 * Satuan bernilai 0 dibuang (kecuali satuan terbesar). Negatif / NaN dianggap 0.
 */
export function durationParts(locale: Locale, totalSeconds: number): DurationPart[] {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const u = DURATION_UNITS[locale] ?? DURATION_UNITS.en;
  const raw = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  const first = raw.findIndex((v) => v > 0);
  if (first === -1) return [{ value: 0, unit: u[3] }];
  return raw.slice(first, first + 3).map((value, i) => ({ value, unit: u[first + i] })).filter((p, i) => i === 0 || p.value > 0);
}

/** Teks datar, mis. "7 jam 33 mnt 10 dtk" / "7h 33m 10s" / "7時間33分10秒". */
export function formatDuration(locale: Locale, totalSeconds: number): string {
  const tight = locale === 'ja' || locale === 'zh';
  return durationParts(locale, totalSeconds).map((p) => `${p.value}${tight ? '' : ' '}${p.unit}`).join(tight ? '' : ' ');
}
