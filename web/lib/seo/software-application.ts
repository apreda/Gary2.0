import { SITE_URL } from './metadata';

export const APP_STORE_URL = 'https://apps.apple.com/us/app/gary-ai/id6751238914';

/**
 * App-specific structured data belongs only on /app, where every claim below
 * is represented in visible page content. Ratings are intentionally omitted:
 * App Store ratings move over time and should not be published from a stale
 * hard-coded snapshot.
 */
export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Gary AI - Sports Betting Picks',
  alternateName: 'Gary AI',
  operatingSystem: 'iOS',
  applicationCategory: 'SportsApplication',
  description:
    'The Gary AI iOS app publishes daily sports picks with written reasoning, live scores, insight boards, and a public performance ledger.',
  url: `${SITE_URL}/app`,
  image: `${SITE_URL}/brand/GaryIconBG.png`,
  downloadUrl: APP_STORE_URL,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Gary A.I. LLC',
    url: `${SITE_URL}/`,
  },
} as const;
