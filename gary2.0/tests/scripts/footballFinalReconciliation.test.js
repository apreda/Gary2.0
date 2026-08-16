import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  incompleteFinalFootballGames,
  loadIncompleteFinalFootballGames,
} from '../../scripts/lib/footballFinalReconciliation.js';
import {
  pendingGradeFiles,
  queueExactGradeRequest,
} from '../../scripts/lib/liveGradeQueue.js';

const DATE = '2026-08-16';
const tempDirs = [];

function queueDir() {
  const value = mkdtempSync(join(tmpdir(), 'gary-live-grade-test-'));
  tempDirs.push(value);
  return value;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('football final settlement reconciliation', () => {
  it('remains level-triggered when another score writer stored FINAL first', () => {
    const finalGames = [{ date: DATE, league: 'NFL', game_id: '101', status: 'final' }];
    const gamePicks = [{
      league: 'americanfootball_nfl',
      game_id: '101',
      pick_id: 'pick-101',
      pick: 'Jets +3',
    }];

    expect(incompleteFinalFootballGames({ finalGames, gamePicks })).toEqual([{
      date: DATE,
      league: 'NFL',
      game_id: '101',
      missing: ['game_result', 'final_proof'],
    }]);

    expect(incompleteFinalFootballGames({
      finalGames,
      gamePicks,
      nflResults: [{
        game_id: '101', pick_text: 'Jets +3', result: 'won', final_score: '17-20',
      }],
      proofRows: [{
        league: 'NFL',
        game_id: '101',
        category: 'the_sweat',
        meta: { pick_id: 'pick-101', factor_code: 'THE_NUMBER', state: 'HELD' },
      }],
    })).toEqual([]);
  });

  it('does not accept an in-game proof state as final settlement', () => {
    const input = {
      finalGames: [{ date: DATE, league: 'NCAAF', game_id: '202', status: 'final' }],
      gamePicks: [{
        league: 'americanfootball_ncaaf', game_id: '202', pick_id: 'pick-202', pick: 'State ML',
      }],
      ncaafResults: [{
        league: 'NCAAF', game_id: '202', pick_text: 'State ML', result: 'lost', final_score: '24-17',
      }],
      proofRows: [{
        league: 'NCAAF', game_id: '202', category: 'the_sweat',
        meta: { pick_id: 'pick-202', factor_code: 'THE_NUMBER', state: 'WATCH' },
      }],
    };

    expect(incompleteFinalFootballGames(input)[0].missing).toEqual(['final_proof']);
  });

  it('requires every exact football prop result and ignores finals with no Gary card', () => {
    const finalGames = [
      { date: DATE, league: 'NCAAF', game_id: '202', status: 'final' },
      { date: DATE, league: 'NFL', game_id: '303', status: 'final' },
    ];
    const propPicks = [{
      sport: 'NCAAF', game_id: '202', player: 'Quarterback One',
      prop: 'passing_yards', bet: 'Over', line: 250.5,
    }];

    expect(incompleteFinalFootballGames({ finalGames, propPicks })).toEqual([{
      date: DATE,
      league: 'NCAAF',
      game_id: '202',
      missing: ['prop_result'],
    }]);
    expect(incompleteFinalFootballGames({
      finalGames,
      propPicks,
      propResults: [{
        sport: 'NCAAF', game_id: '202', player_name: 'Quarterback One',
        prop_type: 'passing_yards', bet: 'over', line_value: 250.5,
        result: 'won', actual_value: 287,
      }],
    })).toEqual([]);
  });

  it('does not treat an identity-only game row as settled and preserves a valid push', () => {
    const input = {
      finalGames: [{ date: DATE, league: 'NFL', game_id: '404', status: 'final' }],
      gamePicks: [{
        league: 'NFL', game_id: '404', pick_id: 'pick-404', pick: 'Giants +3',
      }],
      proofRows: [{
        league: 'NFL', game_id: '404', category: 'the_sweat',
        meta: { pick_id: 'pick-404', factor_code: 'THE_NUMBER', state: 'PUSH' },
      }],
    };

    expect(incompleteFinalFootballGames({
      ...input,
      nflResults: [{ game_id: '404', pick_text: 'Giants +3' }],
    })[0].missing).toEqual(['game_result']);
    expect(incompleteFinalFootballGames({
      ...input,
      nflResults: [{
        game_id: '404', pick_text: 'Giants +3', result: 'push', final_score: null,
      }],
    })[0].missing).toEqual(['game_result']);
    expect(incompleteFinalFootballGames({
      ...input,
      nflResults: [{
        game_id: '404', pick_text: 'Giants +3', result: null, final_score: '17-17',
      }],
    })[0].missing).toEqual(['game_result']);
    expect(incompleteFinalFootballGames({
      ...input,
      nflResults: [{
        game_id: '404', pick_text: 'Giants +3', result: 'push', final_score: '17-17',
      }],
    })).toEqual([]);
  });

  it('does not treat an identity-only prop row as settled and preserves a numeric push', () => {
    const input = {
      finalGames: [{ date: DATE, league: 'NCAAF', game_id: '505', status: 'final' }],
      propPicks: [{
        sport: 'NCAAF', game_id: '505', player: 'Quarterback Two',
        prop: 'passing_yards', bet: 'Over', line: 250,
      }],
    };
    const identity = {
      sport: 'NCAAF', game_id: '505', player_name: 'Quarterback Two',
      prop_type: 'passing_yards', bet: 'over', line_value: 250,
    };

    expect(incompleteFinalFootballGames({
      ...input,
      propResults: [identity],
    })[0].missing).toEqual(['prop_result']);
    expect(incompleteFinalFootballGames({
      ...input,
      propResults: [{ ...identity, result: 'push', actual_value: null }],
    })[0].missing).toEqual(['prop_result']);
    expect(incompleteFinalFootballGames({
      ...input,
      propResults: [{ ...identity, result: null, actual_value: 250 }],
    })[0].missing).toEqual(['prop_result']);
    expect(incompleteFinalFootballGames({
      ...input,
      propResults: [{ ...identity, result: 'push', actual_value: 250 }],
    })).toEqual([]);
  });

  it('loads exact final-game identities without relying on the prior live-score state', async () => {
    const calls = [];
    const tableRows = {
      weekly_nfl_picks: [{ picks: [{
        league: 'NFL', game_id: '101', pick_id: 'pick-101', pick: 'Jets +3',
        commence_time: '2026-08-16T20:00:00Z',
      }] }],
      nfl_results: [],
      prop_picks: [],
      prop_results: [],
      insight_connections: [],
    };
    const client = {
      async get(url, options) {
        const table = url.split('/').pop();
        calls.push({ table, params: options.params });
        return { data: tableRows[table] ?? [] };
      },
    };

    await expect(loadIncompleteFinalFootballGames({
      date: DATE,
      finalGames: [{ date: DATE, league: 'NFL', game_id: '101', status: 'final' }],
      supabaseUrl: 'https://example.supabase.co',
      key: 'test-key',
      client,
    })).resolves.toEqual([{
      date: DATE,
      league: 'NFL',
      game_id: '101',
      missing: ['game_result', 'final_proof'],
    }]);
    expect(calls.find(({ table }) => table === 'nfl_results').params.game_id).toBe('in.(101)');
    expect(calls.find(({ table }) => table === 'nfl_results').params.select)
      .toBe('game_id,pick_text,result,final_score');
    expect(calls.find(({ table }) => table === 'prop_results').params.select)
      .toContain('result,actual_value');
    expect(calls.find(({ table }) => table === 'weekly_nfl_picks').params.season).toBe('eq.2026');
  });

  it('reconciles an overnight NCAAF final against its prior 6 AM slate date', async () => {
    const calls = [];
    const tableRows = {
      daily_picks: [{ picks: [{
        league: 'NCAAF', game_id: '202', pick_id: 'pick-202', pick: 'Hawaii +3',
        commence_time: '2026-09-06T05:30:00.000Z',
      }] }],
      game_results: [],
      prop_picks: [],
      prop_results: [],
      insight_connections: [],
    };
    const client = {
      async get(url, options) {
        const table = url.split('/').pop();
        calls.push({ table, params: options.params });
        return { data: tableRows[table] ?? [] };
      },
    };

    await expect(loadIncompleteFinalFootballGames({
      date: '2026-09-05',
      finalGames: [{ date: '2026-09-05', league: 'NCAAF', game_id: '202', status: 'final' }],
      supabaseUrl: 'https://example.supabase.co',
      key: 'test-key',
      client,
    })).resolves.toEqual([{
      date: '2026-09-05',
      league: 'NCAAF',
      game_id: '202',
      missing: ['game_result', 'final_proof'],
    }]);
    expect(calls.find(({ table }) => table === 'daily_picks').params.date).toBe('eq.2026-09-05');
    expect(calls.find(({ table }) => table === 'game_results').params.game_date).toBe('eq.2026-09-05');
  });
});

describe('durable exact live-grade queue', () => {
  it('deduplicates the same game while pending and while atomically claimed', () => {
    const dir = queueDir();
    const game = { date: DATE, league: 'NFL', game_id: '101' };
    const first = queueExactGradeRequest({
      date: DATE,
      games: [game, game],
      queueDir: dir,
      now: () => 1,
      pid: 10,
      random: () => 0.5,
    });
    expect(first.queued).toEqual([game]);
    expect(readdirSync(dir).filter((name) => name.endsWith('.json'))).toHaveLength(1);

    const duplicate = queueExactGradeRequest({ date: DATE, games: [game], queueDir: dir });
    expect(duplicate).toMatchObject({ queued: [], covered: [game] });

    const pendingName = basename(first.path);
    renameSync(first.path, join(dir, `${pendingName}.work-999`));
    const duringWorker = queueExactGradeRequest({ date: DATE, games: [game], queueDir: dir });
    expect(duringWorker).toMatchObject({ queued: [], covered: [game] });
  });

  it('recovers an append that stopped before its atomic rename', () => {
    const dir = queueDir();
    const request = {
      date: DATE,
      leagues: ['NCAAF'],
      games: [{ date: DATE, league: 'NCAAF', game_id: '202' }],
      reason: 'restart-test',
    };
    writeFileSync(join(dir, '.recovered.tmp'), JSON.stringify(request));

    expect(pendingGradeFiles(dir)).toEqual(['recovered.json']);
    expect(JSON.parse(readFileSync(join(dir, 'recovered.json'), 'utf8'))).toEqual(request);
  });

  it('does not collapse the same provider id across dates or leagues', () => {
    const dir = queueDir();
    const games = [
      { date: '2026-09-05', league: 'NFL', game_id: '101' },
      { date: '2026-09-05', league: 'NCAAF', game_id: '101' },
      { date: '2026-09-06', league: 'NFL', game_id: '101' },
    ];

    const first = queueExactGradeRequest({
      date: '2026-09-05',
      games: games.slice(0, 2),
      queueDir: dir,
      now: () => 2,
      pid: 10,
      random: () => 0.4,
    });
    expect(first.queued).toEqual(games.slice(0, 2));

    const otherDate = queueExactGradeRequest({
      date: '2026-09-06',
      games: [games[2]],
      queueDir: dir,
      now: () => 3,
      pid: 10,
      random: () => 0.6,
    });
    expect(otherDate.queued).toEqual([games[2]]);
  });
});
