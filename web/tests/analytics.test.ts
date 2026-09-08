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

  it.each([
    'www.google.com', 'www.google.co.uk', 'www.google.com.au', 'www.google.de', 'www.google.cat',
    'www.bing.com', 'duckduckgo.com', 'search.yahoo.com', 'www.ecosia.org', 'search.brave.com',
  ])('preserves the organic search classification for %s', host => {
    expect(attributionTouch({
      url: 'https://www.betwithgary.ai/today',
      referrer: `https://${host}/search?q=gary`,
    })).toMatchObject({ source: host.replace(/^www\./, ''), medium: 'organic' });
  });

  it.each([
    'accounts.google.com', 'docs.google.com', 'mail.google.com', 'drive.google.com',
    'calendar.google.com', 'google.com.example.org', 'notgoogle.com', 't.co',
  ])('keeps %s as a referral without claiming it is search traffic', host => {
    expect(attributionTouch({
      url: 'https://www.betwithgary.ai/picks',
      referrer: `https://${host}/private?continue=secret`,
    })).toEqual({ source: host, medium: 'referral', referrer: host, landing: '/picks' });
  });

  it('preserves explicit campaign attribution even with an account-domain referrer', () => {
    expect(attributionTouch({
      url: 'https://www.betwithgary.ai/picks?utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=bio_v1',
      referrer: 'https://accounts.google.com/private',
    })).toEqual({
      source: 'x', medium: 'social', campaign: 'launch', content: 'bio_v1',
      referrer: 'accounts.google.com', landing: '/picks',
    });
    // Stored source/medium alone cannot establish whether an old value was inferred.
    expect(attributionTouch({
      url: 'https://www.betwithgary.ai/picks?utm_source=accounts.google.com&utm_medium=organic',
      referrer: 'https://accounts.google.com/private',
    })).toMatchObject({ source: 'accounts.google.com', medium: 'organic' });
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
