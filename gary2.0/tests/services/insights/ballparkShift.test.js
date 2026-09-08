import { beforeEach, describe, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/insights/solText.js', () => ({ generateSolText: model }));
import { collectBallparkShiftGame } from '../../../src/services/insights/computers/ballparkShift.js';
import { attachLaneReads, detailFact } from '../../../src/services/insights/laneReads.js';
import { buildHubJudgmentPackets, validateHubJudgments } from '../../../src/services/insights/hubJudgment.js';

const observedAt = '2026-09-08T16:00:00.000Z';
const game = { id: 5059943, date: '2026-09-08T23:05:00Z', venue: 'Yankee Stadium', status: 'Scheduled',
  home_team: { id: 9, abbreviation: 'NYY' }, visitor_team: { id: 27, abbreviation: 'COL' } };
function source({ venue = {}, total = {} } = {}) {
  const bdl = {
    getMlbLineups: vi.fn(async () => ({ NYY: { pitcher: { name: 'Cam Schlittler', playerId: 33 }, batters: [] } })),
    getMlbPlayerSplits: vi.fn(async () => ({ byArena: [
      { category: 'pitching', split_name: 'Yankee Stadium', innings_pitched: '68.2', games_played: 13,
        games_started: 12, era: 3.41, earned_runs: 26, opponent_avg: .245, ...venue },
      { category: 'pitching', split_name: 'All Splits', innings_pitched: '171.2', earned_runs: 39, ...total },
    ] })),
  };
  return { bdl, season: 2026, gameLabel: () => 'COL @ NYY', now: () => observedAt };
}
beforeEach(() => model.mockReset());

describe('park innings retain exact observed outs', () => {
  it('collects a single game without prose and preserves the actual venue and season-minus-venue samples', async () => {
    const input = source(), [row] = await collectBallparkShiftGame(game, input);
    expect(model).not.toHaveBeenCalled();
    expect(input.bdl.getMlbPlayerSplits).toHaveBeenCalledWith({ playerId: 33, season: 2026 });
    expect(row).toMatchObject({ category: 'ballpark_shift', game_id: 5059943, player_id: 33, team_id: 9 });
    expect(row.detail).toContain('68.2');
    expect(row.detail).toContain('103.0');
    expect(row.detail).not.toContain('68.7');
    expect(row.meta).toMatchObject({ innings_notation: 'baseball_outs',
      computed_as_of: observedAt, source_collected_at: observedAt,
      venue: { outs: 206, innings_pitched: '68.2', earned_runs: 26, games: 13, starts: 12 },
      elsewhere: { outs: 309, innings_pitched: '103.0', earned_runs: 13, era: 1.14 },
      display_measurements: { venue_innings_pitched: '68.2', elsewhere_innings_pitched: '103.0',
        venue_games: '13', venue_starts: '12', venue_era: '3.41', elsewhere_era: '1.14' } });
  });

  it('borrows an inning correctly when subtracting a venue sample with more fractional outs than the total', async () => {
    const [row] = await collectBallparkShiftGame(game, source({ total: { innings_pitched: '171.1' } }));
    expect(row.meta.elsewhere).toMatchObject({ outs: 308, innings_pitched: '102.2' });
    expect(row.meta.display_measurements.elsewhere_era).toBe((13 * 27 / 308).toFixed(2));
  });

  it.each([68.7, 68.25, null, '', false, -1])('rejects malformed provider innings %j instead of guessing a conversion', async innings_pitched => {
    expect(await collectBallparkShiftGame(game, source({ venue: { innings_pitched } }))).toEqual([]);
    expect(await collectBallparkShiftGame(game, source({ total: { innings_pitched } }))).toEqual([]);
  });

  it('keeps the existing sample gates and does not fabricate missing counts or opponent averages', async () => {
    expect(await collectBallparkShiftGame(game, source({ venue: { innings_pitched: '14.2' } }))).toEqual([]);
    expect(await collectBallparkShiftGame(game, source({ venue: { earned_runs: null } }))).toEqual([]);
    const [row] = await collectBallparkShiftGame(game, source({ venue: { games_started: null, opponent_avg: null } }));
    expect(row.meta.venue.starts).toBeNull();
    expect(row.meta.venue.opponent_avg).toBeNull();
    expect(row.meta.display_measurements).not.toHaveProperty('venue_starts');
    expect(row.detail).not.toContain('Hitters bat');
  });

  it('retains the measured source and clock through optional prose and licenses only the supplied innings notation', async () => {
    const [row] = await collectBallparkShiftGame(game, source());
    const originalDetail = row.detail;
    model.mockResolvedValueOnce(JSON.stringify({ reads: [{ i: 0,
      read: 'The venue split gives this matchup a different starting point from the blended season line, while leaving the actual start unresolved.' }] }));
    await attachLaneReads('ballparkShift', [row], detailFact);
    expect(row.detail).not.toBe(originalDetail);
    expect(row.meta.computed_detail).toBe(originalDetail);
    expect(row.meta.computed_as_of).toBe(observedAt);
    const asOf = '2026-09-08T16:05:00.000Z';
    const packets = buildHubJudgmentPackets({ date: '2026-09-08', league: 'MLB', rows: [row], games: [game], asOf,
      contextByGame: new Map([['5059943', { complete: true, evidence: [{ id: 'current_context', game_id: '5059943',
        source_key: 'current_context|5059943||', label: 'Current pitchers', summary: 'Cam Schlittler remains probable.',
        source: 'Fixture current lineup', as_of: asOf, facts: {} }] }]]) });
    const evidence = packets[0].evidence[0];
    expect(evidence.as_of).toBe(observedAt);
    expect(evidence.facts.innings_notation).toBe('baseball_outs');
    const judgment = { game_id: '5059943', primary_evidence_id: evidence.id,
      take: 'The venue sample tempers confidence in Schlittler’s elsewhere results for this start.',
      explanation: 'The park and elsewhere samples describe different results, while the start remains probable.',
      full_case: 'The measured park sample is 68.2 innings; the measured elsewhere sample is 103.0 innings.',
      counterargument: 'A strong start remains possible; the historical split does not determine the next outing.',
      watch_for: 'Watch whether the probable starter changes.', critical_condition: 'Schlittler remains probable.',
      what_changed: null, prominence: 'standard', horizon: 'pregame',
      supporting_evidence_ids: [evidence.id, 'current_context'], counter_evidence_ids: [] };
    expect(() => validateHubJudgments(JSON.stringify({ judgments: [judgment] }), packets, { now: asOf })).not.toThrow();
    expect(() => validateHubJudgments(JSON.stringify({ judgments: [{ ...judgment, full_case: 'The park sample is 68.7 innings.' }] }),
      packets, { now: asOf })).toThrow('68.7');
  });
});
