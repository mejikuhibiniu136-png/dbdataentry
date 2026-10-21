import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { Spotlight } from '@/components/ui/Spotlight';
import { getDictionary, getLocale } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: 'dbdataentry · Webhook & Log Tracker',
  description: 'Real-time dashboard for universal webhooks and account status.',
  robots: { index: false, follow: false },
};
// Font di-host sendiri oleh next/font (diunduh saat build, tanpa permintaan ke Google saat runtime), jadi
// CSP `font-src 'self'` tetap berlaku. Sebelumnya 'Inter' hanya dideklarasikan tanpa dimuat -> jatuh ke font sistem.
// Inter: teks & tabel (terbaca di ukuran kecil, angka tabular). Space Grotesk: judul & angka statistik. JetBrains Mono: kode/URL.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const grotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-grotesk' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-jbmono' });

export const viewport: Viewport = { themeColor: '#070a12', colorScheme: 'dark' };

// Bahasa ditentukan di server (cookie > Accept-Language > en) sehingga HTML pertama sudah benar,
// tanpa kedip. Hanya kamus bahasa aktif yang dikirim ke klien.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <html lang={locale} className={`${inter.variable} ${grotesk.variable} ${mono.variable}`}>
      <body>
        <div className="aurora" aria-hidden><i /><i /><i /></div>
        <Spotlight />
        <I18nProvider locale={locale} dictionary={dictionary}><MotionProvider>{children}</MotionProvider></I18nProvider></body>
    </html>
  );
}
