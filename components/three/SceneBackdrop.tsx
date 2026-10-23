'use client';
import dynamic from 'next/dynamic';

// three.js dimuat malas dan hanya di klien: halaman login/welcome tetap tampil seketika, dan
// bundel dashboard tidak membawa three.js sama sekali.
const ScenePlayer = dynamic(() => import('@/components/three/ScenePlayer'), { ssr: false });

export function SceneBackdrop({ warp = false, lift = 0, className = '' }: { warp?: boolean; lift?: number; className?: string }) {
  return (
    <div aria-hidden className={`scene-in pointer-events-none absolute inset-0 ${className}`}>
      <ScenePlayer warp={warp} lift={lift} />
    </div>
  );
}
