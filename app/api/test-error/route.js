import * as Sentry from '@sentry/nextjs';

export async function GET() {
  const testErr = new Error('Tes Error Sentry API Direct!');
  Sentry.captureException(testErr);
  return Response.json({ success: false, message: 'Error terkirim ke Sentry!' });
}
