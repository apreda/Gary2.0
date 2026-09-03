import { describe, expect, it } from 'vitest';
import {
  buildAppStoreUrl,
  normalizeAppStoreSurface,
  normalizeCreatorHandle,
} from '@/lib/gary/app-store';
import {
  hasGrantedAnalyticsCookie,
  safeLandingPath,
  safeReferrerHost,
  shouldTrackStandardHandoff,
} from '@/lib/gary/link-attribution';

describe('App Store destinations', () => {
  it('adds only validated Apple attribution parameters', () => {
    const valid = new URL(
      buildAppStoreUrl({
        providerToken: '1234567',
        campaignToken: 'web_launch',
        productPageId: '3c207d81-dc0d-4cc3-a50d-b5f47e29b18f',
      }),
    );
    expect(valid.searchParams.get('pt')).toBe('1234567');
    expect(valid.searchParams.get('ct')).toBe('web_launch');
    expect(valid.searchParams.get('ppid')).toBe('3c207d81-dc0d-4cc3-a50d-b5f47e29b18f');

    const invalid = new URL(buildAppStoreUrl({ providerToken: 'invented-token', campaignToken: 'bad token' }));
    expect(invalid.searchParams.has('pt')).toBe(false);
    expect(invalid.searchParams.has('ct')).toBe(false);
  });

  it('allows known CTA surfaces and rejects arbitrary values', () => {
    expect(normalizeAppStoreSurface('game_page_nba')).toBe('game_page_nba');
    expect(normalizeAppStoreSurface('NFL page hero')).toBe('nfl_page_hero');
    expect(normalizeAppStoreSurface('https://evil.example')).toBe('unknown');
  });

  it('keeps creator campaign identifiers within 30 characters', () => {
    const handle = normalizeCreatorHandle('A-Very_Long.Creator_Handle_That_Continues');
    expect(`cr_${handle}`).toMatch(/^cr_[a-z0-9_]+$/);
    expect(`cr_${handle}`).toHaveLength(30);
  });
});

describe('link attribution sanitizers', () => {
  it('removes paths and queries from referrers', () => {
    expect(safeReferrerHost('https://www.example.com/private/path?email=fan@example.com')).toBe('example.com');
  });

  it('removes query strings from landing paths and rejects full URLs', () => {
    expect(safeLandingPath('/picks/nba?email=fan@example.com#top')).toBe('/picks/nba');
    expect(safeLandingPath('https://evil.example/path')).toBeUndefined();
  });

  it('measures standard handoffs only with both consent and an explicit click marker', () => {
    const clickId = 'd00fd270-bd79-4a0d-9dc4-8728d9ad21f8';
    const measured = new URL(`https://www.betwithgary.ai/go/app?measure=1&click_id=${clickId}`);
    expect(shouldTrackStandardHandoff(measured, 'gary_analytics_consent=granted')).toBe(true);
    expect(shouldTrackStandardHandoff(measured, 'gary_analytics_consent=declined')).toBe(false);
    expect(shouldTrackStandardHandoff(new URL('https://www.betwithgary.ai/go/app'), 'gary_analytics_consent=granted')).toBe(false);
  });

  it('recognizes only an explicit granted analytics preference cookie', () => {
    expect(hasGrantedAnalyticsCookie('theme=dark; gary_analytics_consent=granted; session=abc')).toBe(true);
    expect(hasGrantedAnalyticsCookie('gary_analytics_consent=declined')).toBe(false);
    expect(hasGrantedAnalyticsCookie(null)).toBe(false);
  });
});
