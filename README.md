# dbdataentry

Dashboard Next.js untuk memantau webhook dan status akun script secara realtime, dengan penyimpanan di Upstash Redis.

## Setup

1. `npm install`
2. Salin `.env.example` menjadi `.env.local` (atau isi di dashboard Vercel) dan lengkapi nilainya:

| Variabel | Keterangan |
|---|---|
| `DASHBOARD_USER` | Username login dashboard |
| `DASHBOARD_PASS_HASH` | Hash bcrypt password, buat dengan `npm run hash -- "password-anda"` |
| `SESSION_SECRET` | String acak minimal 32 karakter untuk menandatangani sesi login |
| `RECEIVER_API_KEY` | String acak minimal 16 karakter; wajib dikirim oleh script/webhook |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Kredensial Upstash Redis (atau `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) |
| `STREAM_INTERVAL_MS` | Opsional, interval polling stream (2000-60000, default 5000) |
| `REDIS_MEMORY_LIMIT_MB` | Opsional, batas memori paket Redis untuk persentase (default 256) |

Membuat nilai acak:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # RECEIVER_API_KEY
```

Jika memakai file `.env`/`.env.local`, escape setiap karakter `$` pada hash menjadi `\$`. Di dashboard Vercel tidak perlu.

3. `npm run dev` untuk pengembangan, atau `npm run build && npm start` untuk produksi.

Tidak ada nilai bawaan untuk kredensial. Jika env belum lengkap, login menolak dengan pesan konfigurasi dan detailnya ada di log server.

## Mengirim data dari script

Semua endpoint penerima wajib menyertakan API key:

```bash
curl -X POST https://DOMAIN-ANDA/api/receiver/game \
  -H "Content-Type: application/json" \
  -H "x-api-key: ISI_RECEIVER_API_KEY" \
  -d '{"username":"Alice","displayName":"Alice","userId":123,"placeId":456,"jobId":"abc","gameName":"Anime Dice","event":"Heartbeat"}'
```

Key juga diterima lewat `Authorization: Bearer <key>` atau `?key=<key>` (untuk pengirim yang tidak bisa mengatur header; header lebih aman karena URL bisa tercatat di log). Body maksimal 64 KB.

## Endpoint

| Endpoint | Metode | Akses |
|---|---|---|
| `/api/login`, `/api/logout` | POST | publik (login dibatasi 5 percobaan / 15 menit per IP) |
| `/api/receiver/game` | POST | API key |
| `/api/webhook` | POST | API key (dapat dimatikan dengan saklar di dashboard) |
| `/api/accounts/status` | POST | API key |
| `/api/webhook` | GET | sesi login (`?limit=1..200`) |
| `/api/accounts/status`, `/api/stream`, `/api/ping`, `/api/user` | GET | sesi login (`/api/stream?limit=10..200`) |
| `/api/webhook/toggle` | GET, POST | sesi login |
| `/api/accounts/status` | DELETE | sesi login (hapus satu akun, body `{"username":"..."}`) |
| `/api/webhook/clear` | POST | sesi login (body opsional `{"scope":"all\|logs\|accounts"}`, default `all`) |

Endpoint API selain yang tertera di atas otomatis tertutup (wajib login). Aturannya ada di `middleware.js`, dan route dashboard memeriksa sesi sekali lagi di dalamnya.

## Fitur dashboard

- **4 tab**: Ringkasan (kartu status, grafik aktivitas, akun bermasalah), Webhook Radar (log), Akun, Analitik.
- **Realtime (SSE)** dengan indikator koneksi (LIVE / menyambung ulang / dijeda), tombol Jeda, dan jumlah log yang dimuat 50 / 100 / 200.
- **Filter log**: pencarian teks, akun, rentang waktu, jenis (Anime Dice), sembunyikan heartbeat. Klik **Detail** untuk panel JSON berwarna.
- **Akun**: cari, filter status, urutkan (status, nama, uptime, latensi), tren latensi, salin Job ID, hapus satu akun, notifikasi saat akun offline / kembali online.
- **Ekspor** log (JSON / CSV, sel CSV dinetralkan dari injeksi rumus) dan akun (CSV).
- **Hapus data per bagian**: log saja, akun saja, atau semuanya (dengan dialog konfirmasi).
- **Tema gelap / terang**, tampilan responsif untuk ponsel, dan dukungan `prefers-reduced-motion`.
- **Palet perintah** `Ctrl/Cmd + K`. Pintasan lain: `/` cari log, `1`-`4` pindah tab, `Esc` tutup panel.

Semua fitur ini tanpa dependensi tambahan (grafik memakai SVG sendiri), jadi `package.json` tidak berubah.

## Status akun

- ONLINE: heartbeat terakhir 30 detik atau kurang
- STALLED: lebih dari 30 detik
- OFFLINE: lebih dari 45 detik, atau script mengirim event `Offline`

Ambang ada di `lib/accountStatus.js` dan dipakai bersama oleh server dan dashboard.

## Struktur

```
app/            halaman, gaya (globals.css), dan route API
components/     grafik, kartu log / akun, panel detail, palet perintah, dialog
lib/            sesi, auth, akses Redis, aturan akun, helper HTTP,
                logStats.js (statistik / filter / ekspor), client.js (hook SSE, tema, toast)
middleware.js   gerbang login untuk halaman dan API
scripts/        pembuat hash password
```
