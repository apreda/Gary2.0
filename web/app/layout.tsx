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
  themeColor: '#08080A',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.betwithgary.ai'),
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Gary AI covers the full slate — NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup — with free daily picks, written rationale, and a public track record. Free on iOS.',
  itunes: { appId: '6751238914' },
};

const softwareApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Gary AI',
  operatingSystem: 'iOS',
  applicationCategory: 'SportsApplication',
  description:
    'Free AI sports picks for every game, every day — NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup — with written reasoning and a public track record.',
  url: 'https://www.betwithgary.ai/',
  image: 'https://www.betwithgary.ai/brand/GaryIconBG.png',
  downloadUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Gary A.I. LLC', url: 'https://www.betwithgary.ai/' },
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
        <JsonLd data={softwareApp} />
        <JsonLd data={organization} />
        <Nav />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
