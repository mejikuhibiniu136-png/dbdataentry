import type { Dictionary } from '@/lib/i18n/dictionaries/en';

export const id: Dictionary = {
  'nav.main': 'Navigasi utama', 'nav.overview': 'Ringkasan', 'nav.logs': 'Log', 'nav.games': 'Tabel Game', 'nav.accounts': 'Akun',
  'nav.analytics': 'Analitik', 'nav.users': 'Pengguna', 'nav.sessions': 'Sesi', 'nav.system': 'Sistem', 'nav.logout': 'Keluar',

  'header.greeting': 'Halo, {name}', 'header.live': 'LIVE', 'header.connecting': 'Menyambung…', 'header.reconnecting': 'Menyambung ulang…', 'header.paused': 'Dijeda',
  'header.logCount': '{count} log', 'header.logsLoaded': 'Jumlah log dimuat', 'header.pause': 'Jeda', 'header.resume': 'Lanjut',

  'common.save': 'Simpan', 'common.cancel': 'Batal', 'common.close': 'Tutup', 'common.delete': 'Hapus', 'common.retry': 'Coba lagi', 'common.refresh': 'Muat ulang',
  'common.loading': 'Memuat…', 'common.search': 'Cari', 'common.clear': 'Bersihkan', 'common.from': 'Dari', 'common.to': 'Sampai', 'common.enabled': 'Aktif',
  'common.disabled': 'Nonaktif', 'common.actions': 'Aksi', 'common.status': 'Status', 'common.user': 'Pengguna', 'common.never': 'Belum pernah', 'common.you': 'Anda',
  'common.error': 'Terjadi kesalahan', 'common.confirm': 'Konfirmasi', 'common.loadMore': 'Muat lagi', 'common.test': 'Kirim uji',

  'auth.loginTitle': 'Masuk ke dbdataentry', 'auth.registerTitle': 'Buat akun', 'auth.loginSubtitle': 'Pantau webhook dan status akun secara real-time.', 'auth.registerSubtitle': 'Akun baru menunggu persetujuan Superadmin sebelum bisa dipakai.', 'auth.registered': 'Akun dibuat. Masuk untuk melihat status persetujuan.', 'auth.username': 'Username', 'auth.password': 'Password', 'auth.confirmPassword': 'Ulangi password', 'auth.hidePassword': 'Sembunyikan password', 'auth.showPassword': 'Tampilkan password', 'auth.minChars': 'Minimal 8 karakter.', 'auth.capsLock': 'Caps Lock sedang aktif', 'auth.processing': 'Memproses…', 'auth.login': 'Masuk', 'auth.register': 'Daftar', 'auth.noAccount': 'Belum punya akun? ', 'auth.haveAccount': 'Sudah punya akun? ', 'auth.mismatch': 'Konfirmasi password tidak sama', 'auth.errorGeneric': 'Terjadi kesalahan', 'auth.errorNetwork': 'Terjadi kesalahan jaringan',

  'role.superadmin': 'Super Admin', 'role.admin': 'Moderator / Analis', 'role.viewer': 'Pengguna / Klien',
  'lang.label': 'Bahasa', 'lang.choose': 'Pilih bahasa',

  'sessions.title': 'Sesi & perangkat', 'sessions.subtitle': 'Login yang sedang aktif, asalnya, dan cara mengakhiri salah satunya.',
  'sessions.mine': 'Sesi saya', 'sessions.all': 'Semua pengguna', 'sessions.current': 'Perangkat ini', 'sessions.device': 'Perangkat', 'sessions.location': 'Lokasi',
  'sessions.created': 'Masuk', 'sessions.lastActive': 'Terakhir aktif', 'sessions.revoke': 'Cabut', 'sessions.revokeOthers': 'Keluarkan perangkat lain',
  'sessions.revokeUser': 'Cabut semua milik pengguna ini', 'sessions.empty': 'Tidak ada sesi aktif.', 'sessions.revokedOne': 'Sesi dicabut',
  'sessions.revokedMany': '{count} sesi dicabut', 'sessions.confirmTitle': 'Cabut sesi ini?',
  'sessions.confirmBody': 'Perangkat tersebut akan keluar. Sesi yang dicabut berhenti berfungsi dalam beberapa detik.', 'sessions.confirmAllTitle': 'Cabut semua sesi {name}?',
  'sessions.confirmOthersTitle': 'Keluarkan semua perangkat lain?',

  'notify.title': 'Notifikasi alert', 'notify.subtitle': 'Kirim alert keamanan dan sistem ke Discord atau Telegram.',
  'notify.platform': 'Tujuan', 'notify.discord': 'Discord', 'notify.telegram': 'Telegram', 'notify.webhookUrl': 'URL webhook Discord', 'notify.botToken': 'Bot token',
  'notify.chatId': 'Chat ID', 'notify.keepHint': 'Kosongkan untuk mempertahankan nilai tersimpan', 'notify.enabled': 'Kirim alert', 'notify.minSeverity': 'Tingkat minimum',
  'notify.kinds': 'Jenis alert', 'notify.allKinds': 'Semua jenis', 'notify.save': 'Simpan saluran', 'notify.testSent': 'Pesan uji terkirim', 'notify.testFailed': 'Pesan uji gagal',
  'notify.saved': 'Saluran notifikasi disimpan', 'notify.remove': 'Hapus saluran', 'notify.history': 'Pengiriman terakhir', 'notify.noHistory': 'Belum ada yang terkirim.',
  'notify.configured': 'Terkonfigurasi', 'notify.notConfigured': 'Belum dikonfigurasi', 'notify.encryptionMissing': 'ENCRYPTION_KEY belum diatur, kredensial tidak dapat disegel.',
  'notify.sealedNote': 'Kredensial disegel dengan enkripsi berlapis sebelum disimpan dan tidak pernah ditampilkan lagi.',
  'notify.severity.info': 'Info', 'notify.severity.warning': 'Peringatan', 'notify.severity.critical': 'Kritis',
  'notify.kind.auth.new_ip': 'Login dari IP baru', 'notify.kind.security.spike': 'Lonjakan kejadian keamanan', 'notify.kind.ingest.error_spike': 'Lonjakan error ingest',
  'notify.kind.user.pending_approval': 'Akun menunggu persetujuan', 'notify.kind.queue.backlog': 'Antrean ingest menumpuk', 'notify.kind.queue.dead_letter': 'Dead-letter ingest',
  'notify.kind.crypto.rotation': 'Masalah rotasi kunci', 'notify.kind.session.revoked': 'Sesi dicabut admin', 'notify.kind.system.test': 'Pesan uji',

  'queue.title': 'Antrean ingest', 'queue.subtitle': 'Meredam lonjakan trafik dari skrip game dan memprosesnya secara asinkron.',
  'queue.mode': 'Mode antrean', 'queue.modeHint': 'Nyala: request diterima seketika (202) dan diproses di latar. Mati: ditulis langsung (bawaan).',
  'queue.depth': 'Menunggu', 'queue.inflight': 'Diproses', 'queue.dead': 'Dead-letter', 'queue.processed': 'Selesai', 'queue.retried': 'Diulang', 'queue.rejected': 'Ditolak (penuh)',
  'queue.oldest': 'Item tertua', 'queue.drain': 'Kuras sekarang', 'queue.retryDead': 'Ulangi dead-letter', 'queue.purgeDead': 'Kosongkan dead-letter',

  'logs.searchPlaceholder': 'Cari di semua log tersimpan…', 'logs.syntax': 'Tips: "frasa persis", -kecualikan, event:Win, user:alice, game:slug',
  'logs.results': '{count} cocok', 'logs.scanned': '{count} log dipindai', 'logs.truncated': 'Hanya 5.000 log terbaru yang dicari.',
  'logs.exportCsv': 'Ekspor CSV', 'logs.exportJson': 'Ekspor JSON', 'logs.exportNdjson': 'Ekspor NDJSON', 'logs.serverSearch': 'Cari di server', 'logs.noMatches': 'Tidak ada log yang cocok.',

  'welcome.title': 'Selamat datang, {name}', 'welcome.subtitle': 'Dasbor pemantauan akun game real-time Anda siap digunakan.', 'welcome.f1': 'Pemantauan langsung',
  'welcome.f2': 'Pengelolaan akun', 'welcome.f3': 'Dirancang aman', 'welcome.enter': 'Masuk ke dasbor', 'welcome.hint': 'Tur panduan dapat dimulai dari dasbor.',
  'tour.step': 'Langkah {current} dari {total}', 'tour.skip': 'Lewati tur', 'tour.back': 'Kembali', 'tour.done': 'Selesai', 'tour.next': 'Lanjut',
  'tour.s1.title': 'Selamat datang di dasbor', 'tour.s1.body': 'Tur singkat ini memperkenalkan bagian utama dbdataentry.',
  'tour.s2.title': 'Navigasikan ruang kerja', 'tour.s2.body': 'Gunakan bilah samping untuk berpindah antara pemantauan, laporan, dan pengaturan sistem.',
  'tour.s3.title': 'Periksa status langsung', 'tour.s3.body': 'Lihat status koneksi dan layanan secara sekilas.',
  'tour.s4.title': 'Tinjau data Anda', 'tour.s4.body': 'Jelajahi tabel akun, game, dan peristiwa dari dasbor.',
  'tour.s5.title': 'Jelajahi bagian ini', 'tour.s5.body': 'Area utama menampilkan konten bagian yang Anda pilih.',
  'tour.s6.title': 'Atur umpan langsung', 'tour.s6.body': 'Jeda atau lanjutkan pembaruan langsung kapan pun diperlukan.',
};
