export function Skeleton({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return <div className={`skeleton ${className}`} style={{ animationDelay: `${delay}ms` }} aria-hidden />;
}

export function SkeletonGrid({ count = 6, className = 'h-44' }: { count?: number; className?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={className} delay={i * 80} />)}
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-16" delay={i * 80} />)}
    </div>
  );
}
