'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { disposeTree } from '@/components/three/dispose';

// Latar dashboard: permukaan garis-halus (hairline) yang bergelombang sangat pelan, seperti topografi
// data di bawah kaca. Tenang dan mahal, bukan pamer: tanpa partikel, tanpa cahaya neon. Setiap log baru
// yang masuk memancarkan satu riak lembut yang merambat di permukaan (data nyata, bukan hiasan).
// Mati sendiri saat tab disembunyikan; dengan "kurangi gerakan" hanya satu bingkai statis.

const COLS = 72;
const ROWS = 44;
const HALF_X = 15;
const Z_NEAR = 3;
const Z_FAR = -30;
const N = COLS * ROWS;
const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Ripple { x: number; z: number; t0: number }

export default function TerrainPlayer({ ping = 0 }: { ping?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const lastPing = useRef(ping);
  const queued = useRef(0);
  useEffect(() => {
    if (ping !== lastPing.current) { queued.current += 1; lastPing.current = ping; }
  }, [ping]);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !coarse, alpha: true, powerPreference: 'low-power' });
    } catch {
      return undefined; // tanpa WebGL: aurora CSS tetap jadi latar
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const canvas = renderer.domElement;
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(0, 2.6, 8);
    camera.lookAt(0, 0.3, -6);

    // Titik grid + indeks segmen (horizontal dan ke belakang). Redup di kejauhan dan di tepi kiri-kanan.
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const base = new Float32Array(N * 3);
    const fade = new Float32Array(N);
    const cyan = new THREE.Color('#22d3ee'), violet = new THREE.Color('#8b5cf6'), tint = new THREE.Color();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const x = -HALF_X + (2 * HALF_X * c) / (COLS - 1);
        const z = Z_NEAR + ((Z_FAR - Z_NEAR) * r) / (ROWS - 1);
        pos[i * 3] = x; pos[i * 3 + 2] = z;
        tint.copy(cyan).lerp(violet, (x / HALF_X + 1) / 2).toArray(base, i * 3);
        fade[i] = Math.max(0.03, Math.pow(1 - r / (ROWS - 1), 1.4)) * (1 - smooth(0.55, 1, Math.abs(x) / HALF_X));
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (c < COLS - 1) idx.push(i, i + 1);
        if (r < ROWS - 1) idx.push(i, i + COLS);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.frustumCulled = false;
    scene.add(mesh);

    const ripples: Ripple[] = [];
    const update = (t: number) => {
      for (let i = 0; i < N; i++) {
        const x = pos[i * 3], z = pos[i * 3 + 2];
        let h = 0.34 * Math.sin(x * 0.33 + t * 0.32) * Math.cos(z * 0.27 - t * 0.22) + 0.16 * Math.sin(x * 0.75 - t * 0.45 + z * 0.4);
        let glow = 0;
        for (const rp of ripples) {
          const age = t - rp.t0;
          const w = Math.hypot(x - rp.x, z - rp.z) - age * 3.2;
          const g = Math.exp(-(w * w) / 0.9) * Math.exp(-age * 0.55);
          h += 0.42 * g * Math.cos(w * 2);
          glow += g;
        }
        pos[i * 3 + 1] = h;
        const k = fade[i] * (0.3 + 0.35 * Math.min(1, Math.max(0, h + 0.35)) + 1.1 * Math.min(1, glow));
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    };

    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduce) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const target = { x: 0 }, cur = { x: 0 };
    const onMove = (e: PointerEvent) => { target.x = e.clientX / window.innerWidth - 0.5; };
    const timer = new THREE.Timer();
    timer.connect(document);
    let skip = 0;

    const frame = () => {
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      const t = timer.getElapsed();
      if (coarse && (skip++ & 1)) return; // HP: 30 fps cukup untuk gerak sepelan ini
      if (queued.current > 0) {
        for (let n = Math.min(queued.current, 4 - ripples.length); n > 0; n--) ripples.push({ x: (Math.random() - 0.5) * 14, z: -6 - Math.random() * 12, t0: t });
        queued.current = 0;
      }
      while (ripples.length && t - ripples[0].t0 > 6) ripples.shift();
      cur.x += (target.x - cur.x) * Math.min(1, dt * 2);
      camera.position.x = cur.x * 0.6;
      camera.lookAt(0, 0.3, -6);
      update(t);
      renderer.render(scene, camera);
    };

    const onLost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); };
    canvas.addEventListener('webglcontextlost', onLost);
    if (reduce) {
      update(3);
      renderer.render(scene, camera);
    } else {
      renderer.setAnimationLoop(frame);
      if (!coarse) window.addEventListener('pointermove', onMove, { passive: true });
    }

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', onLost);
      ro.disconnect();
      timer.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div ref={host} className="size-full" />;
}
