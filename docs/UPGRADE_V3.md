# Upgrade v3: rencana kerja dan keputusan

## 0. Tindakan segera (di luar kode)

1. **Ganti `RECEIVER_API_KEY` sekarang.** Key lama sudah tertempel di percakapan dan di script Lua. Buat yang baru:
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`, set di Vercel, lalu isi `CONFIG.API_KEY` di script Lua baru.
2. Buat `WEBHOOK_INGEST_TOKEN` (cara pembuatan sama) dan pasang di URL webhook Anime Dice:
   `https://dbdataentry.vercel.app/api/receiver/dice?key=<token>`.
3. Redeploy di Vercel setelah env diubah.

## 1. Rencana kerja bertahap

| # | Langkah | Status |
|---|---|---|
| 1 | Struktur modul: `lib/domain` (murni), `lib/server` (Redis/auth/HTTP), `lib/server/handlers` | selesai |
| 2 | Next 14 -> 16.4, React 18 -> 19, Zod 4, motion 12; `cookies()` async, `middleware` -> `proxy` | selesai, `next build` lulus |
| 3 | Penulisan atomik akun + log (compare-and-set via satu `EVAL`) | selesai, diuji dengan Lua asli |
| 4 | Handler status akun: API key, Zod ketat, rate limit, `state` + `latencyMs` dari klien | selesai |
| 5 | Handler webhook Anime Dice: token terpisah, Zod longgar, sanitasi, karantina, rate limit | selesai |
| 6 | Script Lua: `latencyMs`, `state`, retry backoff, guard instance ganda | selesai, sintaks diperiksa |
| 7 | UI: toast beranimasi, kartu akun layout/enter/exit, pil status crossfade, angka bergerak, skeleton akun, flash heartbeat | selesai |
| 8 | Uji pada Vercel + Upstash sungguhan | **belum**: dikerjakan setelah deploy |

## 2. Akar masalah "penyimpanan sering gagal / tidak konsisten"

1. **Lost update.** `recordEvent` membaca akun, menghitung, lalu menulis tanpa kunci. Dua request serentak untuk akun yang sama membuat salah satunya menimpa yang lain.
2. **Penulisan tidak atomik.** Log dan akun ditulis lewat `pipeline`, yang tidak transaksional.
3. **`latencyMs` salah makna.** Nilainya waktu proses server, bukan latensi jaringan klien.
4. **Akun palsu dari webhook.** Webhook pihak ketiga yang membawa field `username` (misalnya nama bot) ikut membuat entri di daftar akun.
5. **Kedip STALLED.** Heartbeat 30 detik sama dengan batas STALLED (30 detik), jadi akun berkedip ONLINE/STALLED sebelum heartbeat berikutnya.

## 3. Mengapa tidak memakai antrean (queue) terpisah

Permintaan awal menyebut "Queue atau transaction lock". Yang dipilih: **transaction lock (optimistic, compare-and-set)**.

- Webhook Anime Dice hanya menambah log. `LPUSH` + `LTRIM` di dalam `MULTI` bersifat atomik, jadi burst serentak tidak bisa bentrok atau hilang. Tidak ada status bersama yang perlu diantre.
- Status akun memakai `EVAL` Redis (lihat `CAS_SCRIPT` di `lib/server/store.js`): tulis hanya jika `rev` belum berubah, akun dan log ditulis dalam satu langkah. Yang kalah balapan membaca ulang dan mencoba lagi (maks 6 kali, dengan jeda acak). Percobaan terakhir menulis tanpa syarat, jadi data tidak pernah dibuang.
- Antrean sungguhan (consumer terjadwal) baru berguna jika beban melampaui kapasitas tulis Upstash, dan butuh cron. Vercel Hobby hanya mengizinkan cron harian. Menambahkannya sekarang menambah komponen tanpa memperbaiki bug yang ada.

Pemicu untuk menambah antrean nanti: `429`/timeout dari Upstash di bawah beban nyata, atau kebutuhan pemrosesan berat per payload.

## 4. Skema data

Akun disimpan di hash Redis `account_status` (field = `username`, nilai = JSON). Kolom:

`username`, `displayName`, `state`, `gameName`, `userId`, `placeId`, `jobId`, `event`, `latencyMs`, `sessionStart`, `lastUpdate`

