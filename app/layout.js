import './globals.css';

export const metadata = {
  title: 'dbdataentry - Webhook & DB Analytics',
  description: 'Advanced Webhook Dashboard and Database Usage Monitor',
  robots: { index: false, follow: false },
};

// Menerapkan tema tersimpan sebelum halaman digambar agar tidak berkedip.
const themeScript =
  "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}";

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
