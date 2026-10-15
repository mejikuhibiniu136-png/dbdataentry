import { handleAccountHeartbeat } from '@/lib/server/handlers/accountHeartbeat';

export const dynamic = 'force-dynamic';

// Status akun dari script Lua (header `x-api-key`).
export const POST = handleAccountHeartbeat;
