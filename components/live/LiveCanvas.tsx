'use client';
// Peta 2D langsung: posisi (X, Z Roblox -> x, y), cincin kesehatan, jejak gerak, dan seleksi akun.
// Murni presentasional: data datang dari props (SSE di Dashboard). Marker berinterpolasi halus ke posisi baru; animasi
// berhenti otomatis saat semua marker sudah sampai (tidak membakar baterai) dan dimatikan bila pengguna memilih
// prefers-reduced-motion. Alternatif aksesibel kanvas: daftar akun di LiveView.
import { useCallback, useEffect, useRef } from 'react';
import type { AccountState } from '@/lib/accounts';
import type { TrackedAccount } from '@/types';

export interface LivePoint { account: TrackedAccount; state: AccountState }

// Token desain kanvas (kanvas tidak bisa membaca kelas Tailwind): selaras dengan palet slate/cyan dashboard.
const T = {
  bg: '#0b1120', grid: 'rgba(148,163,184,0.10)', gridText: 'rgba(148,163,184,0.55)', label: '#e2e8f0', labelMuted: '#94a3b8',
  online: '#34d399', stalled: '#fbbf24', offline: '#64748b', accent: '#67e8f9', danger: '#fb7185', warn: '#fbbf24',
} as const;

const STATE_COLOR: Record<AccountState, string> = { ONLINE: T.online, STALLED: T.stalled, OFFLINE: T.offline };
const TRAIL_MAX = 24;
const MIN_SPAN = 100; // studs: peta tidak melompat-lompat saat satu akun diam
const HIT_RADIUS = 18;

interface Sprite { x: number; y: number; tx: number; ty: number; trail: [number, number][] }
interface View { cx: number; cy: number; scale: number }

const niceStep = (raw: number) => {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
};
const healthColor = (pct: number) => (pct > 0.6 ? T.online : pct > 0.3 ? T.warn : T.danger);

