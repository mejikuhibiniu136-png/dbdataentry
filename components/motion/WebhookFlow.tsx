'use client';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { PULSE_EVENT } from '@/components/three/pulse';
import { gsap, prefersReducedMotion } from '@/lib/motion/gsap';

// Grafik alur webhook (GSAP + SVG): Sender -> Receiver -> Staging -> Redis -> Dashboard.
// Paket data meluncur di sepanjang jalur dan menyalakan tiap simpul. Hasil menentukan warna dan titik berhenti:
//   ok = sampai Dashboard (hijau) | rejected = ditolak di Receiver (kuning) | error = gagal di Redis (merah)
// Mode `listen`: tiap log baru (event dbd:pulse) memicu satu paket, jadi lalu lintas nyata terlihat hidup.

export type FlowOutcome = 'ok' | 'rejected' | 'error';
export interface FlowHandle { run: (outcome: FlowOutcome) => Promise<void> }

const NODES = [
  { id: 'sender', label: 'Sender', x: 52 },
  { id: 'receiver', label: 'Receiver', x: 186 },
  { id: 'staging', label: 'Staging', x: 320 },
  { id: 'redis', label: 'Redis', x: 454 },
  { id: 'dash', label: 'Dashboard', x: 588 },
] as const;
const Y = 56;
const COLOR = { idle: '#475569', ok: '#34d399', rejected: '#fbbf24', error: '#fb7185', packet: '#22d3ee' } as const;
const STOP_AT: Record<FlowOutcome, number> = { ok: 4, rejected: 1, error: 3 };

export const WebhookFlow = forwardRef<FlowHandle, { listen?: boolean; className?: string }>(function WebhookFlow({ listen = false, className = '' }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  const busy = useRef(false);
  const tl = useRef<gsap.core.Timeline | null>(null);

  const runFlow = (outcome: FlowOutcome): Promise<void> => {
    const root = svg.current;
    if (!root || busy.current) return Promise.resolve();
    const q = <T extends Element>(s: string) => root.querySelector<T>(s);
    const nodes = NODES.map((n) => q<SVGCircleElement>(`[data-node="${n.id}"]`));
    const packet = q<SVGCircleElement>('[data-packet]');
    if (!packet || nodes.some((n) => !n)) return Promise.resolve();
    const last = STOP_AT[outcome];
    const tone = COLOR[outcome];
    const reset = () => { gsap.set(nodes, { attr: { stroke: COLOR.idle, fill: '#0c1220' }, scale: 1 }); gsap.set(packet, { autoAlpha: 0 }); };

    // "Kurangi gerakan": tampilkan hasil akhir saja, tanpa gerak.
    if (prefersReducedMotion()) {
      reset();
      nodes.slice(0, last + 1).forEach((n, i) => gsap.set(n, { attr: { stroke: i === last ? tone : COLOR.ok, fill: '#0c1220' } }));
      return Promise.resolve();
    }

    busy.current = true;
    return new Promise<void>((resolve) => {
      reset();
      const t = gsap.timeline({ onComplete: () => { busy.current = false; resolve(); } });
      tl.current = t;
      t.set(packet, { attr: { cx: NODES[0].x, cy: Y, fill: COLOR.packet }, autoAlpha: 1 });
      for (let i = 0; i <= last; i += 1) {
        const node = nodes[i]!;
        if (i > 0) t.to(packet, { attr: { cx: NODES[i].x }, duration: 0.45, ease: 'power2.inOut' });
        const arriveTone = i === last ? tone : COLOR.ok;
        t.to(node, { attr: { stroke: arriveTone, fill: arriveTone + '33' }, transformOrigin: '50% 50%', scale: 1.18, duration: 0.14, ease: 'power2.out' }, '<0.3')
          .to(node, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)' });
      }
      if (outcome === 'ok') t.to(packet, { autoAlpha: 0, scale: 2.2, transformOrigin: '50% 50%', duration: 0.3 });
      else {
        t.to(packet, { attr: { fill: tone }, duration: 0.1 })
          .to(packet, { x: '+=5', yoyo: true, repeat: 5, duration: 0.05 })
          .to(packet, { autoAlpha: 0, duration: 0.25 });
      }
    });
  };

  useImperativeHandle(ref, () => ({ run: runFlow }));

  // Keadaan awal + denyut garis pelan saat diam; semuanya dibersihkan lewat context.revert().
  useLayoutEffect(() => {
    const root = svg.current;
    if (!root) return undefined;
    const ctx = gsap.context(() => {
      gsap.set('[data-packet]', { autoAlpha: 0 });
      if (prefersReducedMotion()) return;
      gsap.to('[data-line]', { strokeDashoffset: -24, duration: 1.6, ease: 'none', repeat: -1 });
      gsap.from('[data-node]', { scale: 0.4, autoAlpha: 0, transformOrigin: '50% 50%', duration: 0.5, ease: 'back.out(2)', stagger: 0.08 });
      gsap.from('[data-label]', { autoAlpha: 0, y: 6, duration: 0.4, stagger: 0.08, delay: 0.2 });
    }, root);
    return () => { tl.current?.kill(); busy.current = false; ctx.revert(); };
  }, []);

  useEffect(() => {
    if (!listen) return undefined;
    const onPulse = () => { void runFlow('ok'); };
    window.addEventListener(PULSE_EVENT, onPulse);
    return () => window.removeEventListener(PULSE_EVENT, onPulse);
    // runFlow hanya memakai ref; aman tidak dimasukkan ke dependensi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen]);

  return (
    <svg ref={svg} viewBox="0 0 640 112" role="img" aria-label="Webhook pipeline: Sender, Receiver, Staging, Redis, Dashboard" className={`h-auto w-full ${className}`}>
      {NODES.slice(0, -1).map((n, i) => (
        <line key={n.id} data-line x1={n.x + 14} y1={Y} x2={NODES[i + 1].x - 14} y2={Y} stroke={COLOR.idle} strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" />
      ))}
      {NODES.map((n) => (
        <g key={n.id}>
          <circle data-node={n.id} cx={n.x} cy={Y} r={13} fill="#0c1220" stroke={COLOR.idle} strokeWidth={2} />
          <text data-label x={n.x} y={Y + 34} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="var(--font-mono, monospace)">{n.label}</text>
        </g>
      ))}
      <circle data-packet cx={NODES[0].x} cy={Y} r={5} fill={COLOR.packet} />
    </svg>
  );
});
