import { describe, it, expect } from 'vitest';
import {
  teamFinalsChrono,
  computeTeamMonthArc,
  computeBounceBackLine,
  computeRecordSince,
  computeRelieverUsagePattern,
} from '../../../src/services/agentic/scoutReport/sports/mlbSeasonContext.js';
import { classifyPaResult } from '../../../src/services/agentic/scoutReport/sports/mlbPlatoonRecency.js';

const idx = (games) => ({ entries: () => new Map(games.map((g, i) => [i + 1, g])).entries() });
const final = (date, homeId, awayId, homeRuns, awayRuns, extra = {}) => ({
  date: `${date}T23:10:00Z`, homeId, awayId, homeRuns, awayRuns, status: 'Final', ...extra,
});

describe('teamFinalsChrono', () => {
  it('keeps only decided regular-season finals for the team, in ET order', () => {
    const games = [
      final('2026-05-02', 1, 2, 5, 3),
      final('2026-04-30', 2, 1, 4, 6),                         // team 1 away, won
      final('2026-05-01', 1, 3, 2, 2),                         // tie rows never happen in MLB — dropped as undecided
      final('2026-03-10', 1, 2, 9, 0, { seasonType: 'spring_training' }),
      { date: '2026-05-03T23:10:00Z', homeId: 1, awayId: 2, homeRuns: 3, awayRuns: 1, status: 'Scheduled' },
    ];
    const rows = teamFinalsChrono(idx(games), 1);
    expect(rows.map((r) => r.won)).toEqual([true, true]);
    expect(rows[0].date < rows[1].date).toBe(true);
  });
});

describe('computeBounceBackLine', () => {
  it('prints only the branch matching the last final', () => {
    // Alternating W/L across 12 games, ending on a LOSS.
    const games = [];
    for (let d = 1; d <= 12; d++) {
      const won = d % 2 === 1;
      games.push(final(`2026-06-${String(d).padStart(2, '0')}`, 1, 2, won ? 5 : 2, won ? 2 : 5));
    }
    const line = computeBounceBackLine(idx(games), 1, 'Reds');
    expect(line).toContain('lost their last game');
    expect(line).toContain('after a loss this season:');
    // After each of the 6 losses (games 2,4,6,8,10 are losses; the ones with
    // a following game: 2,4,6,8,10 → next game always a win): 5-0.
    expect(line).toContain('5-0');
  });
});

describe('computeRecordSince', () => {
  it('counts only finals strictly after the date', () => {
    const games = [
      final('2026-08-01', 1, 2, 4, 2),
      final('2026-08-03', 1, 2, 1, 7),
      final('2026-08-05', 2, 1, 0, 3),
    ];
    expect(computeRecordSince(idx(games), 1, '2026-08-01')).toEqual({ wins: 1, losses: 1 });
    expect(computeRecordSince(idx(games), 1, '2026-08-05')).toBeNull();
  });
});

describe('computeTeamMonthArc', () => {
  it('rolls W-L and run rates per month', () => {
    const games = [];
    for (let d = 1; d <= 6; d++) games.push(final(`2026-06-0${d}`, 1, 2, 6, 1));
    for (let d = 1; d <= 6; d++) games.push(final(`2026-07-0${d}`, 2, 1, 5, 2)); // team 1 away, loses all
    const arc = computeTeamMonthArc(idx(games), 1);
    expect(arc).toContain('Jun 6-0, 6.0/1.0');
    expect(arc).toContain('Jul 0-6, 2.0/5.0');
  });
});

describe('computeRelieverUsagePattern', () => {
  const app = (date, pitches, ip = '1.0', gs = 0) => ({ date, stat: { numberOfPitches: pitches, inningsPitched: ip, gamesStarted: gs } });
  it('counts back-to-backs, 3-in-4s, pitch loads, and multi-inning outings', () => {
    const log = [
      app('2026-07-01', 12),
      app('2026-07-02', 18),          // back-to-back
      app('2026-07-04', 25, '1.2'),   // 3 apps in Jul 1-4 window, 4+ outs
      app('2026-07-10', 30),
      app('2026-07-15', 8, '0.1'),
    ];
    const line = computeRelieverUsagePattern(log);
    expect(line).toContain('5 G');
    expect(line).toContain('1× back-to-back days');
    expect(line).toContain('1× 3-in-4 days');
    expect(line).toContain('max 30');
    expect(line).toContain('1× 4+ outs');
  });
  it('says never on back-to-back days when the log shows none, and skips starts', () => {
    const log = [
      app('2026-07-01', 15),
      app('2026-07-04', 15),
      app('2026-07-08', 15),
      app('2026-07-09', 90, '6.0', 1), // a START the day after a relief outing — not pen usage
    ];
    const line = computeRelieverUsagePattern(log);
    expect(line).toContain('never on back-to-back days');
    expect(line).toContain('3 G');
  });
  it('returns null on thin logs', () => {
    expect(computeRelieverUsagePattern([app('2026-07-01', 10)])).toBeNull();
  });
});

describe('classifyPaResult', () => {
  it('classifies the BDL result vocabulary tolerantly', () => {
    expect(classifyPaResult('Single')).toMatchObject({ isAb: true, isHit: true, isHr: false });
    expect(classifyPaResult('Home Run')).toMatchObject({ isAb: true, isHit: true, isHr: true });
    expect(classifyPaResult('Walk')).toMatchObject({ isAb: false, isBb: true });
    expect(classifyPaResult('Intent Walk')).toMatchObject({ isAb: false, isBb: true });
    expect(classifyPaResult('Strikeout')).toMatchObject({ isAb: true, isK: true, isHit: false });
    expect(classifyPaResult('Groundout')).toMatchObject({ isAb: true, isHit: false });
    expect(classifyPaResult('Sac Fly')).toMatchObject({ isAb: false });
    expect(classifyPaResult('Hit By Pitch')).toMatchObject({ isAb: false });
    // Unknown words are at-bat outs, never hits.
    expect(classifyPaResult('Fielders Choice Out')).toMatchObject({ isAb: true, isHit: false });
    expect(classifyPaResult('')).toMatchObject({ isAb: false, isHit: false });
  });
});
