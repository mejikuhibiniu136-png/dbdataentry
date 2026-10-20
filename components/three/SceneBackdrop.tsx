'use client';
import dynamic from 'next/dynamic';

// three.js dimuat malas dan hanya di klien: halaman login/welcome tetap tampil seketika, dan
// bundel dashboard tidak membawa three.js sebelum benar-benar dirender.
const ScenePlayer = dynamic(() => import('@/components/three/ScenePlayer'), { ssr: false });

export function SceneBackdrop({ warp = false, className = '' }: { warp?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`scene-in pointer-events-none absolute inset-0 ${className}`}>
      <ScenePlayer warp={warp} />
    </div>
  );
}

const TerrainPlayer = dynamic(() => import('@/components/three/TerrainPlayer'), { ssr: false });

// Latar dashboard (berbeda dari hero login): permukaan garis-halus yang tenang di bawah panel kaca,
// memudar ke atas supaya judul dan tabel tetap bersih. `ping` naik setiap ada log baru -> satu riak lembut.
// Selalu terpasang: dengan "kurangi gerakan" ia menjadi satu bingkai statis, bukan hilang.
const FADE_UP = 'linear-gradient(to top, #000 0%, #000 30%, transparent 85%)';
export function AmbientScene({ ping = 0 }: { ping?: number }) {
  return (
    <div aria-hidden className="scene-in pointer-events-none fixed inset-0" style={{ zIndex: -1, opacity: 0.9, maskImage: FADE_UP, WebkitMaskImage: FADE_UP }}>
      <TerrainPlayer ping={ping} />
    </div>
  );
}
