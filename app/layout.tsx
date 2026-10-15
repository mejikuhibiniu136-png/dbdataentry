import type { Metadata, Viewport } from 'next';
import './globals.css';
import { MotionProvider } from '@/components/ui/MotionProvider';

export const metadata: Metadata = {
  title: 'dbdataentry · Webhook & Log Tracker',
  description: 'Dashboard real-time untuk webhook universal dan status akun.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#070a12', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body><MotionProvider>{children}</MotionProvider></body>
    </html>
  );
}
