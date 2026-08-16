import { describe, expect, it } from 'vitest';

import {
  buildTheSweatRows,
  computeTheSweat,
  loadStoredFootballPicks,
  loadFootballSettledScores,
} from '../../../src/services/insights/computers/theSweat.js';
import { gradeFootballInsightRow } from '../../../src/services/insights/footballGrade.js';
import { insightConnectionIdentity } from '../../../src/services/insights/generateInsightConnections.js';

const game = {
  id: 1393562,
  date: '2026-08-15T23:00:00.000Z',
  season: 2026,
  postseason: false,
  visitor_team: { id: 25, full_name: 'Philadelphia Eagles', abbreviation: 'PHI' },
  home_team: { id: 4, full_name: 'Baltimore Ravens', abbreviation: 'BAL' },
};

const pick = {
  pick_id: 'agentic-americanfootball_nfl-1393562',
  bdl_game_id: 1393562,
  league: 'NFL',
  pick: 'Baltimore Ravens +4 -110',
  type: 'spread',
  spread: 4,
  homeTeam: 'Baltimore Ravens',
  awayTeam: 'Philadelphia Eagles',
  commence_time: game.date,
  statsData: [
    {
      token: 'RUSH_YDS_GM',
      away: { team: 'Philadelphia Eagles', rushing_yards_per_game: '116.9' },
      home: { team: 'Baltimore Ravens', rushing_yards_per_game: '156.6' },
    },
    {
      token: 'PASS_YDS_GM',
      away: { team: 'Philadelphia Eagles', passing_ypg: '194.3' },
      home: { team: 'Baltimore Ravens', passing_ypg: '175.6' },
    },
  ],
};

