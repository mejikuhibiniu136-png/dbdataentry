'use client';

// Grafik SVG ringan tanpa dependensi.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function Sparkline({ values, color = 'var(--accent)', label = 'Grafik latensi' }) {
  const data = (values || []).map(num);
  const W = 120;
  const H = 34;
  const pad = 3;
  if (data.length === 0) {
    return (
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: belum ada data`}>
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--border-strong)" strokeDasharray="3 4" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => [
    data.length > 1 ? pad + i * step : W / 2,
    H - pad - ((v - min) / range) * (H - pad * 2),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: terakhir ${data[data.length - 1]} ms, rentang ${min}-${max} ms`}
    >
      {data.length > 1 && (
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
      <path d={`M${lx.toFixed(1)} ${ly.toFixed(1)}h0.001`} stroke={color} strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Rentang 12 jam atau lebih: sertakan tanggal agar label awal dan akhir tidak terlihat sama.
const fmtTime = (ms, withDay = false) =>
  withDay
    ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const fmtSpan = (ms) => {
  const hours = Math.round(ms / 3600000);
  return hours >= 1 ? `${hours} jam` : `${Math.max(1, Math.round(ms / 60000))} menit`;
};

// Batang bertumpuk: heartbeat (redup) dan event lain (terang).
export function ActivityChart({ data }) {
  const buckets = data?.buckets || [];
  if (buckets.length === 0) {
    return <div className="empty" style={{ padding: 28 }}>Belum ada aktivitas untuk digrafikkan.</div>;
  }
  if (data.max === 0) {
    return (
      <div className="empty" style={{ padding: 28 }}>
        Tidak ada aktivitas dalam {fmtSpan(data.spanMs)} terakhir.
        <div className="hint" style={{ marginTop: 4 }}>Log yang dimuat lebih lama dari rentang ini.</div>
      </div>
    );
  }
  const withDay = data.spanMs >= 12 * 3600000;
  const W = 960;
  const H = 210;
  const padL = 28;
  const padB = 22;
  const padT = 8;
  const innerW = W - padL - 6;
  const innerH = H - padB - padT;
  const max = Math.max(data.max, 1);
  const slot = innerW / buckets.length;
  const barW = Math.max(2, slot - 3);
  const gridLines = [0, 0.5, 1];

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Grafik aktivitas, puncak ${data.max} event per ${Math.round(data.bucketMs / 60000) || 1} menit`}>
        {gridLines.map((g) => {
          const y = padT + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={padL} x2={W - 6} y1={y} y2={y} stroke="var(--border)" />
              <text className="chart-axis" x={padL - 6} y={y + 3} textAnchor="end">{Math.round(max * g)}</text>
            </g>
          );
        })}
        {buckets.map((b, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const hOther = (b.other / max) * innerH;
          const hBeat = (b.heartbeat / max) * innerH;
          const yOther = padT + innerH - hOther;
          const yBeat = yOther - hBeat;
          return (
            <g key={b.start}>
              <title>{`${fmtTime(b.start)} • ${b.other} event, ${b.heartbeat} heartbeat`}</title>
              {b.heartbeat > 0 && <rect x={x} y={yBeat} width={barW} height={hBeat} rx="2" fill="var(--accent)" opacity="0.38" />}
              {b.other > 0 && <rect x={x} y={yOther} width={barW} height={hOther} rx="2" fill="var(--accent-2)" />}
            </g>
          );
        })}
        <text className="chart-axis" x={padL} y={H - 6}>{fmtTime(buckets[0].start, withDay)}</text>
        <text className="chart-axis" x={W - 6} y={H - 6} textAnchor="end">{fmtTime(buckets[buckets.length - 1].start + data.bucketMs, withDay)}</text>
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
        <span><span className="dot" style={{ color: 'var(--accent-2)', display: 'inline-block', marginRight: 6 }} />Event</span>
        <span><span className="dot" style={{ color: 'var(--accent)', opacity: 0.45, display: 'inline-block', marginRight: 6 }} />Heartbeat</span>
      </div>
    </div>
  );
}

export function BarList({ items, emptyText = 'Belum ada data.', format = (n) => n }) {
  if (!items || items.length === 0) return <div className="hint">{emptyText}</div>;
  const max = Math.max(...items.map((i) => num(i.count)), 1);
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.name}>
          <span className="truncate" title={item.name}>{item.name}</span>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${Math.max(3, (num(item.count) / max) * 100)}%` }} />
          </div>
          <b>{format(item.count)}</b>
        </div>
      ))}
    </div>
  );
}
