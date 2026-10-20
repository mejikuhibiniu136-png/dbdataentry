// Skeleton dengan dimensi tetap: setiap varian meniru ukuran komponen aslinya (rem, bukan persen tinggi)
// dan memakai wadah dengan min-height yang sama, sehingga saat data tiba tidak ada pergeseran (CLS = 0).
// Kilau hanya animasi background (tidak memicu layout) dan otomatis berhenti pada prefers-reduced-motion.
export const SIZE = {
  stat: 'h-[7.25rem]',      // StatCard
  chart: 'h-48',            // ActivityChart / SkeletonChart
  accountCard: 'h-[22rem]', // AccountCard
  logRow: 'h-[7rem]',       // LogCard
  tableRow: 'h-[3.25rem]',  // baris tabel
  panel: 'h-40',
} as const;

export function Skeleton({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return <div className={`skeleton ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined} aria-hidden />;
}

function Busy({ children, className = '', label = 'Memuat data' }: { children: React.ReactNode; className?: string; label?: string }) {
  return <div className={className} role="status" aria-busy="true" aria-live="polite"><span className="sr-only">{label}</span>{children}</div>;
}

export function SkeletonGrid({ count = 6, className = SIZE.accountCard }: { count?: number; className?: string }) {
  return (
    <Busy className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={className} delay={i * 60} />)}
    </Busy>
  );
}

export function SkeletonRows({ count = 5, className = SIZE.logRow }: { count?: number; className?: string }) {
  return (
    <Busy className="space-y-3">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={className} delay={i * 60} />)}
    </Busy>
  );
}

export function SkeletonStat({ count = 4 }: { count?: number }) {
  return (
    <Busy className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={SIZE.stat} delay={i * 60} />)}
    </Busy>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Busy className="glass overflow-hidden p-3">
      <Skeleton className="mb-3 h-[2.75rem]" />
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-[2.75rem]" delay={(r * cols + c) * 20} />)}
          </div>
        ))}
      </div>
    </Busy>
  );
}

export function SkeletonChart({ bars = 24 }: { bars?: number }) {
  return (
    <Busy className={`glass flex ${SIZE.chart} items-end gap-1 p-4`}>
      {Array.from({ length: bars }, (_, i) => <div key={i} className="skeleton flex-1 rounded-t-md" style={{ height: `${28 + ((i * 37) % 62)}%`, animationDelay: `${i * 30}ms` }} aria-hidden />)}
    </Busy>
  );
}
