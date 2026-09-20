import { describe, it, expect, vi } from 'vitest';
import { footballEvidenceBundle, formatFootballEvidence } from '../../src/services/footballEvidenceBundle.js';
import { formatNcaafTeamStats } from '../../src/services/agentic/scoutReport/sports/ncaaf.js';
import { formatNflTeamStats } from '../../src/services/agentic/scoutReport/sports/nfl.js';
import { nflGameEvidence } from '../../src/services/nflGameEvidence.js';

vi.mock('../../src/services/nflGameEvidence.js', () => ({ nflGameEvidence: vi.fn() }));

describe('guaranteed football source evidence', () => {
  const home = { id: 1 }, away = { id: 2 };
  it('delivers combined NFL evidence through the shipping bundle and formatter', async () => {
    const evidence = { home: { current_season: { season: 2026, offense: { epa: 0.2 } } },
      away: { prior_season_background: { season: 2025, defense: { epa: -0.1 } } } };
    vi.mocked(nflGameEvidence).mockResolvedValueOnce(evidence);
    const bundle = await footballEvidenceBundle({ league: 'NFL', home, away, season: 2026 });
    expect(nflGameEvidence).toHaveBeenCalledWith({ home, away, season: 2026 });
    expect(bundle).toEqual({ NFL_GAME_EVIDENCE: evidence });
    const text = formatFootballEvidence(bundle);
    expect(text).toContain('OFFENSE AND DEFENSE — SOURCE EVIDENCE');
    expect(text).toContain('prior_season_background');
    expect(text).toContain('2025');
    expect(text).toContain('2026');
  });
  it('keeps an unavailable NFL source explicit', async () => {
    const loaders = { NFL_GAME_EVIDENCE: async () => { throw Error('Play ledger unavailable'); } };
    const b = await footballEvidenceBundle({ league: 'NFL', home, away, season: 2026, loaders });
    expect(b.NFL_GAME_EVIDENCE).toEqual({ unavailable: true, reason: 'Play ledger unavailable' });
    expect(formatFootballEvidence(b)).toContain('Missing charting is not zero');
  });
  it('preserves all six college loaders, output values and the college heading', async () => {
    const keys = ['NCAAF_DEFENSE', 'NCAAF_PRESSURE_RATE', 'NCAAF_SUCCESS_RATE',
      'NCAAF_EXPLOSIVE_PLAYS', 'NCAAF_REDZONE', 'NCAAF_TURNOVER_MARGIN'];
    const values = Object.fromEntries(keys.map(key => [key, { source: key, season: 2026, sample: 2 }]));
    const loaders = Object.fromEntries(keys.map(key => [key, vi.fn(async () => values[key])]));
    const b = await footballEvidenceBundle({ league: 'NCAAF', home, away, season: 2026, loaders });
    expect(b).toEqual(values);
    for (const loader of Object.values(loaders)) expect(loader).toHaveBeenCalledWith('americanfootball_ncaaf', home, away, 2026);
    expect(formatFootballEvidence(b)).toBe(`DEFENSIVE MATCHUP — SOURCE EVIDENCE\nKeep the reported season, sample and units with each measure. Totals are not per-game rates. Missing charting is not zero.\n${keys.map(key => `${key}\n${JSON.stringify(values[key], null, 2)}`).join('\n\n')}`);
  });
  it.each([formatNcaafTeamStats, formatNflTeamStats])('does not print null measurements as zero', fn => {
    const stats = { season: 2026, games: 2, seasonStats: { passing_yards_per_game: null,
      passing_interceptions: null, opp_passing_yards: null } };
    const output = fn('Home', 'Away', stats, stats);
    expect(output).not.toMatch(/Passing[^\n]*\b0\.0\b/i);
    expect(output).toContain('—');
  });
});
