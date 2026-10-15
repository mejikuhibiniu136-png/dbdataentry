// Skeleton pemuat. Memakai animasi shimmer CSS yang sudah ada (.skeleton).

export function AccountSkeletonGrid({ count = 6 }) {
  return (
    <div className="acc-grid" aria-busy="true" aria-label="Memuat akun">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 196, animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
