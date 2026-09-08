import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = { rows: [], resolve: vi.fn() };
vi.doMock('../../../src/services/ballDontLieService.js', () => ({ ballDontLieService: {
  getMlbGamesForDate: async date => date === '2026-09-08' ? [{ id: 10, date: '2026-09-08T23:00:00Z', status: 'Scheduled',
    home_team: { id: 2, abbreviation: 'HOM' }, visitor_team: { id: 1, abbreviation: 'AWY' } }] : [],
} }));
vi.doMock('../../../src/services/insights/resolveIds.js', () => ({ resolveInsightIds: async rows => {
  fixtures.resolve(rows);
  rows.forEach((row, index) => { row.player_id ??= 100 + index; });
} }));
const computers = ['HeatCheck', 'GaryHrThreats', 'PlatoonEdge', 'BallparkShift', 'RegressionWatch',
  'HitterRegression', 'Beneficiary', 'RestFatigue', 'Owned', 'CoolingOff', 'StarterForm',
  'StarterTeamRecord', 'BullpenFatigue', 'Streaking', 'FirstInning', 'HeadToHead', 'RunningGame', 'ParkWeather', 'ReturnWatch'];
for (const name of computers) {
  const file = name[0].toLowerCase() + name.slice(1);
  vi.doMock(`../../../src/services/insights/computers/${file}.js`, () => ({
    [`compute${name}`]: async () => name === 'HeatCheck' ? fixtures.rows : [],
  }));
}
const { generateInsightConnections, insightConnectionIdentity } = await import('../../../src/services/insights/generateInsightConnections.js');
beforeEach(() => {
  fixtures.resolve.mockClear();
  fixtures.rows = Array.from({ length: 20 }, (_, index) => ({ category: 'heat_check', headline: `Observed hitter ${index}`,
    detail: 'Original observed context.', game: 'AWY @ HOM', game_id: 10, team_id: 1,
    value: String(index), tone: 'neutral', relevance_score: 20 - index, meta: { observed: index } }));
});

describe('Hub synthesis enters before final display filtering', () => {
  it('does not deduplicate same-player doubleheader observations across exact games', () => {
    const row = { category: 'heat_check', game: 'AWY @ HOM', game_id: '10', team_id: '1', player_id: '99', value: '.400' };
    expect(insightConnectionIdentity(row)).not.toBe(insightConnectionIdentity({ ...row, game_id: '11' }));
    expect(insightConnectionIdentity(row)).not.toBe(insightConnectionIdentity({ ...row, team_id: '2' }));
  });
  it('receives all source rows after ID resolution, retains chosen anchors below caps and returns out-of-band invalidations', async () => {
    const synthesis = vi.fn(async ({ rows, games, league, date }) => {
      expect(rows).toHaveLength(20); expect(rows[19].player_id).toBe(119);
      expect(games[0].id).toBe(10); expect(league).toBe('mlb'); expect(date).toBe('2026-09-08');
      return { rows: rows.map((row, index) => index >= 18 ? { ...row, meta: { ...row.meta, judgment: { status: 'ready' } } } : row),
        invalidations: [{ primary_source_key: 'old|10||1', status: 'superseded' }], failures: [] };
    });
    const result = await generateInsightConnections({ date: '2026-09-08', league: 'MLB',
      options: { synthesizeJudgments: synthesis, minRelevance: 80, maxPerCategory: 1 } });
    expect(fixtures.resolve).toHaveBeenCalledOnce(); expect(synthesis).toHaveBeenCalledOnce();
    expect(result.connections.map(row => row.player_id)).toEqual([118, 119]);
    expect(result.judgmentUpdates).toHaveLength(2);
    expect(result.judgmentInvalidations[0].primary_source_key).toBe('old|10||1');
    expect(result.connections.every(row => row.detail === 'Original observed context.')).toBe(true);
  });
  it('preserves ordinary collector output and reports a failed synthesis stage independently', async () => {
    const result = await generateInsightConnections({ date: '2026-09-08', league: 'MLB',
      options: { minRelevance: 0, synthesizeJudgments: async () => { throw new Error('synthesis unavailable'); } } });
    expect(result.connections).toHaveLength(8);
    expect(result.judgmentFailures[0].message).toBe('synthesis unavailable');
    expect(result.failures).toEqual([]);
  });
  it('keeps the selected duplicate anchor when deduplication precedes sorting', async () => {
    fixtures.rows = [0, 1].map(() => ({ category: 'heat_check', headline: 'One observation', detail: 'Original context',
      player_id: 99, team_id: 1, game_id: 10, game: 'AWY @ HOM', value: '.400', tone: 'neutral', relevance_score: 80 }));
    const result = await generateInsightConnections({ date: '2026-09-08', league: 'MLB', options: {
      synthesizeJudgments: async ({ rows }) => ({ rows: rows.map((row, i) => i === 1 ? { ...row, meta: { judgment: { status: 'ready' } } } : row) }),
    } });
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].meta.judgment.status).toBe('ready');
  });
});
