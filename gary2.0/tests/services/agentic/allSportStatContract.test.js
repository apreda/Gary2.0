import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTokensForSport } from '../../../src/services/agentic/tools/toolDefinitions.js';
import { resolveTokenForSport } from '../../../src/services/agentic/tools/statRouters/index.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';
import { nbaFetchers } from '../../../src/services/agentic/tools/statRouters/nbaFetchers.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { summarizeStatForContext as render } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';
const home = { id: 11, full_name: 'Home State' }, away = { id: 22, full_name: 'Away Tech' };
afterEach(() => vi.restoreAllMocks());
describe('all advertised stat routes', () => {
  it.each([
    ['NET_RATING', { net_rating: 0, netRating: 9 }, '0.0'],
    ['TURNOVER_RATE', { tov_rate: 0, tovRate: 0.2 }, '0.0%'],
    ['THREE_PT_DEFENSE', { opp_fg3_pct: 0, opp_three_pct: 0.4 }, '0.0%'],
    ['LINEUP_NET_RATINGS', { bench_net_rating: 0, starter_net_rating: 0 }, 'bench 0.0 | starter 0.0'],
  ])('preserves observed zero for NBA %s rather than substituting another metric', (token, stats, expected) => {
    const text = render({ home: stats, away: stats }, token, 'Home', 'Away', 'NBA');
    expect(text).toContain(expected); expect(text).not.toContain('N/A');
  });
  it.each(['NFL','NCAAF','MLB','NBA'])('has an allowed adapter for every %s menu entry', league => {
    for (const token of getTokensForSport(league)) expect(resolveTokenForSport(league,token).allowed,token).toBe(true);
  });
  it('lets NFL request its implemented game-log factor', () => {
    expect(getTokensForSport('NFL')).toContain('PLAYER_GAME_LOGS');
    expect(resolveTokenForSport('NFL','PLAYER_GAME_LOGS')).toMatchObject({ resolvedKey: 'NFL_PLAYER_GAME_LOGS', owner: 'nfl' });
  });
});
describe('source results through the real formatter', () => {
  it('keeps the existing injury renderer outside the new sport-stat formatting paths', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const data = { home: { injuries: [{ player: 'Existing name', status: 'Existing status', comment: 'Existing comment' }] }, away: { injuries: [] } };
    const original = render(data, 'INJURIES', 'Home', 'Away');
    for (const sport of ['NFL', 'NCAAF', 'MLB']) expect(render(data, 'INJURIES', 'Home', 'Away', sport)).toBe(original);
  });
  it('retains NFL kicking and return facts in the actual special-teams adapter output', async () => {
    vi.spyOn(nflFetchers,'KICKING').mockResolvedValue({ home: { fg_made: 8, fg_attempts: 10 }, away: { fg_made: 7, fg_attempts: 9 } });
    vi.spyOn(nflFetchers,'FIELD_POSITION').mockResolvedValue({ home: { own_net_punt_avg: 44 }, away: { own_net_punt_avg: 42 } });
    const result = await nflFetchers.NFL_SPECIAL_TEAMS('americanfootball_nfl',home,away,2026);
    const text = render(result,'SPECIAL_TEAMS',home.full_name,away.full_name,'NFL');
    expect(text).toContain('"fg_made": 8'); expect(text).toContain('"own_net_punt_avg": 42');
    expect(text).not.toContain('PP N/A'); expect(text).not.toContain('[object Object]');
    expect(text).toContain(result.source);
  });
  it('preserves quarter evidence using the actual adapter field names, including scoreless quarters', async () => {
    vi.spyOn(ballDontLieService,'getGames').mockResolvedValue([{ id: 1, date: '2026-09-01', status: 'Final',
      home_team: home, visitor_team: away, home_team_q1: 0, home_team_q2: 10, home_team_q3: 7, home_team_q4: 3,
      visitor_team_q1: 7, visitor_team_q2: 0, visitor_team_q3: 3, visitor_team_q4: 0 }]);
    const result = await nbaFetchers.QUARTER_SCORING('americanfootball_nfl',home,away,2026);
    for (const sport of ['NFL','NBA']) {
      const text = render(result,'QUARTER_SCORING',home.full_name,away.full_name,sport);
      expect(text).toContain('"Q1": "0.0"'); expect(text).toContain('"games_analyzed": 1');
      expect(text).toContain('"allowed"'); expect(text).not.toContain('[object Object]');
    }
  });
  it('keeps nested player logs and their scope without making EPA from ordinary game scores', () => {
    const data = { data_scope: 'Actual L5 game scores (not per-play EPA)', home: { players: [{ player: 'A', last_5: ['@ Opponent: 321 pass yds'] }] }, away: { note: 'No completed games' } };
    const text = render(data,'PLAYER_GAME_LOGS','Home','Away','NFL');
    expect(text).toContain('321 pass yds'); expect(text).toContain(data.data_scope); expect(text).toContain(data.away.note);
  });
  it('preserves MLB source, prior-season scope and partial-coverage warnings with the original text', () => {
    const data = { source: 'MLB Stats API', data_scope: '2025 prior season', note: 'Current season unavailable',
      homeValue: 'Pitcher A: 4.12 ERA', awayValue: 'Pitcher B: 3.34 ERA', coverage: { games_used: 5, complete: false } };
    const text = render(data,'MLB_PITCHER_SCOUTING','Home','Away','MLB');
    for (const key of ['source','data_scope','note','homeValue','awayValue']) expect(text).toContain(data[key]);
    expect(text).toContain('"complete": false'); expect(text).toContain('"games_used": 5');
  });
});
