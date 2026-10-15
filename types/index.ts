// Matriks RBAC berjenjang:
//   superadmin : akses mutlak (satu-satunya akun dari .env Vercel, permanen, tidak bisa diubah)
//   admin      : CRUD akun & game, lihat pengguna/log, TIDAK bisa approve/reject/kelola sistem
//   viewer     : baca saja (default untuk pendaftar baru, sampai disetujui superadmin)
export type Role = 'superadmin' | 'admin' | 'viewer';
// Role yang disimpan di Redis untuk users:account:* (superadmin selalu dari env, tidak pernah disimpan)
export type StorableRole = 'admin' | 'viewer';

// pending   : baru daftar, menunggu keputusan superadmin
// active    : disetujui, boleh memakai dashboard sesuai role
// suspended : ditangguhkan superadmin (bisa diaktifkan lagi)
// rejected  : ditolak superadmin
export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface SessionClaims {
  sub: string; // username
  role: Role;
  status: UserStatus; // superadmin selalu 'active'; proxy mengarahkan status lain ke /pending-approval
  sid: string; // id sesi, juga dicatat di riwayat perangkat
  iat?: number;
  exp?: number;
}

// Payload webhook bebas bentuk; UI membacanya lewat helper bertipe aman.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Payload = Record<string, any>;

export type IngestFormat = 'json' | 'urlencoded' | 'form-data' | 'text' | 'empty';

export interface LogEntry {
  id: string;
  game: string; // slug tabel
  gameName: string;
  eventType: string;
  payload: Payload;
  format: IngestFormat;
  bytes: number;
  processingTimeMs: number;
  receivedAt: string;
}

export interface GameTable {
  slug: string;
  name: string;
  builtin: boolean;
  source: 'builtin' | 'auto' | 'manual';
  createdAt: string;
  createdBy?: string;
  total: number; // jumlah log diterima sejak tabel dibuat
}

export interface TrackedAccount {
  username: string;
  displayName: string;
  userId: string;
  placeId: string;
  jobId: string;
  gameName: string;
  event: string;
  state: 'ONLINE' | 'OFFLINE';
  status: 'ONLINE' | 'OFFLINE';
  avatarUrl: string;
  timestamp: string;
  sessionStart: string;
  lastUpdate: string;
  latencyMs: number;
  rev: number;
}

export interface DeviceEntry {
  sid: string;
  at: string;
  ip: string;
  device: string; // Windows / Android / iOS / macOS / ...
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  os: string;
  browser: string;
  city: string | null;
  region: string | null;
  country: string | null;
  isp: string | null;
  userAgent: string;
}

export interface UserSummary {
  username: string;
  role: Role;
  status: UserStatus;
  createdAt: string | null;
  lastLogin: DeviceEntry | null;
  /** true untuk akun superadmin (dari .env): tidak bisa diubah/ditangguhkan/dihapus dari dashboard. */
  immutable: boolean;
}

// Pengaturan dinamis (Upstash Redis, hanya dibaca/ditulis Superadmin). Nilai sensitif
// (WEBHOOK_SECRET, API_KEY) dienkripsi AES-256-GCM di Redis; endpoint hanya melaporkan "sudah diisi".
export interface SystemSettings {
  maintenanceMode: boolean;
  rateLimitPerMin: number;
  luaObfuscationEnabled: boolean;
  webhookSecretSet: boolean;
  apiKeySet: boolean;
}

export interface StreamPayload {
  logs: LogEntry[];
  accounts: TrackedAccount[];
  games: GameTable[];
  game: string; // slug yang sedang dilihat ('all' = stream gabungan)
  seq: number;
  timestamp: number;
}
