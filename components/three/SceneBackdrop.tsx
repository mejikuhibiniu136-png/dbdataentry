'use client';
import dynamic from 'next/dynamic';

// three.js dimuat malas dan hanya di klien: halaman login/welcome tetap tampil seketika, dan
// bundel dashboard tidak membawa three.js sama sekali.
const ScenePlayer = dynamic(() => import('@/components/three/ScenePlayer'), { ssr: false });

export function SceneBackdrop({ warp = false, className = '' }: { warp?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`scene-in pointer-events-none absolute inset-0 ${className}`}>
      <ScenePlayer warp={warp} />
    </div>
  );
}
