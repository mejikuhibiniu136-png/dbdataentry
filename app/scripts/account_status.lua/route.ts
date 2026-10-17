import { authenticateApiKey } from '@/lib/apikeys';
import { renderAccountStatusLua } from '@/lib/lua/accountStatus';
import { sealScript } from '@/lib/lua/scriptCrypto';
import { getRedis } from '@/lib/redis';
import { readLuaObfuscationEnabled } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Tanpa cache sama sekali: respons ini khusus per key. Cache publik (s-maxage) akan membuat edge Vercel
// menyajikan skrip ke siapa pun tanpa memanggil fungsi ini, sehingga pemeriksaan key terlewati.
const PRIVATE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

function originOf(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) return `${proto === 'http' ? 'http' : 'https'}://${host}`;
  return new URL(request.url).origin;
}

// Header x-script-key = API Key dashboard (Sistem > API Key). Key salah/tidak ada/kedaluwarsa -> 404
// (bukan 401) supaya keberadaan skrip tidak terkonfirmasi ke pemindai.
export async function GET(request: Request) {
  const key = (request.headers.get('x-script-key') ?? '').trim();
  const redis = getRedis();

  let auth = null;
  try {
    auth = key ? await authenticateApiKey(redis, key) : null;
  } catch {
    auth = null; // Redis bermasalah: tolak (gagal tertutup), jangan sajikan skrip
  }
  if (!auth) return new Response('Not found', { status: 404, headers: { ...PRIVATE, 'Content-Type': 'text/plain; charset=utf-8' } });

  let obfuscate = false;
  try {
    obfuscate = await readLuaObfuscationEnabled(redis);
  } catch {
    obfuscate = false;
  }

  // Key yang sama dipakai skrip untuk mengirim data (header x-api-key). Ia hanya ada di dalam
  // badan terenkripsi, sehingga receiver bisa memakai "Wajibkan API Key" tanpa menanam key di repo.
  const lua = renderAccountStatusLua(`${originOf(request)}/api/receiver/universal`, { obfuscate }).replace(
    '["Content-Type"] = "application/json" }',
    () => `["Content-Type"] = "application/json", ["x-api-key"] = ${JSON.stringify(key)} }`
  );

  const { nonce, hex } = sealScript(lua, key);
  return new Response(`${nonce}\n${hex}`, { headers: { ...PRIVATE, 'Content-Type': 'text/plain; charset=utf-8' } });
}
