'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Adegan 3D latar (three.js): inti wireframe, cincin orbit, jaringan node berbentuk bola, dan
// "paket data" yang mengalir di sepanjang jaringan (metafora webhook). Ringan: satu draw call per
// kelompok, DPR dibatasi, berhenti saat tab disembunyikan, dibuang bersih saat unmount.
// `warp` mempercepat putaran dan mendorong kamera maju (dipakai saat login berhasil / masuk dashboard).

const CYAN = '#22d3ee';
const VIOLET = '#8b5cf6';
const EMERALD = '#34d399';

function glowTexture(): THREE.CanvasTexture | null {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose();
  });
}

interface Edge { a: number; b: number }
interface Packet { e: number; t: number; v: number; rev: boolean }

// `lift`: geser adegan ke atas (pecahan tinggi layar) supaya inti 3D tidak persis di belakang teks.
export default function ScenePlayer({ warp = false, lift = 0 }: { warp?: boolean; lift?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const warpRef = useRef(warp);
  useEffect(() => { warpRef.current = warp; }, [warp]);
  const liftRef = useRef(lift);
  useEffect(() => { liftRef.current = lift; }, [lift]);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = coarse || el.clientWidth < 640;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }) // AA selalu aktif: cincin & garis tipis tanpa AA tampak merayap/berkedip saat berputar;
    } catch {
      return undefined; // WebGL tidak tersedia: latar CSS (aurora) tetap menjadi cadangan.
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    const canvas = renderer.domElement;
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    // Kabut gelap: sisi belakang bola memudar sehingga tidak bertumpuk dengan sisi depan (penyebab kesan "menabrak").
    scene.fog = new THREE.Fog(0x050810, 4, 12);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 6.4);
    const world = new THREE.Group();
    scene.add(world);

    const sprite = glowTexture();
    const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;

    // Titik di permukaan bola (spiral Fibonacci) dengan sedikit jitter radial.
    const R = 2.2;
    const total = small ? 650 : 1400;
    const shell: THREE.Vector3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < total; i++) {
      const y = 1 - (i / (total - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      const k = R * (0.97 + Math.random() * 0.06);
      shell.push(new THREE.Vector3(Math.cos(th) * r * k, y * k, Math.sin(th) * r * k));
    }
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const c1 = new THREE.Color(CYAN), c2 = new THREE.Color(VIOLET), tmp = new THREE.Color();
    shell.forEach((p, i) => {
      p.toArray(pos, i * 3);
      tmp.copy(c1).lerp(c2, (p.y / R + 1) / 2);
      tmp.toArray(col, i * 3);
    });
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    shellGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    world.add(new THREE.Points(shellGeo, new THREE.PointsMaterial({ size: small ? 0.06 : 0.05, map: sprite ?? undefined, vertexColors: true, opacity: 0.75, sizeAttenuation: true, ...additive })));

    // Jaringan: subset node, garis antar node yang berdekatan.
    const step = Math.max(1, Math.floor(total / (small ? 70 : 120)));
    const nodes = shell.filter((_, i) => i % step === 0);
    const edges: Edge[] = [];
    for (let i = 0; i < nodes.length && edges.length < 300; i++) {
      for (let j = i + 1; j < nodes.length && edges.length < 300; j++) {
        if (nodes[i].distanceTo(nodes[j]) < 0.95) edges.push({ a: i, b: j });
      }
    }
    if (edges.length) {
      const lp = new Float32Array(edges.length * 6);
      edges.forEach((e, i) => { nodes[e.a].toArray(lp, i * 6); nodes[e.b].toArray(lp, i * 6 + 3); });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      world.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: CYAN, opacity: 0.13, ...additive })));
    }

    // Paket data yang meluncur di sepanjang garis jaringan.
    const packets: Packet[] = Array.from({ length: edges.length ? (small ? 16 : 36) : 0 }, () => ({ e: Math.floor(Math.random() * edges.length), t: Math.random(), v: 0.25 + Math.random() * 0.5, rev: Math.random() > 0.5 }));
    const packetPos = new Float32Array(packets.length * 3);
    const packetGeo = new THREE.BufferGeometry();
    packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPos, 3));
    const packetPts = new THREE.Points(packetGeo, new THREE.PointsMaterial({ size: 0.13, map: sprite ?? undefined, color: EMERALD, opacity: 1, ...additive }));
    packetPts.frustumCulled = false;
    world.add(packetPts);
    const writePackets = () => {
      packets.forEach((p, i) => {
        const e = edges[p.e];
        const a = nodes[p.rev ? e.b : e.a], b = nodes[p.rev ? e.a : e.b];
        packetPos[i * 3] = a.x + (b.x - a.x) * p.t;
        packetPos[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
        packetPos[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
      });
      packetGeo.attributes.position.needsUpdate = true;
    };
    writePackets();

    // Inti wireframe, cahaya lembut, dan dua cincin orbit.
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, opacity: 0.2, ...additive }));
    world.add(core);
    let glow: THREE.Sprite | null = null;
    if (sprite) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: VIOLET, opacity: 0.4, fog: false, ...additive }));
      glow.scale.setScalar(3.4);
      world.add(glow);
    }
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.006, 8, 180), new THREE.MeshBasicMaterial({ color: CYAN, opacity: 0.34, ...additive }));
    ring1.rotation.x = Math.PI / 2.4;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.006, 8, 180), new THREE.MeshBasicMaterial({ color: VIOLET, opacity: 0.3, ...additive }));
    ring2.rotation.set(Math.PI / 3.1, 0.6, 0);
    world.add(ring1, ring2);

    // Debu jauh untuk kedalaman.
    const dustN = small ? 220 : 520;
    const dp = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      const r = 4 + Math.random() * 5, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      dp[i * 3] = r * Math.sin(ph) * Math.cos(th); dp[i * 3 + 1] = r * Math.cos(ph); dp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.04, map: sprite ?? undefined, color: '#a5f3fc', opacity: 0.4, fog: false, ...additive }));
    scene.add(dust);

    // Pas ke layar: di potret (HP/tablet) bola dulu lebih lebar dari layar dan menutupi seluruh teks. Jarak kamera kini
    // dihitung dari rasio layar sehingga bola selalu muat, lalu digeser ke atas (lift) agar inti tidak persis di belakang judul.
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let baseZ = 6.4, sized = false, speed = 1, camZ = 6.4;
    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      baseZ = Math.max(6.4, (R * 1.15) / (tanV * Math.min(1, camera.aspect)) + R * 0.4);
      if (!sized || reduce) { camZ = baseZ; camera.position.z = baseZ; sized = true; }
      // landscape: angkat lebih kecil, bola sudah setinggi ±80% layar dan puncaknya akan terpotong bila diangkat penuh
      world.position.y = liftRef.current * (camera.aspect < 1 ? 1 : 0.35) * 2 * tanV * baseZ;
      if (scene.fog instanceof THREE.Fog) { scene.fog.near = baseZ - R * 0.9; scene.fog.far = baseZ + R * 1.7; }
      if (reduce) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { target.x = e.clientX / window.innerWidth - 0.5; target.y = e.clientY / window.innerHeight - 0.5; };
    const timer = new THREE.Timer();
    timer.connect(document); // delta dibekukan saat tab tersembunyi

    const frame = () => {
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      const t = timer.getElapsed();
      const w = warpRef.current;
      const k = (rate: number) => Math.min(1, dt * rate);
      speed += ((w ? 7 : 1) - speed) * k(3);
      camZ += ((w ? baseZ * 0.34 : baseZ) - camZ) * k(2.2);
      cur.x += (target.x - cur.x) * k(3);
      cur.y += (target.y - cur.y) * k(3);

      world.rotation.y += dt * 0.12 * speed;
      world.rotation.x = cur.y * 0.35 + Math.sin(t * 0.2) * 0.06;
      core.rotation.x += dt * 0.25 * speed; core.rotation.y += dt * 0.35 * speed;
      ring1.rotation.z += dt * 0.4 * speed; ring2.rotation.z -= dt * 0.3 * speed;
      dust.rotation.y -= dt * 0.02 * speed;
      glow?.scale.setScalar(3.4 + Math.sin(t * 1.6) * 0.25);
      camera.position.set(cur.x * 0.8, -cur.y * 0.5, camZ);
      camera.lookAt(0, 0, 0);

      for (const p of packets) {
        p.t += dt * p.v * speed;
        if (p.t >= 1) { p.t = 0; p.e = Math.floor(Math.random() * edges.length); p.rev = Math.random() > 0.5; }
      }
      if (packets.length) writePackets();
      renderer.render(scene, camera);
    };

    const onLost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); };
    canvas.addEventListener('webglcontextlost', onLost);
    if (reduce) {
      renderer.render(scene, camera); // satu bingkai statis, tanpa gerak
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
      sprite?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div ref={host} className="size-full" />;
}
