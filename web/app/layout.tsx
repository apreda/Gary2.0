import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import './globals.css';

const barlow = Barlow_Condensed({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-barlow' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono' });

export const viewport: Viewport = {
  themeColor: '#0A0908',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.betwithgary.ai'),
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Gary AI covers the full slate across pro and college sports with free daily picks, written rationale, and a public track record. Free on iOS.',
  itunes: { appId: '6751238914' },
  // Home-screen install path. iOS reads these on "Add to Home Screen" and opens
  // the site without browser chrome — the web's answer to the App Store gate on
  // 2.23. The manifest itself lives in app/manifest.ts.
  appleWebApp: { capable: true, title: 'Gary', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  openGraph: { siteName: 'Gary AI', type: 'website' },
  alternates: { types: { 'application/rss+xml': '/feed.xml' } },
};

const webSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Gary AI',
  alternateName: 'betwithgary.ai',
  url: 'https://www.betwithgary.ai/',
};

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Gary A.I. LLC',
  url: 'https://www.betwithgary.ai/',
  logo: 'https://www.betwithgary.ai/brand/GaryIconBG.png',
  sameAs: ['https://apps.apple.com/us/app/gary-ai/id6751238914', 'https://x.com/BetwithGary'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable} ${jbmono.variable}`}>
      <body>
        <JsonLd data={organization} />
        <JsonLd data={webSite} />
        <Nav />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
