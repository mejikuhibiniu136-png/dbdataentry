// Konstanta bersama (aman dipakai di server maupun client).

// Kunci Redis
export const LOG_KEY = 'webhook_logs';
export const ACCOUNT_KEY = 'account_status';
export const WEBHOOK_STATUS_KEY = 'webhook:status';

// Jumlah log maksimum yang disimpan di Redis
export const MAX_STORED_LOGS = 200;

// Jumlah log yang ditampilkan dashboard (SSE dan tombol Pull memakai angka yang sama)
export const DASHBOARD_LOG_LIMIT = 50;

// Batas ukuran body request (byte)
export const MAX_BODY_BYTES = 64 * 1024;
