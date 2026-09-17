import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropPick } from '@/lib/gary/types';
import type { SlateRow } from '@/lib/gary/board';

const feed = vi.hoisted(() => ({ props: [] as PropPick[], slate: [] as SlateRow[] | null, propsError: false }));
vi.mock('@/lib/gary/picks', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/picks')>(),
  fetchTodayPropPicks: async () => { if (feed.propsError) throw new Error('Fixture source unavailable'); return feed.props; },
}));
vi.mock('@/lib/gary/board', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/board')>(),
  fetchDailySlate: async () => { if (feed.slate === null) throw new Error('Slate unavailable'); return feed.slate; },
}));
vi.mock('@/components/book/TailFadeRow', () => ({ PropTailFadeRow: () => null, TailFadeRow: () => null }));
vi.mock('@/components/BoardDateNotice', () => ({ BoardDateNotice: () => null }));

import { PropLanePage } from '@/components/board/PropLanePage';
import { propLaneState } from '@/lib/gary/prop-lane-pages';
import { metadata as hrMetadata } from '@/app/props/home-runs/page';
import { metadata as tdMetadata } from '@/app/props/touchdowns/page';
import PropsError from '@/app/props/error';
import sitemap from '@/app/sitemap';

afterEach(() => { feed.props = []; feed.slate = []; feed.propsError = false; });

function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}

const hr: PropPick = { player: 'Slugger', prop: 'home_runs 0.5', bet: 'over', line: '0.5', odds: 320, sport: 'MLB HR', matchup: 'Cubs @ Reds', commence_time: '2026-09-16T23:10:00Z', game_id: 'g1', rationale: 'Gary’s Take\n\nWind out and a lefty who allows fly balls.' };
const td: PropPick = { player: 'Runner', prop: 'anytime_td 0.5', bet: 'over', line: '0.5', odds: 150, sport: 'NFL', matchup: 'Bills @ Chiefs', commence_time: '2026-09-17T00:15:00Z', game_id: 'g2', td_category: 'standard', rationale: 'Gary’s Take\n\nGoal-line role.' };
const core: PropPick = { player: 'Ace', prop: 'pitcher_strikeouts 5.5', bet: 'over', sport: 'MLB', matchup: 'Cubs @ Reds', game_id: 'g1' };

describe('prop lane pages', () => {
  it('declares canonical metadata for both lanes and lists them in the sitemap', () => {
    expect(hrMetadata.alternates?.canonical).toBe('/props/home-runs');
    expect(tdMetadata.alternates?.canonical).toBe('/props/touchdowns');
    expect(String(tdMetadata.title)).toMatch(/NFL/);
    expect(String(tdMetadata.title)).not.toMatch(/first/i);
    const paths = sitemap().map(item => new URL(item.url).pathname);
    expect(paths.slice(paths.indexOf('/props'), paths.indexOf('/props') + 3)).toEqual(['/props', '/props/home-runs', '/props/touchdowns']);
  });

  it('renders only the lane’s picks with the native prop card and real links', async () => {
    feed.props = [hr, td, core];
    feed.slate = [{ league: 'MLB', away_team: 'Cubs', home_team: 'Reds', commence_time: hr.commence_time!, venue: null, spread: null, ml_home: null, ml_away: null, total: null }];
    const html = renderToStaticMarkup(await PropLanePage({ lane: 'home-runs' }));
    expect(html).toContain('Slugger');
    expect(html).not.toContain('Runner');
    expect(html).not.toContain('Ace');
    expect(html).toContain('Wind out and a lefty who allows fly balls.');
    expect(html).toContain('href="/picks/mlb"');
    expect(html).toContain('href="/props"');
    expect(html).toContain('href="/props/touchdowns"');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).not.toContain('native-silver');
  });

  it('tells the truth on a day with no MLB games, a slate still being prepared, and an unknown slate', () => {
    expect(propLaneState({ picks: 0, slateGames: 0, firstStart: null })).toBe('no-games');
    expect(propLaneState({ picks: 0, slateGames: 3, firstStart: '7:05 PM' })).toBe('preparing');
    expect(propLaneState({ picks: 0, slateGames: null, firstStart: null })).toBe('unknown');
    expect(propLaneState({ picks: 2, slateGames: 0, firstStart: null })).toBe('picks');
  });

  it('renders each empty state without claiming games that do not exist', async () => {
    feed.slate = [];
    let html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).toContain('No NFL games on today’s schedule');
    feed.slate = [{ league: 'NFL', away_team: 'Bills', home_team: 'Chiefs', commence_time: '2026-09-17T00:15:00Z', venue: null, spread: null, ml_home: null, ml_away: null, total: null }];
    html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).toContain('being prepared');
    feed.slate = null;
    html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).not.toContain('No NFL games');
    expect(html).toContain('not published here yet');
  });

  it('surfaces a source failure rather than an empty lane', async () => {
    feed.propsError = true;
    await expect(PropLanePage({ lane: 'home-runs' })).rejects.toThrow('Fixture source unavailable');
  });

  it('keeps the touchdowns lane NFL-only', async () => {
    feed.props = [{ ...td, sport: 'NCAAF', player: 'College Back' }, td];
    const html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).toContain('Runner');
    expect(html).not.toContain('College Back');
  });

  it('offers a real server retry and historical alternatives without exposing the feed error', () => {
    const retry = vi.fn();
    const fallback = PropsError({ retry, error: new Error('private provider detail') });
    const markup = renderToStaticMarkup(fallback);
    expect(markup).toContain('Temporary interruption');
    expect(markup).toContain('href="/archive"');
    expect(markup).toContain('href="/picks"');
    expect(markup).not.toContain('private provider detail');
    const button = elements(fallback).find(element => element.type === 'button');
    expect(button).toBeDefined();
    (button!.props.onClick as () => void)();
    expect(retry).toHaveBeenCalledOnce();
  });
});
