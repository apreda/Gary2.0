import { describe, expect, it } from 'vitest';
import { pageMetadata, RSS_FEED_PATH } from '@/lib/seo/metadata';
import { softwareApplicationJsonLd } from '@/lib/seo/software-application';

describe('pageMetadata', () => {
  it('keeps the canonical, RSS feed, and Open Graph URL aligned', () => {
    const metadata = pageMetadata({
      canonical: '/picks/mlb',
      title: 'MLB Picks | Gary AI',
      description: 'Daily MLB picks.',
    });

    expect(metadata.alternates?.canonical).toBe('/picks/mlb');
    expect(metadata.alternates?.types).toEqual({
      'application/rss+xml': RSS_FEED_PATH,
    });
    expect(metadata.openGraph).toMatchObject({
      title: 'MLB Picks | Gary AI',
      description: 'Daily MLB picks.',
      siteName: 'Gary AI',
      type: 'website',
      url: '/picks/mlb',
    });
  });

  it('preserves page-specific alternates and Open Graph fields', () => {
    const metadata = pageMetadata({
      canonical: '/example',
      title: 'Example',
      alternates: {
        languages: { 'en-US': '/example' },
        types: { 'application/json': '/example.json' },
      },
      openGraph: {
        images: ['/example.png'],
        locale: 'en_US',
      },
    });

    expect(metadata.alternates?.languages).toEqual({ 'en-US': '/example' });
    expect(metadata.alternates?.types).toEqual({
      'application/rss+xml': RSS_FEED_PATH,
      'application/json': '/example.json',
    });
    expect(metadata.openGraph).toMatchObject({
      images: ['/example.png'],
      locale: 'en_US',
      url: '/example',
    });
  });
});

describe('softwareApplicationJsonLd', () => {
  it('is page-relevant and does not publish a stale rating', () => {
    expect(softwareApplicationJsonLd).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Gary AI - Sports Betting Picks',
      url: 'https://www.betwithgary.ai/app',
      downloadUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
    });
    expect(softwareApplicationJsonLd).not.toHaveProperty('aggregateRating');
  });
});
