import path from 'node:path';
import type { NextConfig } from 'next';

// CSP hanya di produksi (dev React butuh eval). 'unsafe-inline' diperlukan Next untuk skrip inline bootstrap; ganti ke nonce
// lewat proxy.ts bila ingin lebih ketat. img-src https: karena thumbnail embed berasal dari host sembarang.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Argon2 adalah modul native (Rust): jangan di-bundle oleh webpack/turbopack.
  serverExternalPackages: ['@node-rs/argon2'],
  // Fengari (VM Lua untuk Test Lab): di browser memakai bundel khusus (scripts/build-fengari.mjs) tempat cabang Node
  // (io.*, os.execute, fs, child_process) sudah terbuang, jadi sandbox Lua tidak punya akses berkas/proses. Server dan
  // vitest tetap memakai paket `fengari` asli.
  turbopack: { resolveAlias: { fengari: { browser: './lib/lualab/vendor/fengari.browser.js' } } },
  webpack: (config, { isServer }) => {
    if (!isServer) config.resolve.alias = { ...config.resolve.alias, fengari$: path.resolve(process.cwd(), 'lib/lualab/vendor/fengari.browser.js') };
    return config;
  },
  // Modul Lua mentah (lua/*.lua) dibaca lewat fs saat runtime; tanpa ini Vercel tidak menyertakannya di fungsi.
  outputFileTracingIncludes: { '/api/scripts/download': ['./lua/**/*'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
