import { describe, expect, it } from 'vitest';
import {
  buildGameLedger, ledgerLines, recordSlice, recencyStrip, isNightGame
} from '../../../src/services/agentic/tools/statRouters/footballRecordLedger.js';

/**
 * RECORDS CITE, THEY DO NOT REPEAT (founder, Aug 25 2026).
 *
 * His argument: a record is a tally with the reasoning removed. Points per
 * game lets a desk infer something about an offence; "5-0" says five things
 * happened without saying what any of them were. So a record must never
 * arrive naked — but the games behind it must also not be reprinted by every
 * lane that mentions one, or the season gets dumped five times and buries the
 * game being handicapped.
 *
 * The resolution under test: one ledger, cited by reference.
 */

const game = (over = {}) => ({
  gameId: 1, date: '2025-11-02T18:00:00Z', week: 9, home: true,
  opponent: 'Some Team', opponentId: 99, summary: null,
  scored: 27, allowed: 10, margin: 17, won: true,
  halftimeFor: 14, halftimeAgainst: 3, secondHalfFor: 13, secondHalfAgainst: 7,
  shapeKnown: true, ...over
});

describe('the ledger', () => {
  it('tags games newest first, G1 being the most recent', () => {
    const led = buildGameLedger([
      game({ week: 9 }), game({ week: 8, won: false }), game({ week: 7 })
    ]);
    expect(led.games.map((g) => g.ref)).toEqual(['G1', 'G2', 'G3']);
    expect(led.games[0].week).toBe('Wk 9');
    expect(led.byRef.get('G2').won).toBe(false);
  });

  it('returns null for a team with no completed games rather than an empty ledger', () => {
    expect(buildGameLedger([])).toBeNull();
    expect(buildGameLedger(null)).toBeNull();
  });

  it('carries how the team PLAYED, not only what the score was', () => {
    const playLines = new Map([[9, {
      offense_epa_per_play: 0.21, offense_success_rate: 0.51,
      defense_epa_per_play_allowed: -0.08, quarterback: 'J.Goff'
    }]]);
    const led = buildGameLedger([game({ week: 9 })], { playLines });
    expect(led.games[0].offense_epa_per_play).toBe(0.21);
    const rendered = ledgerLines(led)[0];
    expect(rendered).toMatch(/\[G1\]/);
    expect(rendered).toMatch(/offence \+0\.21 EPA\/play/);
  });

  it('renders a postseason game as Postseason, never as week 999', () => {
    const led = buildGameLedger([game({ week: 999 })]);
    expect(led.games[0].week).toBe('Postseason');
  });
});

describe('a record cites its games instead of reprinting them', () => {
  const results = [
    game({ week: 9, date: '2025-11-02T18:00:00Z', won: true }),         // day
    game({ week: 8, date: '2025-10-27T01:20:00Z', won: false }),        // night ET
    game({ week: 7, date: '2025-10-20T00:15:00Z', won: true })          // night ET
  ];

  it('returns the record and the REFERENCES, not the accounts', () => {
    const led = buildGameLedger(results);
    const slice = recordSlice(led, (raw) => isNightGame(raw.date), 'Primetime');

    expect(slice.record).toBe('1-1');
    expect(slice.games_used).toBe(2);
    // References only. The accounts live in the ledger, cited once.
    expect(slice.games).toEqual(['G2', 'G3']);
    for (const entry of slice.games) expect(entry).toMatch(/^G\d+$/);
  });

  it('every record carries the same warning about what a record is', () => {
    const led = buildGameLedger(results);
    const slice = recordSlice(led, () => true, 'Overall');
    expect(slice.caution).toMatch(/not a measure of quality/);
    expect(slice.caution).toMatch(/read the cited games/);
  });

  it('an empty slice says there were no such games rather than reporting 0-0', () => {
    const led = buildGameLedger([game({ date: '2025-11-02T18:00:00Z' })]);
    const slice = recordSlice(led, () => false, 'Primetime');
    // "0-0" reads as a result. "None played" is the truth.
    expect(slice.record).toBeNull();
    expect(slice.note).toMatch(/No primetime games/);
  });

  it('a cited reference always resolves back to a real game', () => {
    const led = buildGameLedger(results);
    const slice = recordSlice(led, (raw) => isNightGame(raw.date), 'Primetime');
    for (const ref of slice.games) expect(led.byRef.get(ref)).toBeDefined();
  });
});

describe('night games are judged in Eastern time', () => {
  it('an 8pm ET kickoff is primetime', () => {
    expect(isNightGame('2025-10-27T01:20:00Z')).toBe(true);   // 9:20pm ET
  });
  it('a 1pm ET kickoff is not', () => {
    expect(isNightGame('2025-11-02T18:00:00Z')).toBe(false);  // 1pm ET
  });
  it('a missing date is not a night game', () => {
    expect(isNightGame(null)).toBe(false);
  });
});

describe('recency is per-game AND rolling, never one instead of the other', () => {
  const results = [game({ week: 9 }), game({ week: 8, won: false }), game({ week: 7 }), game({ week: 6 }), game({ week: 5, won: false })];

  it('names each of the last three games individually', () => {
    const strip = recencyStrip(buildGameLedger(results));
    expect(strip.game_by_game).toHaveLength(3);
    expect(strip.game_by_game[0].position).toBe('most recent');
    expect(strip.game_by_game[1].position).toBe('second most recent');
    expect(strip.game_by_game[2].position).toBe('3 games back');
  });

  it('supplies the rolling windows beside them', () => {
    const strip = recencyStrip(buildGameLedger(results));
    expect(strip.rolling.last_1.record).toBe('1-0');
    expect(strip.rolling.last_3.record).toBe('2-1');
    expect(strip.rolling.last_5.record).toBe('3-2');
  });

  it('each window cites the games it used', () => {
    const strip = recencyStrip(buildGameLedger(results));
    expect(strip.rolling.last_3.refs).toEqual(['G1', 'G2', 'G3']);
  });

  it('says why both views are present, since the reason is the whole design', () => {
    const strip = recencyStrip(buildGameLedger(results));
    expect(strip.reading_note).toMatch(/Seventeen games is a short season/);
  });

  it('does not invent games it does not have', () => {
    const strip = recencyStrip(buildGameLedger([game({ week: 9 })]));
    expect(strip.game_by_game).toHaveLength(1);
    expect(strip.rolling.last_5.games_used).toBe(1);
  });
});
