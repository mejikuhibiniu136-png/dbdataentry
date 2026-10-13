import { getSession } from '@/lib/auth';
import { DASHBOARD_LOG_LIMIT } from '@/lib/constants';
import { clampInt, json, unauthorized } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { readAccounts, readLogs } from '@/lib/store';

// Route ini selalu dinamis dan berjalan di Node.js.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Interval polling ke Redis (default 5 detik, dapat diubah lewat STREAM_INTERVAL_MS).
const INTERVAL_MS = clampInt(process.env.STREAM_INTERVAL_MS, 2000, 60000, 5000);

// Koneksi ditutup rapi sebelum batas maxDuration; EventSource di browser menyambung ulang otomatis.
const MAX_STREAM_MS = 55_000;

export async function GET(request) {
  const session = await getSession();
  if (!session) return unauthorized();

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    console.error('[stream]', err);
    return json({ success: false, message: 'Terjadi kesalahan pada server' }, 500);
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer = null;
  let maxTimer = null;

  const cleanup = () => {
    closed = true;
    clearInterval(timer);
    clearTimeout(maxTimer);
  };

  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        cleanup();
        try {
          controller.close();
        } catch {
          // stream sudah tertutup
        }
      };

      const send = (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      let running = false;
      let lastBody = null;

      const tick = async () => {
        if (closed || running) return; // jangan tumpang-tindih
        running = true;
        try {
          const [logs, accounts] = await Promise.all([
            readLogs(redis, DASHBOARD_LOG_LIMIT),
            readAccounts(redis),
          ]);
          const payload = { logs, accounts };
          const body = JSON.stringify(payload);

          if (body !== lastBody) {
            lastBody = body;
            send(`data: ${JSON.stringify({ ...payload, timestamp: Date.now() })}\n\n`);
          } else {
            send(': keepalive\n\n'); // data tidak berubah: tidak perlu kirim ulang
          }
        } catch (err) {
          console.error('[stream] Gagal mengambil data:', err);
          send(': error\n\n');
        } finally {
          running = false;
        }
      };

      request.signal.addEventListener('abort', close);

      send('retry: 3000\n\n');
      tick();
      timer = setInterval(tick, INTERVAL_MS);
      maxTimer = setTimeout(close, MAX_STREAM_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
