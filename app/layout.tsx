import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Newsreader, Pinyon_Script } from 'next/font/google';
import '../src/styles.css';

// Fonts are downloaded at build time and served from this site, so they also work offline.
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], axes: ['opsz'], variable: '--font-serif', display: 'swap' });
const script = Pinyon_Script({ subsets: ['latin'], weight: '400', variable: '--font-script', display: 'swap' });

// iPhone launch screens, one per screen size.
const SPLASH: [number, number, number, string][] = [
  [375, 812, 3, '1125x2436'], [390, 844, 3, '1170x2532'], [393, 852, 3, '1179x2556'], [402, 874, 3, '1206x2622'],
  [414, 896, 2, '828x1792'], [428, 926, 3, '1284x2778'], [430, 932, 3, '1290x2796'], [440, 956, 3, '1320x2868']
];

export const metadata: Metadata = {
  title: "Akosua's command center",
  description: 'Day, money, health, social life and learning, synced across your devices.',
  applicationName: 'Command center',
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'Command center',
    statusBarStyle: 'default',
    startupImage: SPLASH.map(([w, h, r, size]) => ({
      url: `/splash/splash-${size}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r})`
    }))
  },
  other: { 'apple-mobile-web-app-capable': 'yes' },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#070B14',
  colorScheme: 'dark'
};

// Moody is the default. Switch to Light before the page paints if this device chose it.
const THEME = `try{if(localStorage.getItem('theme')==='light'){delete document.documentElement.dataset.theme;var t=document.querySelector('meta[name="theme-color"]');if(t)t.content='#D8CFC1';var c=document.querySelector('meta[name="color-scheme"]');if(c)c.content='light only';}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="moody" className={`${sans.variable} ${serif.variable} ${script.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
