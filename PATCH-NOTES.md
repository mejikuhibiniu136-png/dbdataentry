# Patch keamanan dbdataentry-main

Cara pakai: ekstrak zip ini DI ATAS folder proyek lama (timpa file yang sama). Tidak ada dependensi baru. Lalu: `npm test && npm run typecheck`, deploy.

## File berubah → temuan
| Temuan | File |
|---|---|
| T1 kill-switch: ack per salinan | lib/keys.ts, lib/scriptguard/auth.ts, lib/control/commands.ts, app/api/receiver/control/route.ts |
| T2 batas akun terlacak + token per salinan (x-wm) di ingest, hapus ?key= | lib/ingest/store.ts, lib/ingest/handler.ts, lua/guard.lua, lua/guard_public.lua, lua/control.lua, lib/lua/accountStatus.ts |
| T3 saklar skrip publik | app/scripts/account_status.lua/route.ts |
| S1 lockout Superadmin | lib/rateLimit.ts, lib/auth/login.ts |
| S2 pencabutan sesi tidak boleh gagal diam-diam, tolak JWT legacy | app/api/admin/users/[username]/route.ts, lib/auth/jwt.ts |
| S3 throttle log kebocoran / oracle HWID | lib/scriptguard/binding.ts, app/api/scripts/report/route.ts |
| S5 pepper HWID | lib/scriptguard/hwid.ts |
| S6 rate limit SSE/search/export/download/skrip publik | app/api/stream, app/api/logs/search, app/api/logs/export, app/api/scripts/download, app/scripts/account_status.lua |
| S7 batas total pengguna | lib/auth/login.ts |
| R1 CSP (produksi) | next.config.ts |
| R2 RBAC konsisten | app/api/stream, app/api/logs/export, app/api/accounts |
| Env baru | .env.example |
| Tes diperbarui / baru | tests/integration, routes, staging-auth, features, scriptguard-routes, audit-fixes (baru) |

## Perubahan perilaku yang perlu Anda tahu
1. **JWT lama tanpa `sid`/`status` ditolak** → semua pengguna login ulang sekali setelah deploy.
2. **`?key=` di URL ingest tidak lagi diterima** → pakai header `x-api-key` atau `Authorization: Bearer`. Cek skrip lama Anda.
3. **Login**: limit sekarang per (user+IP), hanya menghitung kegagalan. Limit global per-user (60/15 mnt) hanya untuk IP yang belum pernah login sukses.
4. **Skrip Lua baru** mengirim `x-wm` (+ `x-hwid` pada build berlisensi) di telemetri. Salinan lama tetap jalan (anonim) selama `INGEST_REQUIRE_TOKEN` belum `on`.
5. **Ack kill-switch** tidak lagi menghapus perintah; perintah hidup sampai TTL, tiap salinan ack sendiri. `ackedAt` di dashboard = "ada salinan mengaku", bukan bukti. Bukti = event OFFLINE akun itu.

## Env baru (semua opsional, bawaan kompatibel)
- `HWID_PEPPER` — MIGRASI: isi dengan nilai `ENCRYPTION_KEY` yang berlaku SEKARANG, baru boleh rotasi ENCRYPTION_KEY. Kosong = perilaku lama.
- `INGEST_REQUIRE_TOKEN=on` — aktifkan setelah semua klien memakai skrip baru.
- `SCRIPT_PUBLIC_ENABLED=off` — mematikan /scripts/account_status.lua (T3). Bawaan aktif.
- `MAX_TRACKED_ACCOUNTS` (2000), `MAX_USERS` (500).

## Belum dikerjakan (butuh keputusan / pekerjaan terpisah)
- **S4** enkripsi skrip 32-bit: butuh keystream HMAC-SHA256 di Lua + uji vektor.
- **S7** TOTP/MFA Superadmin, alert pendaftaran dikumpulkan.
- **R3** fail-closed untuk rute superadmin, **R4** allowlist prefix publik di proxy.ts, **R5** hapus format legacy iv:tag:data, authVersion di JWT.
- T3 secara desain: selama `SCRIPT_PUBLIC_ENABLED` aktif, DRM tidak melindungi skrip utama.

## Verifikasi yang dijalankan
tsc --noEmit bersih; vitest 25 file lulus (Redis sungguhan); luac -p OK untuk 3 modul Lua + skrip hasil render (polos & obfuscated); next build sukses. Tidak ada uji dinamis/penetrasi nyata, dan alur ingest dengan x-wm di Roblox executor belum diuji di game sungguhan.

## Animasi "wow" (three.js + motion)

- Baru: adegan 3D three.js (`components/three/`) di login, register, `/welcome`, dan layar sambutan: inti wireframe, cincin orbit, jaringan node, paket data mengalir, parallax kursor. Dimuat malas (`next/dynamic`, tanpa SSR), DPR dibatasi, berhenti saat tab tersembunyi, dibuang bersih saat unmount. Tanpa WebGL atau dengan "kurangi gerakan": cadangan CSS / satu bingkai statis.
- Baru: efek warp (adegan melaju, form memudar) saat login berhasil dan saat menekan Masuk di layar sambutan.
- Baru: kartu statistik miring 3D mengikuti kursor (`useTilt`), angka berdenyut saat berubah, kilau menyapu tombol utama, cincin gradien berputar di logo, item sidebar masuk berurutan, sparkline dengan area gradien + titik ujung berdenyut, judul sambutan muncul dari kabur.
- Dependensi: `three@^0.186.0`, `@types/three@^0.186.0`. Jalankan `npm install`.

## Perbaikan notifikasi + animasi tambahan (v7)

- Bug: panel notifikasi terpotong di tepi kiri layar pada lebar sedang (tablet / mode desktop di HP). Panel sekarang `fixed`, posisinya dihitung dari tombol lonceng lalu dijepit ke dalam layar (`components/notifications/NotificationBell.tsx`); ikut menyesuaikan saat resize/scroll.
- Baru: latar 3D dashboard `AmbientScene` -> `TerrainPlayer` (permukaan garis-halus bergelombang sangat pelan, tanpa partikel/neon, memudar ke atas; riak lembut setiap log baru masuk; 30 fps di HP; satu bingkai statis bila "kurangi gerakan"). Berbeda dari adegan hero di login.
- Baru: tombol utama magnetik (tertarik ke kursor), sinar gradien berputar di tepi kartu statistik saat hover, lonceng bergoyang saat ada notifikasi belum dibaca.
