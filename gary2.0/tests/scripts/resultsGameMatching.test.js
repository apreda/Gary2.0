import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { canGroundGameScore, matchGame } from '../../src/services/teamMatch.js';
import { isFinalGameStatus, pickGameId } from '../../scripts/lib/resultsGradingReliability.js';

// Run the real grading orchestration without importing the command's top-level
// credential loader or executing its provider, model, and database entry points.
const source = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const declaration = source.slice(
  source.indexOf('async function processGenericGames('),
  source.indexOf('\nlet propResultIdentityColumnsAvailable;'),
);

function harness({ pick, games = [], table = 'daily_picks' }) {
  const queries = [];
  const supabase = {
    from(name) {
      const query = {
        select() { return query; },
        eq() { return query; },
        gte() { return query; },
        in(column, values) { queries.push({ table: name, column, values }); return query; },
        then(resolve) { return Promise.resolve({ data: name === table ? [{ picks: [pick] }] : [] }).then(resolve); },
      };
      return query;
    },
  };
  const fetchGames = vi.fn(typeof games === 'function' ? games : async () => games);
  const getScoreGrounding = vi.fn(async () => ({ h: 9, v: 1 }));
  // Stop just before persistence: the call arguments prove the chosen score
  // identity, and no result writer is supplied to the VM.
  const gradeGame = vi.fn(() => null);
  const processGames = vm.runInNewContext(`(${declaration})`, {
    supabase,
    console: { log() {}, warn() {}, error() {} },
    emptySettlementStats: () => ({ candidates: 0, invalidIdentity: 0, unmatched: 0,
      pendingNonFinal: 0, finalEligible: 0, unresolvedFinal: 0 }),
    WINNERS_CUTOVER_DATE: '2026-09-04',
    admittedGameKeys: () => new Set(),
    storedPickGameId: pickGameId,
    matchGame,
    canGroundGameScore,
    isFinalGameStatus,
    fetchGames,
    fetchMlbGamesForETDate: date => fetchGames('MLB', date),
    fetchNCAAFGames: date => fetchGames('NCAAF', date),
    normalizeToETDate: () => '2026-09-08',
    ncaafSlateDateForKickoff: () => '2026-09-08',
    getScoreGrounding,
    gradeGame,
  });
  return { queries, fetchGames, getScoreGrounding, gradeGame,
    run: () => processGames(table, '2026-09-08') };
}

const pick = { league: 'MLB', homeTeam: 'Cubs', awayTeam: 'Reds', pick: 'Cubs ML -110' };
const first = { id: 101, home_team: { name: 'Chicago Cubs' }, away_team: { name: 'Cincinnati Reds' },
  status: 'Final', home_team_score: 3, away_score: 2 };
const second = { ...first, id: 102, home_team_score: 1, away_score: 4 };

describe('results runner game identity and score-grounding boundary', () => {
  it.each([
    ['missing exact ID with another same-teams game', { ...pick, game_id: 102 }, [first]],
    ['missing exact ID during an empty provider response', { ...pick, game_id: 102 }, []],
    ['ambiguous legacy doubleheader', pick, [first, second]],
    ['alternate provider ID', { ...pick, game_id: 102 }, [{ ...first, espn_id: 102, gamePk: 102 }]],
  ])('leaves %s pending without model grounding or grading', async (_label, stored, games) => {
    const h = harness({ pick: stored, games });
    expect(await h.run()).toMatchObject({ unmatched: 1, finalEligible: 0 });
    expect(h.gradeGame).not.toHaveBeenCalled();
    expect(h.getScoreGrounding).not.toHaveBeenCalled();
  });

  it('does not borrow a final score while the exact doubleheader game is in progress', async () => {
    const h = harness({ pick: { ...pick, game_id: 102 }, games: [first, { ...second, status: 'In Progress' }] });
    expect(await h.run()).toMatchObject({ pendingNonFinal: 1, finalEligible: 0 });
    expect(h.gradeGame).not.toHaveBeenCalled();
    expect(h.getScoreGrounding).not.toHaveBeenCalled();
  });

  it('does not invent missing scores for a provider-confirmed final', async () => {
    const h = harness({ pick: { ...pick, game_id: 102 },
      games: [{ ...second, home_team_score: null, away_score: null }] });
    expect(await h.run()).toMatchObject({ finalEligible: 1, unresolvedFinal: 1 });
    expect(h.gradeGame).not.toHaveBeenCalled();
    expect(h.getScoreGrounding).not.toHaveBeenCalled();
  });

  it('keeps a unique legacy provider match and uses its actual scores', async () => {
    const h = harness({ pick, games: [first] });
    await h.run();
    expect(h.gradeGame).toHaveBeenCalledWith(pick.pick, 'Cubs', 'Reds', 3, 2);
    expect(h.getScoreGrounding).not.toHaveBeenCalled();
  });

  it('preserves the ID-less provider-absent score fallback', async () => {
    const h = harness({ pick });
    await h.run();
    expect(h.getScoreGrounding).toHaveBeenCalledWith('MLB', 'Cubs', 'Reds', '2026-09-08');
    expect(h.gradeGame).toHaveBeenCalledWith(pick.pick, 'Cubs', 'Reds', 9, 1);
  });

  it('searches later weekly dates for the exact ID without taking an earlier same-team result', async () => {
    const stored = { ...pick, league: 'NFL', game_id: 102 };
    const h = harness({ pick: stored, table: 'weekly_nfl_picks',
      games: async (_league, date) => date === '2026-09-08' ? [first] : [second] });
    await h.run();
    expect(h.fetchGames).toHaveBeenCalledTimes(2);
    expect(h.gradeGame).toHaveBeenCalledWith(pick.pick, 'Cubs', 'Reds', 1, 4);
    expect(h.getScoreGrounding).not.toHaveBeenCalled();
  });

  it('uses the explicit BDL ID consistently for game matching and Winners admission reads', async () => {
    const h = harness({ pick: { ...pick, game_id: 101, bdl_game_id: 102 }, games: [first, second] });
    await h.run();
    expect(h.gradeGame).toHaveBeenCalledWith(pick.pick, 'Cubs', 'Reds', 1, 4);
    expect(h.queries).toContainEqual({ table: 'winners_board', column: 'game_id', values: ['102'] });
    expect(h.getScoreGrounding).not.toHaveBeenCalled();
  });
});
