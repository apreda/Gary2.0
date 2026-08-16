import { describe, expect, it, vi } from 'vitest';

import {
  hydrateExactFootballGames,
  mergeExactFootballGame,
} from '../../scripts/lib/footballProofExactGame.js';
import { buildTheSweatRows } from '../../src/services/insights/computers/theSweat.js';

const kickoff = '2026-08-15T23:00:00.000Z';
const pick = {
  pick_id: 'agentic-americanfootball_nfl-1393562',
  bdl_game_id: 1393562,
  league: 'NFL',
  pick: 'Baltimore Ravens +4 -110',
  type: 'spread',
  spread: 4,
  homeTeam: 'Baltimore Ravens',
  awayTeam: 'Philadelphia Eagles',
  commence_time: kickoff,
};

function shell({ abbreviations = true } = {}) {
  return {
    id: '1393562',
    date: kickoff,
    commence_time: kickoff,
    visitor_team: {
      full_name: 'Philadelphia Eagles',
      abbreviation: abbreviations ? 'PHI' : null,
    },
    home_team: {
      full_name: 'Baltimore Ravens',
      abbreviation: abbreviations ? 'BAL' : null,
    },
  };
}

function provider(overrides = {}) {
  return {
    id: 1393562,
    date: kickoff,
    season_type: 1,
    // BDL's live NFL payload uses clock-plus-quarter strings, not a separate
    // generic "live" status.
    status: '6:37 - 1st',
    visitor_team: { id: 25, full_name: 'Philadelphia Eagles', abbreviation: 'PHI' },
    home_team: { id: 4, full_name: 'Baltimore Ravens', abbreviation: 'BAL' },
    visitor_team_score: 10,
    home_team_score: 7,
    updated_at: '2026-08-15T23:28:00.000Z',
    ...overrides,
  };
}

async function hydrate({ game = shell(), score = null, providerGame = provider(), nowMs } = {}) {
  const gameById = new Map([['1393562', game]]);
  const scoreByGame = new Map(score ? [['1393562', score]] : []);
  const getGame = vi.fn(async () => providerGame);
  const bdl = { getGame };
  const fetched = await hydrateExactFootballGames({
    records: [{ pick }],
    gameById,
    scoreByGame,
    bdl,
    sportKey: 'americanfootball_nfl',
    nowMs: nowMs ?? Date.parse('2026-08-15T23:30:00.000Z'),
  });
  return { fetched, gameById, scoreByGame, getGame, bdl };
}

describe('football proof exact-game hydration', () => {
  it('fills a missing active live-score from the exact provider game', async () => {
    const result = await hydrate();

    expect(result.fetched).toEqual(['1393562']);
    expect(result.getGame).toHaveBeenCalledOnce();
    expect(result.getGame).toHaveBeenCalledWith('americanfootball_nfl', '1393562', 1);
    expect(result.bdl.getGames).toBeUndefined();
    expect(result.scoreByGame.get('1393562')).toMatchObject({
      game_id: '1393562', status: 'live', away_score: 10, home_score: 7,
    });

    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [...result.gameById.values()],
      picks: [pick],
      liveScores: [...result.scoreByGame.values()],
      teamStats: [],
      nowMs: Date.parse('2026-08-15T23:30:00.000Z'),
    });
    expect(rows.find((row) => row.meta.factor_code === 'THE_NUMBER')).toMatchObject({
      value: 'BAL 7–10',
      meta: { state: 'HOLDING', season_type: 'PRE' },
    });
  });

  it('replaces legacy full-name shells with canonical provider abbreviations', async () => {
    const result = await hydrate({
      game: shell({ abbreviations: false }),
      providerGame: provider({
        status: 'Scheduled',
        visitor_team_score: 0,
        home_team_score: 0,
      }),
      nowMs: Date.parse('2026-08-15T22:00:00.000Z'),
    });

    expect(result.getGame).toHaveBeenCalledOnce();
    expect(result.gameById.get('1393562')).toMatchObject({
      visitor_team: { abbreviation: 'PHI' },
      home_team: { abbreviation: 'BAL' },
      season_type: 1,
    });
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [...result.gameById.values()],
      picks: [pick],
      liveScores: [],
      teamStats: [],
      nowMs: Date.parse('2026-08-15T22:00:00.000Z'),
    });
    expect(rows[0]).toMatchObject({ game: 'PHI @ BAL', value: 'BAL +4' });
  });

  it('recovers a prior-day final after live_scores has been pruned', async () => {
    const result = await hydrate({
      providerGame: provider({
        status: 'Final',
        visitor_team_score: 17,
        home_team_score: 20,
        updated_at: '2026-08-16T02:10:00.000Z',
      }),
      nowMs: Date.parse('2026-08-16T14:00:00.000Z'),
    });

    expect(result.scoreByGame.get('1393562')).toMatchObject({
      status: 'final', away_score: 17, home_score: 20,
    });
    const rows = buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [...result.gameById.values()],
      picks: [pick],
      liveScores: [...result.scoreByGame.values()],
      teamStats: [],
      nowMs: Date.parse('2026-08-16T14:00:00.000Z'),
    });
    expect(rows.find((row) => row.meta.factor_code === 'THE_NUMBER')?.meta.state).toBe('HELD');
  });

  it('never downgrades a known live or final receipt to scheduled WATCH', () => {
    const live = mergeExactFootballGame({
      pick,
      game: shell({ abbreviations: false }),
      score: { game_id: '1393562', status: 'live', away_score: 3, home_score: 7 },
      providerGame: provider({
        status: 'Scheduled', visitor_team_score: null, home_team_score: null,
      }),
    });
    expect(live.score).toMatchObject({ status: 'live', away_score: 3, home_score: 7 });

    const final = mergeExactFootballGame({
      pick,
      game: shell({ abbreviations: false }),
      score: { game_id: '1393562', status: 'final', away_score: 17, home_score: 20 },
      providerGame: provider({
        status: 'In Progress', visitor_team_score: 10, home_team_score: 7,
      }),
    });
    expect(final.score).toMatchObject({ status: 'final', away_score: 17, home_score: 20 });
  });

  it('fails closed instead of emitting WATCH when provider is stale after kickoff', async () => {
    const result = await hydrate({
      score: { game_id: '1393562', status: 'scheduled' },
      providerGame: provider({
        status: 'Scheduled', visitor_team_score: 0, home_team_score: 0,
      }),
      nowMs: Date.parse('2026-08-15T23:30:00.000Z'),
    });

    expect(result.scoreByGame.has('1393562')).toBe(false);
    expect(buildTheSweatRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [...result.gameById.values()],
      picks: [pick],
      liveScores: [],
      teamStats: [],
      nowMs: Date.parse('2026-08-15T23:30:00.000Z'),
    })).toEqual([]);
  });
});
