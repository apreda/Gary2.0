import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameDay } from '@/lib/gary/gamepage';

const data = vi.hoisted(() => ({ dates: [] as string[], lastDay: null as GameDay | null }));
vi.mock('@/lib/gary/gamepage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/gamepage')>(),
  fetchLeagueDates: async () => data.dates,
  fetchGameDay: async () => data.lastDay,
}));
vi.mock('@/lib/gary/dates', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/dates')>(), todayEST: () => '2026-09-16' }));
vi.mock('@/components/BoardDateNotice', () => ({ BoardDateNotice: () => null }));
vi.mock('@/components/LiveChip', () => ({ LiveScoreStrip: () => null }));
vi.mock('@/components/book/TailFadeRow', () => ({ TailFadeRow: () => null, PropTailFadeRow: () => null }));
import SportPicksPage from '@/app/picks/[sport]/page';

afterEach(() => { vi.unstubAllGlobals(); data.dates = []; data.lastDay = null; });
const emptyFeeds = () => vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));

describe('sport page discovery links', () => {
  it('links recent picks, the lane page, props and Winners on an off day', async () => {
    emptyFeeds();
    data.dates = ['2026-09-14', '2026-09-13', '2026-09-07', '2026-09-06', '2026-08-31'];
    data.lastDay = { date: '2026-09-14', leagueCode: 'NFL', picks: [{ league: 'NFL', pick: 'Denver Broncos +2.5 -115', awayTeam: 'Denver Broncos', homeTeam: 'Kansas City Chiefs' }], results: [{ game_date: '2026-09-14', league: 'NFL', matchup: 'Denver Broncos at Kansas City Chiefs', pick_text: 'Denver Broncos +2.5 -115', result: 'lost', final_score: '10-31', confidence: null }], slate: [], publishedAt: null };
    const html = renderToStaticMarkup(await SportPicksPage({ params: Promise.resolve({ sport: 'nfl' }) }));
    for (const d of ['2026-09-14', '2026-09-13', '2026-09-07', '2026-09-06']) expect(html).toContain(`href="/picks/nfl/${d}"`);
    expect(html).toContain('href="/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs"');
    expect(html).toContain('href="/props/touchdowns"');
    expect(html).toContain('href="/props"');
    expect(html).not.toContain('href="/hub"');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('No NFL games on today');
  });
  it('caps MLB recent picks at seven and links the home run page', async () => {
    emptyFeeds();
    data.dates = Array.from({ length: 12 }, (_, i) => `2026-09-${String(16 - i).padStart(2, '0')}`);
    const html = renderToStaticMarkup(await SportPicksPage({ params: Promise.resolve({ sport: 'mlb' }) }));
    // The kept "Latest picks with results" line and the guide also link the last board, so count inside the nav only.
    const nav = html.slice(html.indexOf('<nav aria-label="Recent MLB picks"'));
    const recent = nav.slice(0, nav.indexOf('</nav>'));
    expect(recent.match(/href="\/picks\/mlb\/2026-09-\d{2}"/g)?.length).toBe(7);
    expect(recent).toContain('href="/picks/mlb/2026-09-10"');
    expect(recent).not.toContain('href="/picks/mlb/2026-09-09"');
    expect(html).toContain('href="/props/home-runs"');
  });
});
