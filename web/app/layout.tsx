import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { GrowthAnalytics } from '@/components/GrowthAnalytics';
import './globals.css';
import '@/components/site/site.css';
import '@/components/picks/native-cards.css';

export const viewport: Viewport = {
  themeColor: '#0A0908',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.betwithgary.ai'),
  title: 'Gary AI — Free Sports Picks With Written Reasoning',
  description:
    'Explore free sports picks, written reasoning, research and a public game-pick record. Coverage updates as analysis is published.',
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
    <html lang="en">
      <body>
        <JsonLd data={organization} />
        <JsonLd data={webSite} />
        <Nav />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <Footer />
        <GrowthAnalytics />
      </body>
    </html>
  );
}
