// Aturan status akun. Murni (tanpa dependensi), dipakai oleh server dan client
// supaya definisi ONLINE / STALLED / OFFLINE selalu sama di semua tempat.

// Tanpa heartbeat lebih dari 30 detik -> STALLED, lebih dari 45 detik -> OFFLINE.
export const STALLED_AFTER_SECONDS = 30;
export const OFFLINE_AFTER_SECONDS = 45;

function isExplicitOffline(acc) {
  return String(acc?.status ?? '').toUpperCase() === 'OFFLINE';
}

// Menentukan status akun pada waktu `nowMs`. Mengembalikan 'ONLINE' | 'STALLED' | 'OFFLINE'.
export function getAccountState(acc, nowMs = Date.now()) {
  if (!acc || isExplicitOffline(acc)) return 'OFFLINE';
  const last = new Date(acc.lastUpdate).getTime();
  if (!Number.isFinite(last)) return 'OFFLINE';
  const ageSeconds = (nowMs - last) / 1000;
  if (ageSeconds > OFFLINE_AFTER_SECONDS) return 'OFFLINE';
  if (ageSeconds > STALLED_AFTER_SECONDS) return 'STALLED';
  return 'ONLINE';
}

// Versi server: akun yang sudah melewati batas heartbeat ditandai OFFLINE pada datanya.
// Tidak memutasi objek asli.
export function applyOfflineTimeout(acc, nowMs = Date.now()) {
  if (!acc || typeof acc !== 'object') return acc;
  if (isExplicitOffline(acc)) return acc;
  if (getAccountState(acc, nowMs) === 'OFFLINE') {
    return { ...acc, status: 'OFFLINE', event: 'Keluar / Timed Out' };
  }
  return acc;
}
