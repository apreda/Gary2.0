import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HubPage from '@/app/hub/page';
import { fetchTodayInsights } from '@/lib/gary/hub';
import type { InsightRow } from '@/lib/gary/types';

vi.mock('@/components/AccountCta', () => ({ AccountCta: () => null }));
vi.mock('@/lib/gary/hub', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/hub')>(),
  fetchTodayInsights: vi.fn(), fetchGradedYesterday: vi.fn(async () => []),
}));
afterEach(() => vi.clearAllMocks());
const row = (overrides: Partial<InsightRow>) => ({
  id: 1, date: '2026-09-08', league: 'NFL', category: 'fantasy_usage',
  headline: 'Player A', detail: 'Across 16 games in 2025. Prior-season baseline, not current form.',
  value: '18.4 C+T/G', relevance_score: 90, ...overrides,
}) as InsightRow;

describe('published football Hub', () => {
  it('renders both football leagues and keeps every displayed usage sample qualification', async () => {
    vi.mocked(fetchTodayInsights).mockResolvedValue([
      row({}), row({ id: 2, headline: 'Player B', detail: 'Across 12 games in 2025. Second prior-season baseline.' }),
      row({ id: 3, league: 'NCAAF', category: 'next_slate', headline: 'Next NCAAF slate · Fri, Sep 11', detail: 'Two scheduled games.' }),
    ]);
    const html = renderToStaticMarkup(await HubPage());
    expect(html).toContain('Player A');
    expect(html).toContain('Player B');
    expect(html).toContain('Across 16 games in 2025. Prior-season baseline, not current form.');
    expect(html).toContain('Across 12 games in 2025. Second prior-season baseline.');
    expect(html).toContain('Next NCAAF slate · Fri, Sep 11');
  });
  it('keeps tomorrow projections distinct from current starter data', async () => {
    vi.mocked(fetchTodayInsights).mockResolvedValue([
      row({ league: 'MLB', category: 'regression_tomorrow', headline: 'Pitcher A', detail: 'Projected to start tomorrow vs Chicago.' }),
    ]);
    const html = renderToStaticMarkup(await HubPage());
    expect(html).toContain('Tomorrow&#x27;s Projected Starters');
    expect(html).toContain('Projected to start tomorrow vs Chicago.');
  });
  it('shows a useful empty state when stored rows have no supported active category', async () => {
    vi.mocked(fetchTodayInsights).mockResolvedValue([row({ category: 'unknown' })]);
    expect(renderToStaticMarkup(await HubPage())).toContain('No insights are available here yet.');
  });
});
