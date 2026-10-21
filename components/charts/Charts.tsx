'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { motion, useReducedMotion } from 'motion/react';
import { useId, useRef, useState } from 'react';
import type { Activity } from '@/lib/logStats';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function Sparkline({ values, color = '#22d3ee', label }: { values: number[]; color?: string; label: string }) {
  const { tr } = useI18n();
  const gid = useId();
  const reduce = useReducedMotion();
  const data = values.map(num);
  const W = 120, H = 34, pad = 3;
  if (!data.length) {
    return <svg className="h-8 w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('{label}: belum ada data', { label })}><line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgb(255 255 255 / 0.15)" strokeDasharray="3 4" /></svg>;
  }
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => [data.length > 1 ? pad + i * step : W / 2, H - pad - ((v - min) / range) * (H - pad * 2)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="h-8 w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={tr('{label}: terakhir {last} ms, rentang {min}-{max} ms', { label, last: data[data.length - 1], min, max })}>
      {data.length > 1 && (
        <>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
          <motion.path d={`M${pts[0][0].toFixed(1)} ${H} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L${lx.toFixed(1)} ${H}Z`} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.35 }} />
        </>
      )}
      {data.length > 1 && <motion.polyline initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      <motion.path d={`M${lx.toFixed(1)} ${ly.toFixed(1)}h0.001`} stroke={color} strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" animate={reduce ? undefined : { opacity: [1, 0.35, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
    </svg>
  );
}

const fmtTime = (ms: number, withDay = false) =>
  withDay ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmtSpan = (ms: number, tr: (s: string, p?: Record<string, string | number>) => string) => {
  if (ms < 60_000) return tr('{n} detik', { n: Math.max(1, Math.round(ms / 1000)) });
  const h = Math.round(ms / 3_600_000);
  return h >= 1 ? tr('{n} jam', { n: h }) : tr('{n} menit', { n: Math.max(1, Math.round(ms / 60_000)) });
};

// Kurva kubik monoton (Fritsch–Carlson): mulus tetapi tidak pernah melampaui nilai titik, jadi tidak ada "lembah" di bawah 0.
// Jumlah perintah path selalu sama (satu M + n-1 C), sehingga `d` bisa dianimasikan antar data tanpa kedip.
const f1 = (v: number) => v.toFixed(1);
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], w = dx[i] / 3;
    d += `C${f1(x0 + w)} ${f1(y0 + t[i] * w)} ${f1(x1 - w)} ${f1(y1 - t[i + 1] * w)} ${f1(x1)} ${f1(y1)}`;
  }
  return d;
}

