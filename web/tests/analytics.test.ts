import { describe, expect, it } from 'vitest';
import { attributionTouch } from '@/lib/gary/analytics';

describe('attributionTouch', () => {
  it('stores campaign tokens and a pathname without query strings or fragments', () => {
    const touch = attributionTouch({
      url: 'https://www.betwithgary.ai/picks/nba?utm_source=X&utm_medium=Social&utm_campaign=Launch%20Week&email=fan@example.com#top',
      referrer: 'https://t.co/secret?user=fan@example.com',
    });

    expect(touch).toEqual({
      source: 'x',
      medium: 'social',
      campaign: 'launch_week',
      referrer: 't.co',
      landing: '/picks/nba',
    });
    expect(JSON.stringify(touch)).not.toContain('fan@example.com');
    expect(JSON.stringify(touch)).not.toContain('?');
  });

  it('classifies search referrers as organic and keeps only the hostname', () => {
    expect(
      attributionTouch({
        url: 'https://www.betwithgary.ai/today',
        referrer: 'https://www.google.com/search?q=free+sports+picks',
      }),
    ).toEqual({
      source: 'google.com',
      medium: 'organic',
      referrer: 'google.com',
      landing: '/today',
    });
  });

  it('treats same-site referrers as direct and supports the short src parameter', () => {
    expect(
      attributionTouch({
        url: 'https://www.betwithgary.ai/app?src=newsletter',
        referrer: 'https://betwithgary.ai/pricing?private=value',
        siteHost: 'www.betwithgary.ai',
      }),
    ).toEqual({ source: 'newsletter', medium: 'campaign', landing: '/app' });
  });
});
