import { beforeEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { SPORTS } from '@/lib/gary/leagues';
import type { PickIndexRow } from '@/lib/gary/gamepage';

const BASE_URL = 'https://www.betwithgary.ai';
const pathOf = (url: string) => new URL(url).pathname;

const index: PickIndexRow[] = [];
vi.mock('@/lib/gary/gamepage', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/gary/gamepage')>();
  return { ...mod, fetchPickIndex: async () => index };
});

const FIXED = [
  '/',
  '/picks',
  ...SPORTS.map(sport => `/picks/${sport.slug}`),
  '/props',
  '/results',
  ...SPORTS.map(sport => `/results/${sport.slug}`),
  '/archive',
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

describe('sitemap', () => {
  beforeEach(() => { index.length = 0; });

  it('lists every public indexable route exactly once', async () => {
    const items = await sitemap();
    const paths = items.map(item => pathOf(item.url));
    expect(paths).toEqual(FIXED);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).not.toContain('/account');
    expect(paths).not.toContain('/you');
    expect(items.every(item => item.url.startsWith(BASE_URL))).toBe(true);
  });

  it('does not invent last-modified timestamps', async () => {
    expect((await sitemap()).every(item => item.lastModified === undefined)).toBe(true);
  });

  it('marks retired sport pages as archives and active sport pages as daily', async () => {
    const byPath = new Map((await sitemap()).map(item => [pathOf(item.url), item]));
    for (const sport of SPORTS) {
      const expectedFrequency = sport.retired ? 'yearly' : 'daily';
      expect(byPath.get(`/picks/${sport.slug}`)?.changeFrequency).toBe(expectedFrequency);
      expect(byPath.get(`/results/${sport.slug}`)?.changeFrequency).toBe(expectedFrequency);
    }
  });

  it('adds one day page and one game page per published pick, after the fixed routes', async () => {
    index.push(
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' },
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' },
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Rays', home_team: 'Padres' },
      { date: '2026-06-01', league: 'EPL', sport: null, away_team: 'Arsenal', home_team: 'Spurs' },
    );
    const paths = (await sitemap()).map(item => pathOf(item.url));
    expect(paths.slice(0, FIXED.length)).toEqual(FIXED);
    expect(paths.slice(FIXED.length)).toEqual([
      '/picks/mlb/2026-08-30',
      '/picks/mlb/2026-08-30/cubs-at-reds',
      '/picks/mlb/2026-08-30/rays-at-padres',
    ]);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