Tambahan internal: `status` (alias `state`, dibaca dashboard lama), `timestamp` (alias `sessionStart`), `avatarUrl`, `scriptName`, `rev` (nomor revisi untuk compare-and-set).
Data lama tanpa `rev` dianggap `rev = 0`, jadi **tidak perlu migrasi**.

Kunci lain: `webhook_logs` (maks 200), `webhook_quarantine` (maks 50, payload yang tidak bisa diproses), `webhook:status` (saklar receiver).

`lastUpdate` selalu diisi server, tidak pernah dipercaya dari klien.

## 5. Perilaku endpoint webhook Anime Dice

| Kondisi | Respons |
|---|---|
| Token salah / kosong | 401 |
| Token server belum diset | 503 |
| Body > 64 KB | 413 |
| > 600 request/menit dari satu IP | 429 + `Retry-After` |
| Saklar receiver OFF | 202, payload diabaikan |
| Bukan JSON / bukan object | 202, masuk karantina |
| Bentuk berubah | 202, field yang cocok disimpan, sisanya dibuang |
| Redis error | 503 (pengirim boleh mengulang) |

Alasan 202 untuk payload aneh: pengirim pihak ketiga yang mendapat error berulang sering mematikan webhook-nya sendiri.

**Batasan jujur:** token ada di URL (`?key=`), jadi bisa muncul di log pihak ketiga. Itu sebabnya token ini terpisah dari `RECEIVER_API_KEY`: jika bocor, hanya jalur log yang terbuka, bukan status akun. Jika pengirim mendukung header kustom atau tanda tangan HMAC, pakai itu.

## 6. Keamanan API key di script Lua

Script yang berjalan di executor **selalu bisa dibaca** siapa pun yang memegangnya. Env var di Vercel melindungi key dari bundle browser dashboard, tetapi tidak dari script Lua. Mitigasi yang sudah ada: key khusus jalur status akun, rate limit 240/menit per IP, validasi ketat, dan satu endpoint saja yang menerimanya. Jika script pernah dibagikan, ganti key.

## 7. Biaya command Upstash

Per heartbeat sekarang: `INCR` (rate limit) + `HGET` + `EVAL` = 3 command (sebelumnya ~5). Dengan interval 20 detik: sekitar 13.000 command/hari/akun. Untuk 10 akun itu sekitar 3,9 juta/bulan. Cek paket Upstash Anda. Opsi hemat: naikkan interval ke 25 detik (batas aman, STALLED di > 30 detik), atau tidak menulis log untuk heartbeat biasa.

## 8. Stack (diverifikasi lewat npm pada 15 Okt 2026)

| Paket | Versi | Catatan |
|---|---|---|
| Node | >= 20.9 (sandbox 22) | syarat Next 16 |
| next | 16.4.1 (`latest`) | `proxy.js` menggantikan `middleware.js`; `cookies()` async |
| react / react-dom | 19.x | `ref` jadi prop biasa |
| zod | 4.6.x | |
| motion | 12.x (`motion/react`, pengganti Framer Motion) | |
| @upstash/redis | 1.39.x | |
| vitest | 3.2.x | dev |

`next lint` dihapus di Next 16, jadi skrip `lint` dibuang dari `package.json`.

## 9. Struktur folder

```
app/
  api/receiver/{account,game,dice}/route.js   # tipis: hanya mengekspor handler
  api/webhook/route.js                        # alias dice + GET log
components/                                   # UI (motion)
lib/
  domain/    accounts, accountStatus, constants, logStats, schemas, sanitize   # murni, tanpa I/O
  server/    auth, http, redis, rateLimit, session, store
  server/handlers/   accountHeartbeat, diceWebhook
  client.js
proxy.js                                      # sebelumnya middleware.js
roblox/account_status.lua
tests/
```

## 10. Yang belum diverifikasi

- Perilaku di Vercel + Upstash sungguhan (hanya diuji dengan mock handler, Lua CAS lewat Redis tiruan yang menjalankan Lua asli, dan `next build`).
- Animasi di browser: build lulus, tetapi tampilan visual belum dilihat. Cek di tab Akun saat heartbeat masuk.
- Script Lua dijalankan di executor sungguhan: hanya sintaks yang diperiksa.
