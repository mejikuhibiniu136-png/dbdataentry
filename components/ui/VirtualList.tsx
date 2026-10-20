'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Props<T> {
  items: T[];
  /** Perkiraan tinggi item (px) sebelum diukur. Tinggi sebenarnya diukur dengan ResizeObserver. */
  estimate: number;
  /** Jarak antar item (px). */
  gap?: number;
  /** Tinggi wadah gulir. Wadah selalu bertinggi tetap sehingga tidak menimbulkan CLS. */
  height?: string;
  overscan?: number;
  getKey: (item: T, index: number) => string;
  render: (item: T, index: number) => ReactNode;
  className?: string;
  label?: string;
}

// Virtualisasi daftar tanpa dependensi: hanya item di sekitar viewport yang dirender, tinggi total dijaga lewat
// spacer. Tinggi item diukur sehingga kartu dengan isi bervariasi (mis. log dengan embed) tetap akurat.
export function VirtualList<T>({ items, estimate, gap = 12, height = 'min(70dvh, 48rem)', overscan = 4, getKey, render, className = '', label }: Props<T>) {
  const scroller = useRef<HTMLDivElement>(null);
  const sizes = useRef(new Map<string, number>());
  const [ver, bump] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, h: 800 });

  const keys = useMemo(() => items.map(getKey), [items, getKey]);
  const { offsets, total } = useMemo(() => {
    const o = new Array<number>(keys.length);
    let acc = 0;
    for (let i = 0; i < keys.length; i += 1) { o[i] = acc; acc += (sizes.current.get(keys[i]) ?? estimate) + gap; }
    return { offsets: o, total: Math.max(0, acc - gap) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, estimate, gap, ver]);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (el) setViewport({ top: el.scrollTop, h: el.clientHeight });
  }, []);
  useIsoLayoutEffect(() => {
    sync();
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);

  // Biner: indeks pertama yang bagian bawahnya masih di atas batas atas viewport.
  let lo = 0;
  let hi = keys.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid] + (sizes.current.get(keys[mid]) ?? estimate) < viewport.top) lo = mid + 1; else hi = mid; }
  const start = Math.max(0, lo - overscan);
  let end = start;
  while (end < keys.length && offsets[end] < viewport.top + viewport.h) end += 1;
  end = Math.min(keys.length, end + overscan);

  const measure = useCallback((key: string, node: HTMLElement | null) => {
    if (!node) return;
    const h = Math.ceil(node.getBoundingClientRect().height);
    if (h > 0 && sizes.current.get(key) !== h) { sizes.current.set(key, h); bump((n) => n + 1); }
  }, []);

  return (
    <div ref={scroller} onScroll={sync} className={`overflow-y-auto overscroll-contain rounded-2xl ${className}`} style={{ height }} tabIndex={0} role="region" aria-label={label}>
      <ul className="relative m-0 list-none p-0" style={{ height: total }} aria-rowcount={items.length}>
        {items.slice(start, end).map((item, i) => {
          const idx = start + i;
          const key = keys[idx];
          return (
            <li key={key} ref={(n) => measure(key, n)} className="absolute inset-x-0" style={{ top: offsets[idx] }} aria-posinset={idx + 1} aria-setsize={items.length}>
              {render(item, idx)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
