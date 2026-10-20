import { handleIngest, preflight } from '@/lib/ingest/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Alias lama /api/webhook. Tabel ditentukan dari payload, sama seperti /api/receiver/universal.
export const POST = (request: Request) => handleIngest(request);
export const OPTIONS = () => preflight();
