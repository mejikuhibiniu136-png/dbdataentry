// Origin yang sedang melayani request (Vercel mengisi x-forwarded-host/proto) + pemeriksaan same-origin untuk aksi destruktif.
export function originOf(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) return `${proto === 'http' ? 'http' : 'https'}://${host}`;
  return new URL(request.url).origin;
}

/** Mutasi lewat cookie wajib datang dari halaman kita sendiri (tanpa header Origin = ditolak). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === (request.headers.get('x-forwarded-host') ?? request.headers.get('host'));
  } catch {
    return false;
  }
}