export function LiveCanvas({ points, selected, onSelect, className = '' }: { points: LivePoint[]; selected: string | null; onSelect: (username: string | null) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sprites = useRef(new Map<string, Sprite>());
  const view = useRef<View>({ cx: 0, cy: 0, scale: 1 });
  const data = useRef({ points, selected });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const raf = useRef(0);
  const last = useRef(0);
  const reduced = useRef(false);
  data.current = { points, selected };

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const { w, h, dpr } = size.current;
    if (!w || !h) return false;
    const dt = Math.min(0.1, Math.max(0.001, (now - last.current) / 1000));
    last.current = now;
    const k = reduced.current ? 1 : 1 - Math.exp(-dt * 9);
    let moving = false;

    // Batas dunia dari posisi target + bantalan; skala seragam supaya jarak tidak terdistorsi.
    const all = [...sprites.current.values()];
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    if (all.length) {
      minX = Math.min(...all.map((s) => s.tx)); maxX = Math.max(...all.map((s) => s.tx));
      minY = Math.min(...all.map((s) => s.ty)); maxY = Math.max(...all.map((s) => s.ty));
    }
    const spanX = Math.max(MIN_SPAN, (maxX - minX) * 1.3), spanY = Math.max(MIN_SPAN, (maxY - minY) * 1.3);
    const target: View = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.min((w - 72) / spanX, (h - 72) / spanY) };
    const v = view.current;
    if (v.scale === 1 && v.cx === 0 && v.cy === 0) Object.assign(v, target);
    for (const f of ['cx', 'cy', 'scale'] as const) {
      const d = target[f] - v[f];
      if (Math.abs(d) > (f === 'scale' ? 1e-4 : 0.05)) { v[f] += d * k; moving = true; } else v[f] = target[f];
    }
    const sx = (x: number) => w / 2 + (x - v.cx) * v.scale;
    const sy = (y: number) => h / 2 + (y - v.cy) * v.scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid + label koordinat dunia.
    const step = niceStep(80 / v.scale);
    ctx.lineWidth = 1; ctx.strokeStyle = T.grid; ctx.fillStyle = T.gridText; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let gx = Math.ceil((v.cx - w / 2 / v.scale) / step) * step; sx(gx) < w; gx += step) {
      ctx.beginPath(); ctx.moveTo(Math.round(sx(gx)) + 0.5, 0); ctx.lineTo(Math.round(sx(gx)) + 0.5, h); ctx.stroke();
      ctx.fillText(String(Math.round(gx)), sx(gx) + 3, 3);
    }
    for (let gy = Math.ceil((v.cy - h / 2 / v.scale) / step) * step; sy(gy) < h; gy += step) {
      ctx.beginPath(); ctx.moveTo(0, Math.round(sy(gy)) + 0.5); ctx.lineTo(w, Math.round(sy(gy)) + 0.5); ctx.stroke();
      ctx.fillText(String(Math.round(gy)), 3, sy(gy) + 3);
    }

    const { points: pts, selected: sel } = data.current;
    const byName = new Map(pts.map((p) => [p.account.username, p]));
    for (const [name, s] of sprites.current) {
      const dx = s.tx - s.x, dy = s.ty - s.y;
      if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) { s.x += dx * k; s.y += dy * k; moving = true; } else { s.x = s.tx; s.y = s.ty; }
      const p = byName.get(name);
      if (!p) continue;
      const color = STATE_COLOR[p.state];
      const px = sx(s.x), py = sy(s.y);

      // Jejak gerak (memudar ke belakang).
      if (s.trail.length > 1) {
        for (let i = 1; i < s.trail.length; i += 1) {
          ctx.strokeStyle = color; ctx.globalAlpha = (i / s.trail.length) * 0.45; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx(s.trail[i - 1][0]), sy(s.trail[i - 1][1])); ctx.lineTo(sx(s.trail[i][0]), sy(s.trail[i][1])); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      const isSel = name === sel;
      if (isSel) { // cincin seleksi berdenyut
        const pulse = reduced.current ? 0 : (Math.sin(now / 350) + 1) / 2;
        ctx.strokeStyle = T.accent; ctx.globalAlpha = 0.35 + 0.35 * pulse; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 17 + pulse * 3, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        if (!reduced.current) moving = true;
      }

      // Cincin kesehatan: busur proporsional terhadap health/maxHealth.
      const a = p.account;
      if (a.health !== undefined && a.maxHealth) {
        const pct = Math.min(1, Math.max(0, a.health / a.maxHealth));
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(148,163,184,0.25)';
        ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = healthColor(pct);
        ctx.beginPath(); ctx.arc(px, py, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
      }
      ctx.fillStyle = color; ctx.globalAlpha = p.state === 'OFFLINE' ? 0.6 : 1;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;

      ctx.font = `${isSel ? '600 ' : ''}11px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = isSel ? T.label : T.labelMuted;
      ctx.fillText(a.displayName || a.username, px, py + 18);
    }
    return moving;
  }, []);

  const loop = useCallback((now: number) => {
    raf.current = 0;
    if (draw(now)) raf.current = requestAnimationFrame(loop);
  }, [draw]);
  const schedule = useCallback(() => {
    if (!raf.current) { last.current = performance.now(); raf.current = requestAnimationFrame(loop); }
  }, [loop]);

  // Sinkronkan sprite dengan data terbaru: target baru, jejak bertambah, akun hilang dibuang.
  useEffect(() => {
    const live = new Set<string>();
    for (const { account } of points) {
      if (!account.pos) continue;
      live.add(account.username);
      const s = sprites.current.get(account.username);
      if (!s) sprites.current.set(account.username, { x: account.pos.x, y: account.pos.y, tx: account.pos.x, ty: account.pos.y, trail: [[account.pos.x, account.pos.y]] });
      else if (Math.hypot(account.pos.x - s.tx, account.pos.y - s.ty) > 0.5) {
        s.tx = account.pos.x; s.ty = account.pos.y;
        s.trail.push([account.pos.x, account.pos.y]);
        if (s.trail.length > TRAIL_MAX) s.trail.shift();
      }
    }
    for (const name of [...sprites.current.keys()]) if (!live.has(name)) sprites.current.delete(name);
    schedule();
  }, [points, selected, schedule]);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = mq.matches;
    const onMq = () => { reduced.current = mq.matches; schedule(); };
    mq.addEventListener('change', onMq);
    const resize = () => {
      const r = wrap.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w: Math.floor(r.width), h: Math.floor(r.height), dpr };
      canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr);
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    return () => { ro.disconnect(); mq.removeEventListener('change', onMq); cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [schedule]);

  const pick = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top, { w, h } = size.current, v = view.current;
    let best: string | null = null, bestD = HIT_RADIUS;
    for (const [name, s] of sprites.current) {
      const d = Math.hypot(w / 2 + (s.x - v.cx) * v.scale - mx, h / 2 + (s.y - v.cy) * v.scale - my);
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  };

  const placed = points.filter((p) => p.account.pos).length;
  return (
    <div ref={wrapRef} className={`relative overflow-hidden rounded-xl border border-white/10 ${className}`}>
      <canvas ref={canvasRef} role="img" aria-label={`Peta posisi: ${placed} akun dengan posisi dari ${points.length}`} className="block size-full cursor-crosshair touch-manipulation"
        style={{ width: '100%', height: '100%' }} onPointerDown={(e) => onSelect(pick(e))} />
      {placed === 0 && <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">Belum ada posisi masuk. Jalankan skrip terbaru (LIVE_TELEMETRY = true) di executor.</div>}
    </div>
  );
}
