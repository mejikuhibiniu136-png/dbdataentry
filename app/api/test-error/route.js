import * as Sentry from '@sentry/nextjs';

export async function GET() {
  const testErr = new Error('Tes Koneksi Sentry Vel');
  const eventId = Sentry.captureException(testErr);
  
  return Response.json({ 
    terhubung: !!eventId, 
    sentryEventId: eventId || 'Gagal terhubung / DSN kosong',
    message: 'Cek dashboard Sentry jika eventId terisi'
  });
}
