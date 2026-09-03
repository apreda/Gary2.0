import { describe, expect, it } from 'vitest';
import { buildReferralShareUrl } from '@/components/ShareActions';

describe('buildReferralShareUrl', () => {
  it('adds aggregate referral attribution to an absolute URL', () => {
    const url = new URL(buildReferralShareUrl(
      'https://www.betwithgary.ai/results/audit#monthly',
      'https://www.betwithgary.ai',
      'Results Audit',
    ));

    expect(url.origin + url.pathname).toBe('https://www.betwithgary.ai/results/audit');
    expect(url.hash).toBe('');
    expect(url.searchParams.get('utm_source')).toBe('gary');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_campaign')).toBe('results_audit');
  });

  it('resolves relative URLs and replaces stale share attribution', () => {
    const url = new URL(buildReferralShareUrl(
      '/picks/mlb/2026-09-03/example?utm_source=old&utm_medium=old',
      'https://preview.example',
      'Matchup Page',
    ));

    expect(url.origin).toBe('https://preview.example');
    expect(url.searchParams.get('utm_source')).toBe('gary');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_campaign')).toBe('matchup_page');
  });
});
