import { describe, expect, it } from 'vitest';
import { firstInningResearchDetail, oneRunResearchDetail, observedCount } from '../../../src/services/insights/researchFacts.js';

const teamSample = (overrides = {}) => ({ kind: 'nrfi', side: 'TEAM_QUIET', team_abbr: 'FIX',
  team_n: 10, team_scored: 0, team_seq: Array(10).fill(0), season: 2026,
  sp_first_inning: [{ name: 'Fixture Pitcher', ip: '16.0', era: '0.00', avg: '.167', hr: 0 }], ...overrides });
const record = (overrides = {}) => ({ kind: 'one_run_record', team_name: 'Fixture Club', season: 2026,
  one_run_wins: 25, one_run_losses: 13, other_wins: 40, other_losses: 32, ...overrides });

describe('measured first-inning research', () => {
  it('retains observed zero and explicit historical season sample without assigning a starter', () => {
    const detail = firstInningResearchDetail(teamSample());
    expect(detail).toBe('FIX scored in the first inning in 0 of the 10 sampled games. 2026 first-inning pitching samples — Fixture Pitcher: 0.00 ERA, .167 opponent AVG across 16.0 IP, 0 HR.');
    expect(detail).not.toMatch(/expect|free pass|will|tonight|should|bet|xera/i);
  });
  it.each([
    { team_scored: 1 }, { team_n: 9 }, { team_seq: [null, ...Array(9).fill(0)] },
    { team_seq: [false, ...Array(9).fill(0)] }, { team_scored: null }, { side: 'pick' },
  ])('rejects mismatched or unobserved counts: %j', override => {
    expect(firstInningResearchDetail(teamSample(override))).toBeNull();
  });
  it('makes a matchup sample about any first-inning run, without adding overlapping game samples', () => {
    expect(firstInningResearchDetail({ kind: 'nrfi', side: 'NRFI', home_abbr: 'FIX', away_abbr: 'OPP',
      home_n: 8, home_any: 1, home_seq: [1, ...Array(7).fill(0)],
      away_n: 10, away_any: 0, away_seq: Array(10).fill(0),
    })).toBe('A run was scored by either team in the first inning in 1 of 8 sampled FIX games and 0 of 10 sampled OPP games.');
  });
  it.each([null, false, [], ['16.0'], '16.7', '0.0'])('omits invalid or empty pitcher innings %j', ip => {
    expect(firstInningResearchDetail(teamSample({ sp_first_inning: [{ name: 'Fixture Pitcher', ip, era: '0.00' }] })))
      .toBe('FIX scored in the first inning in 0 of the 10 sampled games.');
  });
  it('omits unavailable rate and HR fields rather than supplying zeros', () => {
    const detail = firstInningResearchDetail(teamSample({ sp_first_inning: [{ name: 'Fixture Pitcher', ip: '5.2', era: null, avg: '.167', hr: null }] }));
    expect(detail).toContain('Fixture Pitcher: .167 opponent AVG across 5.2 IP.');
    expect(detail).not.toMatch(/ERA|HR/);
  });
  it('uses a validated caller season for legacy metadata and omits pitching context without one', () => {
    const meta = teamSample({ season: undefined });
    expect(firstInningResearchDetail(meta)).not.toContain('pitching');
    expect(firstInningResearchDetail(meta, { season: 2026 })).toContain('2026 first-inning pitching samples');
  });
});

describe('measured one-run research', () => {
  it('compares actual one-run and other-game records without a market or regression conclusion', () => {
    const detail = oneRunResearchDetail(record());
    expect(detail).toBe('Fixture Club are 25-13 in one-run games in the 2026 regular season (38 completed games). They are 40-32 in their other 72 completed games.');
    expect(detail).not.toMatch(/premium|market|regress|\.500|expect|should/);
  });
  it.each([null, false, '', -1, 1.5])('never treats unobserved counts %j as zero', value => {
    expect(observedCount(value)).toBeNull();
    expect(oneRunResearchDetail(record({ one_run_wins: value }))).toBeNull();
  });
  it('retains zero losses but omits a partially missing comparison', () => {
    const detail = oneRunResearchDetail(record({ one_run_losses: 0, other_wins: null }));
    expect(detail).toContain('25-0');
    expect(detail).not.toContain('They are');
  });
  it('does not infer structured measurements from legacy opinion prose', () => {
    expect(oneRunResearchDetail({ evidence: 'Fixture Club are 25-13 in one-run games (.658 win%).' })).toBeNull();
    expect(oneRunResearchDetail(record({ kind: 'hitter_regression' }))).toBeNull();
  });
});
