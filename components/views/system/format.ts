export const formatWhen = (iso: string | null | undefined, locale = 'id-ID'): string =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export type Notify = (m: string, t?: 'success' | 'error' | 'info') => void;
