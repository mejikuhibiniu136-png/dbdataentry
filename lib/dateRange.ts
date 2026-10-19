// Util rentang tanggal untuk filter (zona waktu lokal browser). Murni, tanpa dependensi.
export interface DayRange { from: Date | null; to: Date | null }

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
export const endOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Klik hari: klik pertama = awal, klik kedua = akhir (otomatis tertukar bila lebih awal), klik ketiga mulai ulang. */
export function pickDay(range: DayRange, day: Date): DayRange {
  const d = startOfDay(day);
  if (!range.from || (range.from && range.to)) return { from: d, to: null };
  return d.getTime() < range.from.getTime() ? { from: d, to: range.from } : { from: range.from, to: d };
}

/** Rentang siap kirim ke API (ISO, batas hari penuh). Hanya awal dipilih = satu hari penuh. */
export function toQuery(range: DayRange): { from?: string; to?: string } {
  if (!range.from) return {};
  return { from: startOfDay(range.from).toISOString(), to: endOfDay(range.to ?? range.from).toISOString() };
}

export const inRange = (day: Date, from: Date | null, to: Date | null): boolean =>
  !!from && !!to && startOfDay(day).getTime() >= startOfDay(from).getTime() && startOfDay(day).getTime() <= startOfDay(to).getTime();

/** Sel kalender untuk satu bulan, minggu mulai Senin; null = sel kosong. */
export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function formatRange(range: DayRange, locale = 'id-ID'): string {
  if (!range.from) return 'Semua tanggal';
  const f = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return range.to && !sameDay(range.from, range.to) ? `${f(range.from)} – ${f(range.to)}` : f(range.from);
}
