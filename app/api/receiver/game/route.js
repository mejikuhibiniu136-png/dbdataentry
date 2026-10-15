import { handleAccountHeartbeat } from '@/lib/server/handlers/accountHeartbeat';

export const dynamic = 'force-dynamic';

// Alias lama. Script Lua yang sudah terpasang dengan URL ini tetap berjalan.
// Gunakan /api/receiver/account untuk script baru.
export const POST = handleAccountHeartbeat;
