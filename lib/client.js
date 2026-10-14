// Helper sisi client (browser). Dipakai oleh komponen dashboard.

import { useCallback, useEffect, useRef, useState } from 'react';

// Semua request dashboard lewat sini: jika sesi berakhir (401) langsung diarahkan ke login.
export async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesi berakhir');
  }
  return res;
}

export const jsonPost = (url, body) =>
  apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

// Mengunduh teks sebagai file di browser.
export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Gambar dari payload hanya dimuat jika https.
export function safeImageUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

// Warna embed (integer RGB) menjadi hex 6 digit. Nilai kosong / tidak valid -> kuning default.
export function embedColor(color) {
  return Number.isInteger(color) && color > 0 && color <= 0xffffff
    ? `#${color.toString(16).padStart(6, '0')}`
    : '#eab308';
}

// ---------- Toast ----------

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info') => {
      counter.current += 1;
      const id = counter.current;
      setToasts((list) => [...list.slice(-3), { id, message, type }]);
      timers.current.set(id, setTimeout(() => dismiss(id), 4000));
    },
    [dismiss]
  );

  useEffect(() => {
    const current = timers.current;
    return () => current.forEach((t) => clearTimeout(t));
  }, []);

  return { toasts, push, dismiss };
}

// ---------- Tema ----------

export function useTheme() {
  const [theme, setThemeState] = useState('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') setThemeState(saved);
    } catch {
      // localStorage tidak tersedia (mode privat ketat): pakai default
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        // abaikan
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

// ---------- Stream realtime (SSE) ----------

// Status: 'connecting' | 'live' | 'reconnecting' | 'paused'.
// Stream ditutup saat tab browser tersembunyi atau saat dijeda supaya tidak menghabiskan
// command Redis, lalu disambung lagi otomatis.
export function useLiveStream({ paused, limit, onData }) {
  const [status, setStatus] = useState('connecting');
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    if (paused) {
      setStatus('paused');
      return undefined;
    }

    let source = null;
    let retryTimer = null;
    let warnTimer = null;
    let disposed = false;

    const clearTimers = () => {
      clearTimeout(retryTimer);
      clearTimeout(warnTimer);
      retryTimer = null;
      warnTimer = null;
    };

    const disconnect = () => {
      clearTimers();
      if (source) {
        source.close();
        source = null;
      }
    };

    const scheduleRetry = () => {
      if (!disposed && !document.hidden) retryTimer = setTimeout(connect, 5000);
    };

    function connect() {
      if (disposed || source) return;
      setStatus((s) => (s === 'live' ? s : 'connecting'));
      const es = new EventSource(`/api/stream?limit=${encodeURIComponent(limit)}`);
      source = es;

      es.onopen = () => {
        clearTimeout(warnTimer);
        setStatus('live');
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          clearTimeout(warnTimer);
          setStatus('live');
          onDataRef.current?.(parsed);
        } catch (err) {
          console.error('SSE Error', err);
        }
      };

      es.onerror = () => {
        // Server menutup stream tiap ~55 detik dan browser menyambung ulang sendiri.
        // Peringatan baru muncul jika sambungan ulang tidak segera berhasil.
        clearTimeout(warnTimer);
        warnTimer = setTimeout(() => setStatus('reconnecting'), 6000);
        if (es.readyState !== EventSource.CLOSED) return;
        es.close();
        if (source === es) source = null;
        fetch('/api/user')
          .then((res) => {
            if (res.status === 401) {
              window.location.href = '/login';
              return;
            }
            scheduleRetry();
          })
          .catch(scheduleRetry);
      };
    }

    const onVisibilityChange = () => {
      if (document.hidden) disconnect();
      else connect();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disconnect();
    };
  }, [paused, limit]);

  return status;
}
