export type Role = 'admin' | 'user';

export interface SessionClaims {
  sub: string; // username
  role: Role;
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
  createdAt: string | null;
  lastLogin: DeviceEntry | null;
}

export interface StreamPayload {
  logs: LogEntry[];
  accounts: TrackedAccount[];
  games: GameTable[];
  game: string; // slug yang sedang dilihat ('all' = stream gabungan)
  seq: number;
  timestamp: number;
}
