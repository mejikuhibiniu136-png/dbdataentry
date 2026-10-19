'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, inRange, monthGrid, pickDay, sameDay, startOfDay, type DayRange } from '@/lib/dateRange';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const PRESETS: { label: string; days: number }[] = [{ label: 'Hari ini', days: 0 }, { label: '7 hari', days: 6 }, { label: '30 hari', days: 29 }];

// Kalender rentang tanggal interaktif: klik awal lalu akhir (pratinjau saat sorot), navigasi bulan, pintasan cepat.
// Sel minimal 40px agar nyaman disentuh; lebar mengikuti wadah (maks 22rem) sehingga aman di layar kecil.
export function DateRangeCalendar({ value, onChange, max = new Date() }: { value: DayRange; onChange: (r: DayRange) => void; max?: Date }) {
  const [cursor, setCursor] = useState(() => startOfDay(value.from ?? new Date()));
  const [hover, setHover] = useState<Date | null>(null);
  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const today = startOfDay(new Date());
  const limit = startOfDay(max);
  const title = cursor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  // Pratinjau: setelah klik awal, sorotan mengikuti kursor.
  const previewTo = value.from && !value.to ? hover : value.to;
  const lo = value.from && previewTo && previewTo < value.from ? previewTo : value.from;
  const hi = value.from && previewTo && previewTo < value.from ? value.from : previewTo;

  return (
    <div className="w-full max-w-[22rem] select-none" role="group" aria-label="Pilih rentang tanggal">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} className="grid size-9 cursor-pointer place-items-center rounded-lg text-slate-300 hover:bg-white/[0.08]" aria-label="Bulan sebelumnya"><ChevronLeft className="size-4" /></button>
        <div className="text-sm font-medium capitalize text-white" aria-live="polite">{title}</div>
        <button type="button" onClick={() => move(1)} className="grid size-9 cursor-pointer place-items-center rounded-lg text-slate-300 hover:bg-white/[0.08]" aria-label="Bulan berikutnya"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHover(null)}>
        {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-[11px] font-medium text-slate-500">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const disabled = d.getTime() > limit.getTime();
          const edge = (value.from && sameDay(d, value.from)) || (value.to && sameDay(d, value.to)) || (!value.to && hover && value.from && sameDay(d, hover));
          const mid = inRange(d, lo, hi);
          const isToday = sameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={disabled}
              onMouseEnter={() => setHover(d)}
              onClick={() => onChange(pickDay(value, d))}
              aria-pressed={Boolean(edge)}
              aria-label={d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              className={`relative h-10 cursor-pointer text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${edge ? 'rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 font-semibold text-slate-950' : mid ? 'bg-cyan-300/15 text-white' : 'rounded-lg text-slate-200 hover:bg-white/[0.08]'} ${isToday && !edge ? 'ring-1 ring-inset ring-cyan-300/40 rounded-lg' : ''}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => { onChange({ from: addDays(today, -p.days), to: today }); setCursor(addDays(today, -p.days)); }} className="min-h-9 cursor-pointer rounded-full border border-white/10 px-3 text-xs text-slate-300 hover:border-cyan-300/40 hover:text-white">{p.label}</button>
        ))}
        <button type="button" onClick={() => onChange({ from: null, to: null })} className="min-h-9 cursor-pointer rounded-full px-3 text-xs text-slate-400 hover:text-white">Hapus</button>
      </div>
    </div>
  );
}
