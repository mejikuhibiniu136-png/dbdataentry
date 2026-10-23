import { checkCron } from '@/lib/cronAuth';
import { errorResponse, json } from '@/lib/http';
import { getRedis } from '@/lib/redis';
import { runWatchdog } from '@/lib/watchdog';

export const dynamic = 'force-dynamic';

// Pemicu watchdog heartbeat tanpa sesi dashboard: dijaga CRON_SECRET (Authorization: Bearer). Menutup kasus semua akun
// mati sekaligus, ketika tidak ada lalu lintas ingest yang memicu pemindaian. Hobby Vercel hanya mengizinkan cron harian,
// jadi untuk interval menit pakai Vercel Pro (vercel.json) atau pinger eksternal dengan header yang sama.
export async function GET(request: Request) {
  try {
    const denied = checkCron(request);
    if (denied) return denied;
    return json({ success: true, data: await runWatchdog(getRedis()) });
  } catch (err) {
    return errorResponse(err, 'cron/watchdog');
  }
}
