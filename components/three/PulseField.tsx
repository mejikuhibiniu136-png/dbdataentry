'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PULSE_EVENT } from '@/components/three/pulse';

// Latar dashboard (three.js): hamparan titik bergelombang pelan. Setiap log baru memicu riak cahaya yang
// menyebar di hamparan itu (event `dbd:pulse` dari Dashboard), jadi lalu lintas webhook terasa "hidup".
// Ringan: satu draw call, satu ShaderMaterial, DPR dibatasi, 30 fps di layar sentuh, berhenti saat tab
// tersembunyi (THREE.Timer), dibuang bersih saat unmount. "Kurangi gerakan" / tanpa WebGL: tidak dirender
// sama sekali, aurora CSS tetap menjadi latar.

const RIPPLES = 4;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform vec4 uRip[${RIPPLES}];
attribute float aSeed;
varying float vRing;
varying float vMix;
varying float vFade;
void main() {
  vec3 p = position;
  float h = sin(p.x * 0.45 + uTime * 0.55) * 0.14 + cos(p.z * 0.38 + uTime * 0.45) * 0.14;
  float ring = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w > 0.0 && age > 0.0 && age < 7.0) {
      float w = distance(p.xz, r.xy) - age * 3.2;
      ring += exp(-w * w * 1.4) * exp(-age * 0.55) * r.w;
    }
  }
  p.y += h + ring * 1.1;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (0.9 + aSeed * 0.5 + ring * 2.2) / -mv.z;
  vRing = ring;
  vMix = clamp(p.x / 28.0 + 0.5, 0.0, 1.0);
  vFade = 0.2 + 0.8 * smoothstep(-26.0, -2.0, p.z);
}`;

const FRAG = /* glsl */ `
varying float vRing;
varying float vMix;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 col = mix(vec3(0.133, 0.827, 0.933), vec3(0.545, 0.361, 0.965), vMix);
  col = mix(col, vec3(0.88, 1.0, 1.0), clamp(vRing, 0.0, 1.0));
  gl_FragColor = vec4(col, a * vFade * (0.38 + vRing * 1.2));
}`;

export default function PulseField() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = coarse || window.innerWidth < 640;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch {
      return undefined;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(dpr);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
    camera.position.set(0, 2.4, 7);
    camera.lookAt(0, 0, -5);

    // Hamparan titik pada bidang XZ (x: -14..14, z: -26..2).
    const cols = small ? 56 : 96, rows = small ? 36 : 60;
    const count = cols * rows;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const k = i * cols + j;
        pos[k * 3] = (j / (cols - 1) - 0.5) * 28 + (Math.random() - 0.5) * 0.2;
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = 2 - (i / (rows - 1)) * 28 + (Math.random() - 0.5) * 0.2;
        seed[k] = Math.random();
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const rips = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: (small ? 30 : 38) * dpr }, uRip: { value: rips } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    let now = 0, slot = 0;
    const ripple = (strength: number) => {
      rips[slot].set((Math.random() - 0.5) * 16, -2 - Math.random() * 10, now, strength);
      slot = (slot + 1) % RIPPLES;
    };
    const onPulse = (e: Event) => {
      const n = (e as CustomEvent<{ count?: number }>).detail?.count ?? 1;
      ripple(Math.min(1.4, 0.8 + n * 0.1));
    };
    window.addEventListener(PULSE_EVENT, onPulse);

    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const target = { x: 0 }, cur = { x: 0 };
    const onMove = (e: PointerEvent) => { target.x = e.clientX / window.innerWidth - 0.5; };
    if (!coarse) window.addEventListener('pointermove', onMove, { passive: true });

    const timer = new THREE.Timer();
    timer.connect(document); // delta dibekukan saat tab tersembunyi
    let acc = 0, idle = 2;
    const frame = () => {
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      if (coarse) { acc += dt; if (acc < 1 / 30) return; acc = 0; }
      now = timer.getElapsed();
      mat.uniforms.uTime.value = now;
      idle -= dt;
      if (idle <= 0) { ripple(0.45); idle = 4.5 + Math.random() * 3; } // riak pelan saat sepi
      cur.x += (target.x - cur.x) * Math.min(1, dt * 2.5);
      camera.position.x = cur.x * 1.6;
      camera.lookAt(cur.x * 0.6, 0, -5);
      renderer.render(scene, camera);
    };
    const onLost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); };
    canvas.addEventListener('webglcontextlost', onLost);
    renderer.setAnimationLoop(frame);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener(PULSE_EVENT, onPulse);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', onLost);
      ro.disconnect();
      timer.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div ref={host} className="size-full" />;
}
