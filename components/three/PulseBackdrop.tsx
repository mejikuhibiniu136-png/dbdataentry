'use client';
import dynamic from 'next/dynamic';

// Dimuat malas, hanya klien: bundel awal dashboard tidak bertambah. Memudar ke atas supaya teks header tetap bersih.
const PulseField = dynamic(() => import('@/components/three/PulseField'), { ssr: false });

const FADE = 'linear-gradient(to top, #000 0%, #000 40%, transparent 88%)';

export function PulseBackdrop({ strong = false }: { strong?: boolean }) {
  return (
    <div aria-hidden className={`scene-in pointer-events-none fixed inset-0 ${strong ? 'opacity-100' : 'opacity-70'}`} style={{ zIndex: -1, WebkitMaskImage: FADE, maskImage: FADE }}>
      <PulseField />
    </div>
  );
}
