import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropPick } from '@/lib/gary/types';

const feed = vi.hoisted(() => ({ props: [] as PropPick[], error: false }));
vi.mock('@/lib/gary/picks', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/picks')>(),
  fetchTodayPropPicks: async () => { if (feed.error) throw new Error('Fixture source unavailable'); return feed.props; },
}));
vi.mock('@/lib/gary/results', () => ({
  fetchPropResultsForDate: async () => [], computePropsRecord: () => ({ wins: 0, losses: 0, pushes: 0, graded: 0 }),
}));
import PropsPage from '@/app/props/page';
import { PropTailFadeRow } from '@/components/book/TailFadeRow';

function descendants(node: ReactNode): ReactElement<{ children?: ReactNode; prop?: PropPick; props?: PropPick[] }>[] {
  const result: ReactElement<{ children?: ReactNode; prop?: PropPick; props?: PropPick[] }>[] = [];
  Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode; prop?: PropPick }>(child)) return;
    result.push(child, ...descendants(child.props.children));
  });
  return result;
}

beforeEach(() => { feed.props = []; feed.error = false; });

describe('featured prop source identity', () => {
  it('retains an NFL scorer on its game panel while featuring the highest-confidence core prop', async () => {
    const scorer: PropPick = { player: 'Scorer', prop: 'anytime_td', sport: 'NFL', confidence: 0.99, matchup: 'Away @ Home', game_id: 222 };
    const core: PropPick = { player: 'Receiver', prop: 'receptions', sport: 'NFL', confidence: 0.75, matchup: 'Away @ Home', game_id: 222 };
    feed.props = [scorer, core];
    const items = descendants(await PropsPage());
    const featured = items.find(node => typeof node.type === 'function' && node.type.name === 'FeaturedProp');
    const panels = items.filter(node => typeof node.type === 'function' && node.type.name === 'GamePropPanel');
    expect(featured?.props.prop).toBe(core);
    expect(panels.flatMap(node => node.props.props ?? [])).toContain(scorer);
  });
  it.each([
    { game_id: 'doubleheader-2', bdl_game_id: 999, line: '1.5', expectedId: 'doubleheader-2', expectedLine: 1.5 },
    { bdl_game_id: 42, line: 0, expectedId: '42', expectedLine: 0 },
    { line: 'unavailable', expectedId: null, expectedLine: null },
  ])('passes the actual featured ticket through to My Book: %j', async fixture => {
    feed.props = [{ player: 'Judge', prop: 'hits 1.5', bet: 'over', commence_time: '2026-09-08T23:00:00Z', ...fixture }];
    const page = await PropsPage();
    const featured = descendants(page).find(node => typeof node.type === 'function' && node.type.name === 'FeaturedProp')!;
    expect(featured).toBeDefined();
    // Invoke the actual private server component from the page's React tree;
    // inspect the props crossing its real interactive client boundary.
    const render = featured.type as (props: { prop: PropPick }) => ReactNode;
    const row = descendants(render({ prop: featured.props.prop! })).find(node => node.type === PropTailFadeRow)!;
    expect(row.props).toEqual(expect.objectContaining({
      gameId: fixture.expectedId, line: fixture.expectedLine, side: 'over',
      commence: '2026-09-08T23:00:00Z', player: 'Judge', prop: 'hits 1.5',
    }));
  });

  it('keeps two games between the same teams in separate panels with their own kickoff times', async () => {
    const first = '2026-09-08T17:00:00Z', second = '2026-09-08T23:00:00Z';
    feed.props = [
      { player: 'Featured', prop: 'hits 1.5', game_id: 'elsewhere' },
      { player: 'Judge', prop: 'hits 1.5', matchup: 'NYY @ BOS', league: 'MLB', game_id: 'game-1', commence_time: first },
      { player: 'Judge', prop: 'home_runs 0.5', matchup: 'NYY @ BOS', sport: 'MLB HR', game_id: 'game-1', commence_time: first },
      { player: 'Judge', prop: 'hits 0.5', matchup: 'NYY @ BOS', league: 'MLB', game_id: 'game-2', commence_time: second },
    ];
    const panels = descendants(await PropsPage())
      .filter(node => typeof node.type === 'function' && node.type.name === 'GamePropPanel');
    expect(panels).toHaveLength(2);
    expect(panels.map(node => node.props.props!.map(p => p.commence_time)))
      .toEqual([[first, first], [second]]);
    expect(panels[0].key).not.toBe(panels[1].key);
  });

  it('surfaces a source failure rather than caching a false empty board', async () => {
    feed.error = true;
    await expect(PropsPage()).rejects.toThrow('Fixture source unavailable');
  });
});
