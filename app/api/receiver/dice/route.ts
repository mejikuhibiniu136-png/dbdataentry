import { handleIngest, preflight } from '@/lib/ingest/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Alias lama (parameter ?key=... diabaikan kecuali WEBHOOK_INGEST_TOKEN diset). Tabel ditentukan dari payload.
export const POST = (request: Request) => handleIngest(request);
export const OPTIONS = () => preflight();
