'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

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

// Latar dashboard: jaringan 3D redup dan pelan di belakang semua panel kaca. Ringan (DPR 1, titik sedikit,
// tanpa pointer), dilewati bila pengguna memilih "kurangi gerakan".
export function AmbientScene() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  if (!on) return null;
  return (
    <div aria-hidden className="scene-in pointer-events-none fixed inset-0 opacity-45" style={{ zIndex: -1 }}>
      <ScenePlayer ambient />
    </div>
  );
}
