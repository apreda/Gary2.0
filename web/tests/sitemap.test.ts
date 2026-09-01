import { beforeEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import archiveSitemap from '@/app/archive/sitemap';
import gameSitemap from '@/app/picks/sitemap';
import robots from '@/app/robots';
import { sitemapIdsForCount } from '@/lib/seo/sitemap';
import type { ArchiveDateSummary } from '@/lib/gary/archive';
import { SPORTS } from '@/lib/gary/leagues';
import type { PickIndexRow } from '@/lib/gary/gamepage';

const BASE_URL = 'https://www.betwithgary.ai';
const pathOf = (url: string) => new URL(url).pathname;

const clock = vi.hoisted(() => ({ today: '2026-09-01' }));
const index: PickIndexRow[] = [];
const archive: ArchiveDateSummary[] = [];

vi.mock('@/lib/gary/dates', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/gary/dates')>();
  return { ...mod, todayEST: () => clock.today };
});

vi.mock('@/lib/gary/gamepage', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/gary/gamepage')>();
  return { ...mod, fetchPickIndex: async () => index };
});

vi.mock('@/lib/gary/archive', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/gary/archive')>();
  return { ...mod, fetchArchiveDateSummaries: async () => archive };
});

const FIXED = [
  '/',
  '/picks',
  ...SPORTS.filter(sport => sport.slug !== 'world-cup').map(sport => `/picks/${sport.slug}`),
  '/props',
  '/results',
  ...SPORTS.map(sport => `/results/${sport.slug}`),
  '/results/audit',
  '/archive',
  '/hub',
  '/nfl',
  '/pricing',
  '/how-it-works',
  '/about',
  '/editorial-standards',
  '/data-sources',
  '/corrections',
  '/app',
  '/press',
  '/contact',
  '/terms',
  '/privacy',
];

describe('sitemap', () => {
  beforeEach(() => {
    index.length = 0;
    archive.length = 0;
    clock.today = '2026-09-01';
  });

  it('lists every public indexable route exactly once', async () => {
    const items = await sitemap();
    const paths = items.map(item => pathOf(item.url));
    expect(paths).toEqual(FIXED);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).not.toContain('/account');
    expect(paths).not.toContain('/you');
    expect(paths).not.toContain('/picks/world-cup');
    expect(paths).not.toContain('/results.csv');
    expect(paths).not.toContain('/results.json');
    expect(items.every(item => item.url.startsWith(BASE_URL))).toBe(true);
  });

  it('does not invent last-modified timestamps', async () => {
    expect((await sitemap()).every(item => item.lastModified === undefined)).toBe(true);
  });

  it('marks retired sport pages as archives and active sport pages as daily', async () => {
    const byPath = new Map((await sitemap()).map(item => [pathOf(item.url), item]));
    for (const sport of SPORTS) {
      const expectedFrequency = sport.retired ? 'yearly' : 'daily';
      if (sport.slug === 'world-cup') {
        expect(byPath.has(`/picks/${sport.slug}`)).toBe(false);
      } else {
        expect(byPath.get(`/picks/${sport.slug}`)?.changeFrequency).toBe(expectedFrequency);
      }
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
    const paths = (await gameSitemap({ id: Promise.resolve('0') })).map(item => pathOf(item.url));
    expect(paths).toEqual([
      '/picks/mlb/2026-08-30',
      '/picks/mlb/2026-08-30/cubs-at-reds',
      '/picks/mlb/2026-08-30/rays-at-padres',
    ]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('adds only content-backed archive dates and one hub per represented month', async () => {
    archive.push(
      { date: '2026-09-01', hasGamePicks: true, hasProps: true, hasResearch: true },
      { date: '2026-08-31', hasGamePicks: true, hasProps: false, hasResearch: true },
      { date: '2026-08-02', hasGamePicks: true, hasProps: true, hasResearch: false },
    );
    const items = await archiveSitemap();
    const paths = items.map(item => pathOf(item.url));
    expect(paths).toEqual([
      '/archive/month/2026-09',
      '/archive/month/2026-08',
      '/archive/2026-09-01',
      '/archive/2026-08-31',
      '/archive/2026-08-02',
    ]);
    expect(items.find(item => pathOf(item.url) === '/archive/2026-09-01')?.changeFrequency).toBe('daily');
    expect(items.find(item => pathOf(item.url) === '/archive/2026-08-02')?.changeFrequency).toBe('yearly');
  });

  it('drops the NFL launch campaign when its permanent redirect begins', async () => {
    clock.today = '2026-09-09';
    const paths = (await sitemap()).map(item => pathOf(item.url));
    expect(paths).not.toContain('/nfl');
    expect(paths).toContain('/picks/nfl');
  });

  it('partitions permanent game URLs before the 50,000 URL limit', () => {
    expect(sitemapIdsForCount(0)).toEqual([{ id: 0 }]);
    expect(sitemapIdsForCount(40_000)).toEqual([{ id: 0 }]);
    expect(sitemapIdsForCount(40_001)).toEqual([{ id: 0 }, { id: 1 }]);
  });

  it('advertises the root, archive, and generated game sitemaps in robots.txt', async () => {
    index.push({ date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' });
    const result = await robots();
    expect(result.sitemap).toEqual([
      'https://www.betwithgary.ai/sitemap.xml',
      'https://www.betwithgary.ai/archive/sitemap.xml',
      'https://www.betwithgary.ai/picks/sitemap/0.xml',
    ]);
  });
});