// Skala sumbu Y berupa bilangan bulat (jumlah event), maksimal ±5 garis.
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 4) return { top: max, ticks: Array.from({ length: max + 1 }, (_, i) => i) };
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * p).find((v) => v >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

const EVENT_COLOR = '#8b5cf6', BEAT_COLOR = '#22d3ee';

export function ActivityChart({ data }: { data: Activity }) {
  const { tr } = useI18n();
  const reduce = useReducedMotion();
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const b = data.buckets;
  if (!b.length) return <div className="grid h-40 place-items-center text-sm text-slate-500">{tr('Belum ada aktivitas untuk digrafikkan.')}</div>;
  if (data.max === 0) return <div className="grid h-40 place-items-center text-center text-sm text-slate-500">{tr('Tidak ada aktivitas dalam {span} terakhir.', { span: fmtSpan(data.spanMs, tr) })}</div>;

  const W = 960, H = 250, padL = 34, padR = 14, padT = 14, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB, n = b.length;
  const seriesMax = b.reduce((m, k) => Math.max(m, k.other, k.heartbeat), 1);
  const { top, ticks } = niceScale(seriesMax);
  const xAt = (i: number) => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => padT + innerH - (v / Math.max(top, 1)) * innerH;
  const base = padT + innerH;
  const withDay = data.spanMs >= 12 * 3_600_000;
  const evPts = b.map((k, i) => [xAt(i), yAt(k.other)] as [number, number]);
  const hbPts = b.map((k, i) => [xAt(i), yAt(k.heartbeat)] as [number, number]);
  const line = (pts: [number, number][]) => smoothPath(pts);
  const area = (pts: [number, number][]) => `${smoothPath(pts)}L${f1(pts[pts.length - 1][0])} ${f1(base)}L${f1(pts[0][0])} ${f1(base)}Z`;
  const totalEv = b.reduce((s, k) => s + k.other, 0), totalHb = b.reduce((s, k) => s + k.heartbeat, 0);
  const xTicks = Array.from(new Set([0, 0.25, 0.5, 0.75, 1].map((q) => Math.round(q * (n - 1)))));

  const pick = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const px = ((clientX - r.left) / r.width) * W;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((px - padL) / innerW) * (n - 1)))));
  };
  const hk = hover === null ? null : b[hover];
  const hx = hover === null ? 0 : xAt(hover);
  const draw = reduce ? false : undefined;

  return (
    <div>
      <div className="relative">
        <svg ref={svgRef} className="h-auto w-full touch-pan-y select-none" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={tr('Grafik aktivitas, puncak {max} event per {n} menit', { max: data.max, n: Math.round(data.bucketMs / 60_000) || 1 })}
          onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
          <defs>
            <linearGradient id={`${uid}-ev`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={EVENT_COLOR} stopOpacity="0.38" /><stop offset="1" stopColor={EVENT_COLOR} stopOpacity="0" /></linearGradient>
            <linearGradient id={`${uid}-hb`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={BEAT_COLOR} stopOpacity="0.22" /><stop offset="1" stopColor={BEAT_COLOR} stopOpacity="0" /></linearGradient>
          </defs>

          {ticks.map((v) => (
            <g key={v}><line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} stroke="rgb(255 255 255 / 0.08)" strokeDasharray={v === 0 ? undefined : '3 5'} /><text x={padL - 8} y={yAt(v) + 3.5} textAnchor="end" fontSize="11" fill="#7d8ca3" className="tabular">{v}</text></g>
          ))}
          {xTicks.map((i) => (
            <g key={i}><line x1={xAt(i)} x2={xAt(i)} y1={base} y2={base + 4} stroke="rgb(255 255 255 / 0.2)" /><text x={xAt(i)} y={H - 7} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="#7d8ca3" className="tabular">{fmtTime(b[i].start, withDay)}</text></g>
          ))}

          {/* Area + garis halus; `d` dianimasikan antar data (jumlah perintah selalu sama), garis tergambar sekali saat muncul */}
          <motion.path fill={`url(#${uid}-hb)`} initial={draw === false ? false : { d: area(hbPts), opacity: 0 }} animate={{ d: area(hbPts), opacity: 1 }} transition={{ d: { duration: 0.35 }, opacity: { duration: 0.8, delay: 0.3 } }} />
          <motion.path fill={`url(#${uid}-ev)`} initial={draw === false ? false : { d: area(evPts), opacity: 0 }} animate={{ d: area(evPts), opacity: 1 }} transition={{ d: { duration: 0.35 }, opacity: { duration: 0.8, delay: 0.3 } }} />
          <motion.path fill="none" stroke={BEAT_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={draw === false ? false : { d: line(hbPts), pathLength: 0 }} animate={{ d: line(hbPts), pathLength: 1 }} transition={{ d: { duration: 0.35 }, pathLength: { duration: 1, ease: [0.22, 1, 0.36, 1] } }} />
          <motion.path fill="none" stroke={EVENT_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={draw === false ? false : { d: line(evPts), pathLength: 0 }} animate={{ d: line(evPts), pathLength: 1 }} transition={{ d: { duration: 0.35 }, pathLength: { duration: 1, ease: [0.22, 1, 0.36, 1] } }} />

          {/* Titik hanya di bucket yang berisi data, supaya data jarang tetap terbaca */}
          {b.map((k, i) => (
            <g key={i} aria-hidden>
              {k.heartbeat > 0 && <circle cx={evPts[i][0]} cy={hbPts[i][1]} r="3" fill="#0c1220" stroke={BEAT_COLOR} strokeWidth="1.8" />}
              {k.other > 0 && <circle cx={evPts[i][0]} cy={evPts[i][1]} r="3.5" fill="#0c1220" stroke={EVENT_COLOR} strokeWidth="2" />}
            </g>
          ))}

          {hk && (
            <g aria-hidden pointerEvents="none">
              <line x1={hx} x2={hx} y1={padT} y2={base} stroke="rgb(255 255 255 / 0.35)" strokeDasharray="3 4" />
              <circle cx={hx} cy={hbPts[hover!][1]} r="5" fill={BEAT_COLOR} stroke="#070a12" strokeWidth="2" />
              <circle cx={hx} cy={evPts[hover!][1]} r="5.5" fill={EVENT_COLOR} stroke="#070a12" strokeWidth="2" />
            </g>
          )}
        </svg>

        {hk && (
          <div role="status" className="glass glass-solid pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(88, Math.max(12, (hx / W) * 100))}%` }}>
            <div className="tabular mb-1 font-medium text-white">{fmtTime(hk.start, withDay)} – {fmtTime(hk.start + data.bucketMs, withDay)}</div>
            <div className="flex items-center gap-2 text-slate-300"><i className="size-2 rounded-full" style={{ background: EVENT_COLOR }} />{tr('Event')}<b className="tabular ml-auto pl-4 text-white">{hk.other}</b></div>
            <div className="flex items-center gap-2 text-slate-300"><i className="size-2 rounded-full" style={{ background: BEAT_COLOR }} />{tr('Heartbeat')}<b className="tabular ml-auto pl-4 text-white">{hk.heartbeat}</b></div>
          </div>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
        <div className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: EVENT_COLOR }} /><dt>{tr('Event')}</dt><dd className="tabular font-semibold text-slate-100">{totalEv}</dd></div>
        <div className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: BEAT_COLOR }} /><dt>{tr('Heartbeat')}</dt><dd className="tabular font-semibold text-slate-100">{totalHb}</dd></div>
        <div className="inline-flex items-center gap-1.5"><dt>{tr('Total')}</dt><dd className="tabular font-semibold text-slate-100">{totalEv + totalHb}</dd></div>
        <div className="inline-flex items-center gap-1.5"><dt>{tr('Puncak')}</dt><dd className="tabular font-semibold text-slate-100">{data.max}</dd></div>
        <div className="text-slate-500">{tr('Per titik: {span}', { span: fmtSpan(data.bucketMs, tr) })}</div>
      </dl>
    </div>
  );
}

export function BarList({ items, empty }: { items: { name: string; count: number }[]; empty?: string }) {
  const { tr } = useI18n();
  if (!items.length) return <p className="text-sm text-slate-500">{empty ?? tr('Belum ada data.')}</p>;
  const max = Math.max(...items.map((i) => num(i.count)), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-300" title={it.name}>{it.name}</span>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-[width] duration-500" style={{ width: `${Math.max(3, (num(it.count) / max) * 100)}%` }} />
          </div>
          <b className="tabular text-slate-100">{it.count.toLocaleString('id-ID')}</b>
        </div>
      ))}
    </div>
  );
}
