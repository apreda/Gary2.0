import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { SPORTS } from '@/lib/gary/leagues';

const BASE_URL = 'https://www.betwithgary.ai';

const pathOf = (url: string) => new URL(url).pathname;

describe('sitemap', () => {
  it('lists every public indexable route exactly once', () => {
    const paths = sitemap().map(item => pathOf(item.url));
    const expectedPaths = [
      '/',
      '/picks',
      ...SPORTS.map(sport => `/picks/${sport.slug}`),
      '/props',
      '/results',
      ...SPORTS.map(sport => `/results/${sport.slug}`),
      '/hub',
      '/nfl',
      '/pricing',
      '/how-it-works',
      '/app',
      '/press',
      '/contact',
      '/terms',
      '/privacy',
    ];

    expect(paths).toEqual(expectedPaths);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).not.toContain('/account');
    expect(paths).not.toContain('/you');
    expect(sitemap().every(item => item.url.startsWith(BASE_URL))).toBe(true);
  });

  it('does not invent last-modified timestamps', () => {
    expect(sitemap().every(item => item.lastModified === undefined)).toBe(true);
  });

  it('marks retired sport pages as archives and active sport pages as daily', () => {
    const byPath = new Map(sitemap().map(item => [pathOf(item.url), item]));

    for (const sport of SPORTS) {
      const expectedFrequency = sport.retired ? 'yearly' : 'daily';

      expect(byPath.get(`/picks/${sport.slug}`)?.changeFrequency).toBe(expectedFrequency);
      expect(byPath.get(`/results/${sport.slug}`)?.changeFrequency).toBe(expectedFrequency);
    }
  });
});
