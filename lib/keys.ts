// Seluruh nama key Redis ada di sini. Dua namespace dipisahkan tegas:
//   log & webhook : logs:*, game:*, games:*, tracker:*, config:*
//   akun & user   : users:*
// Aksi "Clear Logs" hanya menyentuh key log; users:* tidak pernah disentuh oleh kode log.

export const KEYS = {
  // ----- Log & webhook -----
  streamLogs: 'logs:stream',
  streamSeq: 'logs:seq', // naik setiap ada perubahan data; dipakai SSE untuk hemat command
  gameLogs: (slug: string) => `game:${slug}:logs`,
  gamesMeta: 'games:meta', // hash: slug -> JSON metadata tabel
  gamesCounts: 'games:counts', // hash: slug -> total log diterima (seumur tabel)
  gamesAlias: 'games:alias', // hash: slug lama -> slug baru (setelah rename)
  trackerAccounts: 'tracker:accounts', // hash: username Roblox -> JSON status akun
  receiverEnabled: 'config:receiver_enabled',

  // ----- Akun & pengguna dashboard -----
  usersList: 'users:list', // sorted set: username (lowercase) -> waktu daftar
  userAccount: (usernameKey: string) => `users:account:${usernameKey}`,
  userDevices: (usernameKey: string) => `users:devices:${usernameKey}`,

  // ----- Pembatas laju -----
  rateLimit: (scope: string, id: string) => `rl:${scope}:${id}`,
} as const;

// Kunci yang boleh dihapus oleh aksi Clear Logs (daftar putih, sengaja terpisah dari users:*).
export function clearableLogKeys(slugs: string[], scope: 'all' | 'stream' | { game: string }): string[] {
  if (scope === 'stream') return [KEYS.streamLogs];
  if (scope === 'all') return [KEYS.streamLogs, ...slugs.map(KEYS.gameLogs)];
  return [KEYS.gameLogs(scope.game)];
}
