import { handleDiceWebhook } from '@/lib/server/handlers/diceWebhook';

export const dynamic = 'force-dynamic';

// Alamat baru yang disarankan untuk webhook Anime Dice. /api/webhook tetap berfungsi.
export const POST = handleDiceWebhook;
