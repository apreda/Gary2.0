import type { Metadata } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const barlow = Barlow_Condensed({ weight: '700', subsets: ['latin'], variable: '--font-barlow' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://www.betwithgary.ai'),
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Gary AI covers the full slate — NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup — with free daily picks, written rationale, and a public track record. Free on iOS.',
  itunes: { appId: '6751238914' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable} ${jbmono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
