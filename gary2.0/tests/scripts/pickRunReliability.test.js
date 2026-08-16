import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertPicksStillPregame,
  exactFootballGameDiscoveryOptions,
  formatPickRunOutcome,
  parsePickRunOutcome,
} from '../../scripts/lib/pickRunReliability.js';

describe('exact football game discovery scope', () => {
  it('passes canonical ids through for NFL and NCAAF scheduler runs', () => {
    expect(exactFootballGameDiscoveryOptions('americanfootball_nfl', 101)).toEqual({ gameId: '101' });
    expect(exactFootballGameDiscoveryOptions('americanfootball_ncaaf', '202')).toEqual({ gameId: '202' });
  });

  it('does not change manual no-id or non-football discovery', () => {
    expect(exactFootballGameDiscoveryOptions('americanfootball_nfl', null)).toEqual({});
    expect(exactFootballGameDiscoveryOptions('americanfootball_ncaaf', '')).toEqual({});
    expect(exactFootballGameDiscoveryOptions('baseball_mlb', '303')).toEqual({});
  });
});

describe('scheduler-readable game-pick outcomes', () => {
  it('round-trips a stored exact-game outcome', () => {
    const outcome = { status: 'stored', game_ids: ['5059617'], pick_count: 1 };
    expect(parsePickRunOutcome(`logs\n${formatPickRunOutcome(outcome)}\n`)).toEqual(outcome);
  });

  it('rejects missing, malformed, dry-run-invalid, and unknown markers', () => {
    expect(parsePickRunOutcome('ordinary log')).toBeNull();
    expect(parsePickRunOutcome('@@GARY_PICK_OUTCOME@@{bad')).toBeNull();
    expect(parsePickRunOutcome('@@GARY_PICK_OUTCOME@@{"status":"pass"}')).toBeNull();
  });
});

describe('game-pick CLI lifecycle', () => {
  it('flushes scheduler output before an explicit successful exit so props are not blocked by open handles', () => {
    const source = readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');
    expect(source).toMatch(/args\.includes\('--nfl'\)\s*\|\|\s*args\.includes\('--ncaaf'\)/);
    expect(source).toMatch(/main\(\)\s*\.then\(\(\) => exitRunner\(0\)\)/);
  });
});

describe('final pregame storage guard', () => {
  const now = Date.parse('2026-08-15T16:30:00.000Z');

  it('allows a verified pick while the game is still upcoming', () => {
    expect(() => assertPicksStillPregame([
      { game: 'CLE @ CHI', commence_time: '2026-08-15T17:00:00.000Z' },
    ], now)).not.toThrow();
  });

  it('blocks a pick at or after first pitch/kickoff', () => {
    expect(() => assertPicksStillPregame([
      { game: 'CLE @ CHI', commence_time: '2026-08-15T16:30:00.000Z' },
    ], now)).toThrow(/already started/);
  });

  it('fails closed when the scheduled start is missing or malformed', () => {
    expect(() => assertPicksStillPregame([
      { game: 'CLE @ CHI', commence_time: 'not-a-date' },
    ], now)).toThrow(/missing or invalid commence_time/);
  });
});
