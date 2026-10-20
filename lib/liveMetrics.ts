// Metrik waktu nyata dari log yang sudah dialirkan lewat /api/stream (tanpa koneksi tambahan): jendela 5 menit terakhir.
import { isAccountStatusLog } from '@/lib/logInsights';
import type { LogEntry } from '@/types';

export const LIVE_WINDOW_MS = 5 * 60_000;

export interface LiveMetrics { events: number; gameEvents: number; p95Ms: number; lastAgeSec: number | null }

export function computeLiveMetrics(logs: LogEntry[], nowMs: number): LiveMetrics {
  const recent = logs.filter((l) => { const t = Date.parse(l.receivedAt); return Number.isFinite(t) && nowMs - t <= LIVE_WINDOW_MS && t <= nowMs + 60_000; });
  const ms = recent.map((l) => l.processingTimeMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const times = logs.map((l) => Date.parse(l.receivedAt)).filter(Number.isFinite);
  return {
    events: recent.length,
    gameEvents: recent.filter((l) => !isAccountStatusLog(l)).length,
    p95Ms: ms.length ? Math.round(ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)]) : 0,
    lastAgeSec: times.length ? Math.max(0, Math.round((nowMs - Math.max(...times)) / 1000)) : null,
  };
}
