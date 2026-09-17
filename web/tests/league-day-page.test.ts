import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/gary/gamepage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/gamepage')>(),
  fetchLeagueDates: async () => ['2026-09-15', '2026-09-14', '2026-09-13'],
  fetchGameDay: async () => ({ date: '2026-09-14', leagueCode: 'MLB', slate: [], publishedAt: null,
    picks: [{ league: 'MLB', pick: 'Rangers ML -134', awayTeam: 'Red Sox', homeTeam: 'Rangers', commence_time: '2026-09-15T00:05:00Z' }],
    results: [{ game_date: '2026-09-14', league: 'MLB', matchup: 'Red Sox at Rangers', pick_text: 'Rangers ML -134', result: 'won', final_score: '2-4', confidence: null }] }),
}));
vi.mock('@/lib/gary/dates', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/dates')>(), todayEST: () => '2026-09-16' }));
vi.mock('@/components/AppStoreButton', () => ({ AppStoreButton: () => null }));
import LeagueDayPage, { generateMetadata } from '@/app/picks/[sport]/[date]/page';

describe('league day listing', () => {
  it('links every game, the neighbours, the archive day, the record and Winners; title carries the year', async () => {
    const params = Promise.resolve({ sport: 'mlb', date: '2026-09-14' });
    const meta = await generateMetadata({ params });
    expect(String(meta.title)).toContain('2026');
    const html = renderToStaticMarkup(await LeagueDayPage({ params }));
    expect(html).toContain('href="/picks/mlb/2026-09-14/red-sox-at-rangers"');
    expect(html).toContain('href="/picks/mlb/2026-09-13"');
    expect(html).toContain('href="/picks/mlb/2026-09-15"');
    expect(html).toContain('href="/archive/2026-09-14"');
    expect(html).toContain('href="/results/mlb"');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('Final 2-4');
  });
});
