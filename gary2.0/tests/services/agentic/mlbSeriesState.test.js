// Jul 9 2026 — MLB SERIES STATE (founder-approved, both parts).
//
// The data behind it: since Jun 1, Gary's MLB profit is entirely series
// openers (+19.6u, 59.7%) while game 3+ is a losing lane (52.3%, -1.4u);
// in July the split is 61.8% +6.1u openers vs 44.4% -10.3u mid-series.
// Diagnosis: Gary reads every game as a fresh matchup — by game 2-3 that
// read is last night's public information. A fan ALWAYS knows it's game 3
// and that the team lost 12-4 yesterday; nothing made that unmissable.
//
// Part A: computeMlbSeriesState — pure derivation from the MLB Stats API
// recent-games shape (Final games, chronological) + optional upcoming games:
// series game number, series score so far, last meeting's result. Rendered
// as a SERIES STATE section in the scout report. Facts only — Gary decides
// what any of it means.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { computeMlbSeriesState } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(__dirname, '../../../src', rel), 'utf8');

// MLB Stats API /schedule game shape (only the fields the helper reads).
const g = (date, awayName, awayScore, homeName, homeScore) => ({
  officialDate: date,
  teams: {
    away: { team: { name: awayName }, score: awayScore },
    home: { team: { name: homeName }, score: homeScore },
  },
});

// Tonight: Braves @ Pirates. Recent games are the PIRATES' (home team's) list,
// chronological (oldest first), full MLB Stats API names.
const older = [
  g('2026-07-04', 'Pittsburgh Pirates', 2, 'St. Louis Cardinals', 5),
  g('2026-07-05', 'Pittsburgh Pirates', 4, 'St. Louis Cardinals', 1),
];

describe('computeMlbSeriesState', () => {
  it('series opener: no consecutive prior meetings', () => {
    const s = computeMlbSeriesState('Pirates', 'Braves', older);
    expect(s.seriesGame).toBe(1);
    expect(s.line).toContain('Series opener vs Braves');
  });

  it('game 3, series 1-1, last night line from the home perspective', () => {
    const games = [
      ...older,
      g('2026-07-07', 'Atlanta Braves', 4, 'Pittsburgh Pirates', 12), // Pirates won
      g('2026-07-08', 'Atlanta Braves', 6, 'Pittsburgh Pirates', 2),  // Braves won
    ];
    const s = computeMlbSeriesState('Pirates', 'Braves', games);
    expect(s.seriesGame).toBe(3);
    expect(s.line).toContain('Game 3');
    expect(s.line).toContain('series 1-1');
    expect(s.line).toContain('Braves won 6-2');
  });

  it('an interleaved game vs another team breaks the series run', () => {
    const games = [
      g('2026-07-06', 'Atlanta Braves', 1, 'Pittsburgh Pirates', 0),
      g('2026-07-08', 'Pittsburgh Pirates', 3, 'Cincinnati Reds', 4), // different opponent after
    ];
    const s = computeMlbSeriesState('Pirates', 'Braves', games);
    expect(s.seriesGame).toBe(1);
  });

  it('a sweep-in-progress reads with the leader named', () => {
    const games = [
      g('2026-07-07', 'Atlanta Braves', 4, 'Pittsburgh Pirates', 12),
      g('2026-07-08', 'Atlanta Braves', 2, 'Pittsburgh Pirates', 5),
    ];
    const s = computeMlbSeriesState('Pirates', 'Braves', games);
    expect(s.line).toContain('Pirates lead the series 2-0');
  });

  it('upcoming games vs the same opponent complete the "of N"', () => {
    const games = [g('2026-07-08', 'Atlanta Braves', 6, 'Pittsburgh Pirates', 2)];
    const upcoming = [g('2026-07-10', 'Atlanta Braves', null, 'Pittsburgh Pirates', null)];
    const s = computeMlbSeriesState('Pirates', 'Braves', games, upcoming);
    expect(s.line).toContain('Game 2 of 3');
  });

  it('a known-empty lookahead marks the finale ("Game 2 of 2"); null omits "of N"', () => {
    const games = [g('2026-07-08', 'Atlanta Braves', 6, 'Pittsburgh Pirates', 2)];
    expect(computeMlbSeriesState('Pirates', 'Braves', games, []).line).toContain('Game 2 of 2');
    expect(computeMlbSeriesState('Pirates', 'Braves', games, null).line).toMatch(/Game 2 vs/);
  });

  it('no recent games at all degrades to opener with no crash', () => {
    const s = computeMlbSeriesState('Pirates', 'Braves', []);
    expect(s.seriesGame).toBe(1);
  });
});

describe('wiring: scout report renders SERIES STATE; awareness carries the approved bullet', () => {
  it('mlb.js renders the section', () => {
    const f = src('services/agentic/scoutReport/sports/mlb.js');
    expect(f).toContain('SERIES STATE');
    expect(f).toContain('computeMlbSeriesState');
  });

  it('awareness block carries the founder-approved series bullet, verbatim', () => {
    const f = src('services/agentic/orchestrator/spreadEvaluationFactors.js');
    expect(f).toContain('A series is one opponent on consecutive nights.');
    expect(f).toContain('Game one is priced off the fresh matchup; every game after is priced knowing the night before');
    expect(f).toContain("The season series and last night's game are public; tonight's number was set after both.");
  });
});