describe('THE SWEAT football proof', () => {
  it('keeps distinct proof factors even when their visible values match', () => {
    const base = {
      category: 'the_sweat',
      game: 'PHI @ BAL',
      game_id: 1393562,
      value: '1 · 0',
      meta: { pick_id: 'pick-1' },
    };
    expect(insightConnectionIdentity({
      ...base,
      meta: { ...base.meta, factor_code: 'PRESSURE' },
    })).not.toBe(insightConnectionIdentity({
      ...base,
      meta: { ...base.meta, factor_code: 'BALL_SECURITY' },
    }));
  });

  it('publishes a terse PRE watchlist before an August NFL kickoff', () => {
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [game],
      picks: [pick],
      liveScores: [{ game_id: '1393562', status: 'scheduled', updated_at: '2026-08-15T22:30:00Z' }],
      nowMs: Date.parse('2026-08-15T22:30:00Z'),
    });

    expect(rows.map((row) => row.headline)).toEqual(['THE NUMBER', 'GROUND', 'AIR']);
    expect(rows.every((row) => row.category === 'the_sweat')).toBe(true);
    expect(rows.every((row) => row.meta.season_type === 'PRE')).toBe(true);
    expect(rows.every((row) => row.meta.state === 'WATCH')).toBe(true);
    expect(rows[0].value).toBe('BAL +4');
    expect(rows[1].value).toBe('156.6 · 116.9');
  });

  it('updates exact-game factors from live team boxes without changing the pick', () => {
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [game],
      picks: [pick],
      liveScores: [{
        game_id: '1393562', status: 'live', home_score: 7, away_score: 10,
        updated_at: '2026-08-15T23:28:00Z',
      }],
      teamStats: [
        { game: { id: 1393562 }, team: { id: 4 }, home_away: 'home', rushing_yards: 58, passing_yards: 71 },
        { game: { id: 1393562 }, team: { id: 25 }, home_away: 'away', rushing_yards: 31, passing_yards: 96 },
      ],
      nowMs: Date.parse('2026-08-15T23:28:00Z'),
    });

    const byCode = new Map(rows.map((row) => [row.meta.factor_code, row]));
    expect(byCode.get('THE_NUMBER').meta.state).toBe('HOLDING');
    expect(byCode.get('THE_NUMBER').meta).toMatchObject({
      baseline_selected: 4,
      live_selected: 7,
      live_opponent: 10,
      baseline_unit: 'LINE',
      live_unit: 'SCORE',
      cover_margin: 1,
      selected_score: 7,
      opponent_score: 10,
      market_type: 'spread',
    });
    expect(byCode.get('RUSH_EDGE').value).toBe('58 · 31');
    expect(byCode.get('RUSH_EDGE').meta.state).toBe('HOLDING');
    expect(byCode.get('RUSH_EDGE').meta).toMatchObject({
      baseline_selected: '156.6',
      baseline_opponent: '116.9',
      live_selected: 58,
      live_opponent: 31,
      baseline_unit: 'YDS/G',
      live_unit: 'YDS',
    });
    expect(byCode.get('AIR_EDGE').meta.state).toBe('FLIPPED');
    expect(rows.every((row) => row.meta.pick_id === pick.pick_id)).toBe(true);
  });

  it('matches exact stored team names when live stat rows omit home-away labels', () => {
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [game],
      picks: [pick],
      liveScores: [{ game_id: '1393562', status: 'live', home_score: 7, away_score: 3 }],
      teamStats: [
        { game_id: 1393562, team: { full_name: 'Baltimore Ravens' }, rushing_yards: 44 },
        { game_id: 1393562, team: { full_name: 'Philadelphia Eagles' }, rushing_yards: 19 },
      ],
    });
    expect(rows.find((row) => row.meta.factor_code === 'RUSH_EDGE')?.value).toBe('44 · 19');
  });

  it('uses terminal HELD/MISSED states so the client can form a final receipt', () => {
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [game],
      picks: [pick],
      liveScores: [{
        game_id: '1393562', status: 'final', home_score: 20, away_score: 17,
        updated_at: '2026-08-16T02:10:00Z',
      }],
      teamStats: [
        { game: { id: 1393562 }, home_away: 'home', rushing_yards: 144, passing_yards: 160 },
        { game: { id: 1393562 }, home_away: 'away', rushing_yards: 92, passing_yards: 211 },
      ],
    });
    const states = Object.fromEntries(rows.map((row) => [row.meta.factor_code, row.meta.state]));
    expect(states).toEqual({ THE_NUMBER: 'HELD', RUSH_EDGE: 'HELD', AIR_EDGE: 'MISSED' });
  });

  it('omits unresolved live identities so storage can preserve last-good proof', () => {
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [game],
      picks: [pick],
      liveScores: [{ game_id: '1393562', status: 'final', updated_at: '2026-08-16T02:10:00Z' }],
      teamStats: [],
      nowMs: Date.parse('2026-08-16T02:10:00Z'),
    });
    expect(rows).toEqual([]);
  });

  it('fails closed when there is no exact stored pick', async () => {
    let statCalls = 0;
    const rows = await computeTheSweat({
      date: '2026-08-15', league: 'nfl', games: [game],
      proofData: { picks: [], liveScores: [], teamStats: [] },
      bdl: { getTeamStats: async () => { statCalls += 1; return []; } },
    });
    expect(rows).toEqual([]);
    expect(statCalls).toBe(0);
  });

  it('does not run for non-football leagues', () => {
    expect(buildTheSweatRows({ league: 'MLB', games: [game], picks: [pick] })).toEqual([]);
  });

  it('reads January NFL proof from the season that began the prior August', async () => {
    const calls = [];
    await loadStoredFootballPicks({
      league: 'NFL',
      date: '2027-01-10',
      supabaseUrl: 'https://example.invalid',
      key: 'test',
      client: { get: async (_url, options) => { calls.push(options.params); return { data: [] }; } },
    });
    expect(calls[0].season).toBe('eq.2026');
  });

  it('recovers a final score after the prior-day live row is pruned', async () => {
    const rows = await loadFootballSettledScores({
      league: 'NFL',
      date: '2026-08-15',
      supabaseUrl: 'https://example.invalid',
      key: 'test',
      client: {
        get: async (_url, options) => {
          expect(options.params).toMatchObject({
            game_date: 'eq.2026-08-15',
            select: 'game_id,final_score',
          });
          return { data: [{ game_id: '1393562', final_score: '17-20' }] };
        },
      },
    });
    expect(rows).toEqual([{
      game_id: '1393562', away_score: 17, home_score: 20,
      status: 'final', detail: 'Final',
    }]);
  });

  it('is context-only and never inflates the Hub hit rate', () => {
    expect(gradeFootballInsightRow(
      { category: 'the_sweat', meta: { kind: 'the_sweat' } },
      { home_team_score: 21, visitor_team_score: 17 },
    )).toEqual({ result: null, note: 'Pick proof receipt; context only' });
  });
});
