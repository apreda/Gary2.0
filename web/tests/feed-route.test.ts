import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/gary/picks', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/picks')>(),
  fetchTodayGamePicks: async () => [{ league: 'MLB', pick: 'Cubs ML -110', awayTeam: 'Cubs', homeTeam: 'Reds', pick_id: 'p1', rationale: 'The take.' }] }));
vi.mock('@/lib/gary/pick-links', () => ({ fetchPublishedPickPaths: async () => new Set(['/picks/mlb/2026-09-16/cubs-at-reds']), publishedPickPath: () => '/picks/mlb/2026-09-16/cubs-at-reds' }));
vi.mock('@/lib/gary/dates', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/dates')>(), todayEST: () => '2026-09-16' }));
const index = vi.hoisted(() => ({ rows: [] as { date: string; published_at: string | null; game_count: number; prop_count: number; research_count: number }[] }));
vi.mock('@/lib/gary/archive', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/archive')>(), fetchArchiveDayIndex: async () => index.rows }));
import { GET } from '@/app/feed.xml/route';
describe('feed.xml', () => {
  it('dates items by the day’s stored publish time and omits pubDate when unknown', async () => {
    index.rows = [{ date: '2026-09-16', published_at: '2026-09-16T15:16:58Z', game_count: 1, prop_count: 0, research_count: 0 }];
    let xml = await (await GET()).text();
    expect(xml).toContain('<pubDate>Wed, 16 Sep 2026 15:16:58 GMT</pubDate>');
    expect(xml).toContain('<lastBuildDate>');
    index.rows = [];
    xml = await (await GET()).text();
    expect(xml).not.toContain('<pubDate>');
    expect(xml).toContain('<link>https://www.betwithgary.ai/picks/mlb/2026-09-16/cubs-at-reds</link>');
  });
});
