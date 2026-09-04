import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/feed.xml/route';
import { BoardGrid } from '@/components/board/BoardGrid';
import { GameRow } from '@/components/board/GameRow';
import { buildBoard } from '@/lib/gary/board';
import { fetchPickIndexForDates, type PickIndexRow } from '@/lib/gary/gamepage';
import { fetchPublishedPickPaths, publishedPickPath } from '@/lib/gary/pick-links';
import { fetchTodayGamePicks } from '@/lib/gary/picks';
import type { GaryPick } from '@/lib/gary/types';

vi.mock('@/lib/gary/gamepage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/gamepage')>(),
  fetchPickIndexForDates: vi.fn(),
}));
vi.mock('@/lib/gary/picks', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/picks')>(),
  fetchTodayGamePicks: vi.fn(),
}));
vi.mock('@/components/book/TailFadeRow', () => ({ TailFadeRow: () => null }));

const date = '2026-09-04';
const path = '/picks/mlb/2026-09-04/red-sox-at-new-york-yankees';
const pick: GaryPick = {
  league: 'MLB', awayTeam: 'Red Sox', homeTeam: 'New York Yankees',
  pick: 'Red Sox ML +125', rationale: 'The matchup & the bullpen support this pick.',
  commence_time: '2026-09-04T23:10:00Z',
};
const weekly: GaryPick = {
  league: 'NFL', awayTeam: 'Cowboys', homeTeam: 'Eagles', pick: 'Eagles -3',
  commence_time: '2026-09-04T00:20:00Z',
};
const rows: PickIndexRow[] = [
  { date, league: 'MLB', sport: null, away_team: 'Red Sox', home_team: 'New York Yankees' },
  { date: '2026-09-03', league: 'NFL', sport: null, away_team: 'Cowboys', home_team: 'Eagles' },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-04T20:00:00Z'));
  vi.mocked(fetchPickIndexForDates).mockResolvedValue(rows);
  vi.mocked(fetchTodayGamePicks).mockResolvedValue([pick]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('published pick discovery', () => {
  it('uses stored names for the canonical URL and the ET date for earlier weekly games', async () => {
    const paths = await fetchPublishedPickPaths([pick, weekly], date);
    expect(publishedPickPath(pick, date, paths)).toBe(path);
    expect(publishedPickPath(weekly, date, paths)).toBe('/picks/nfl/2026-09-03/cowboys-at-eagles');
    expect(fetchPickIndexForDates).toHaveBeenCalledWith(expect.arrayContaining([date, '2026-09-03']), 600);
  });

  it('does not invent links for pending, missing, unsupported, prop, or future pages', async () => {
    const paths = await fetchPublishedPickPaths([pick], date);
    expect(publishedPickPath(null, date, paths)).toBeNull();
    expect(publishedPickPath(pick, date, new Set())).toBeNull();
    expect(publishedPickPath({ ...pick, homeTeam: undefined }, date, paths)).toBeNull();
    expect(publishedPickPath({ ...pick, type: 'prop' }, date, paths)).toBeNull();
    expect(publishedPickPath({ ...pick, league: 'EPL' }, date, paths)).toBeNull();
    expect(publishedPickPath({ ...weekly, commence_time: '2026-09-06T17:00:00Z' }, date,
      new Set(['/picks/nfl/2026-09-06/cowboys-at-eagles']))).toBeNull();
  });

  it('ships a descriptive permanent link in the initial HTML of a closed pick card', () => {
    const game = buildBoard([], [pick])[0];
    const markup = renderToStaticMarkup(createElement(BoardGrid, {
      items: [{
        key: game.key, label: `${game.away} at ${game.home}`,
        tile: createElement('span', null, 'Pick preview'),
        panel: createElement(GameRow, { game, analysisHref: path }),
      }],
    }));
    expect(markup).toMatch(new RegExp(`<a[^>]+href="${path}"`));
    expect(markup).toContain('Red Sox at New York Yankees: pick and full analysis</a>');
    expect(markup).toContain('The matchup &amp; the bullpen support this pick.');
    expect(markup).toMatch(/<details[^>]*>/);
    expect(markup).not.toMatch(/<details[^>]*\sopen(?:=|>)/);
    expect(renderToStaticMarkup(createElement(GameRow, { game }))).not.toContain('pick and full analysis</a>');
  });
});

describe('RSS pick permalinks', () => {
  it('links each item to its dated analysis and preserves escaping', async () => {
    vi.mocked(fetchTodayGamePicks).mockResolvedValue([pick, weekly]);
    const response = await GET();
    const xml = await response.text();
    expect(response.headers.get('Content-Type')).toContain('application/rss+xml');
    expect(xml).toContain(`<link>https://www.betwithgary.ai${path}</link>`);
    expect(xml).toContain('<link>https://www.betwithgary.ai/picks/nfl/2026-09-03/cowboys-at-eagles</link>');
    expect(xml).toContain('The matchup &amp; the bullpen support this pick.');
    expect(xml).not.toContain('<link>https://www.betwithgary.ai/picks/mlb</link>');
  });

  it('keeps fallback item identities stable when pick order changes', async () => {
    vi.mocked(fetchTodayGamePicks).mockResolvedValue([pick, weekly]);
    const first = await (await GET()).text();
    vi.mocked(fetchTodayGamePicks).mockResolvedValue([weekly, pick]);
    const second = await (await GET()).text();
    const guids = (xml: string) => [...xml.matchAll(/<guid[^>]*>(.*?)<\/guid>/g)].map(match => match[1]).sort();
    expect(guids(first)).toHaveLength(2);
    expect(guids(second)).toEqual(guids(first));
  });

  it('omits picks until their permanent page is available', async () => {
    vi.mocked(fetchTodayGamePicks).mockResolvedValue([pick, { ...weekly, commence_time: '2026-09-06T17:00:00Z' }]);
    const xml = await (await GET()).text();
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).not.toContain('Cowboys');
  });

  it('fails a feed regeneration when its source fails instead of returning an empty success', async () => {
    vi.mocked(fetchPickIndexForDates).mockRejectedValue(new Error('index unavailable'));
    await expect(GET()).rejects.toThrow('index unavailable');
    vi.mocked(fetchTodayGamePicks).mockRejectedValue(new Error('picks unavailable'));
    await expect(GET()).rejects.toThrow('picks unavailable');
  });
});
