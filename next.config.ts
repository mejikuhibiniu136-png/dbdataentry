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
