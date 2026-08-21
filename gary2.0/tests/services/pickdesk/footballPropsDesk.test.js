import { describe, it, expect } from 'vitest';
import {
  FOOTBALL_PROPS_ASK,
  FOOTBALL_PROPS_PROMPT_SHA,
  isFootballFunLane,
  nflWeekStartForInstant,
  nflSeasonForInstant,
} from '../../../src/services/pickdesk/footballPropsDesk.js';
import {
  THE_PROPS_ASK,
  PROPS_PROMPT_SHA,
  buildPropBoardV2,
  selectPrimaryMarkets,
} from '../../../src/services/pickdesk/propsBrain.js';
import { VALID_NFL_PROP_TYPES } from '../../../src/services/agentic/nflPropsAgenticContext.js';
import { MARKET_TYPE_MAP } from '../../../src/services/ncaafPropOddsService.js';
import { canonicalNFLPropType } from '../../../scripts/lib/resultsGradingReliability.js';
import { hasNcaafPropStatEvidence } from '../../../src/services/ncaafPropStats.js';

// ═══ Football props ask — the MLB contract in football's day grammar ════════
describe('football props ask (product contract)', () => {
  it('is the MLB ask with today grammar and the inactive wording', () => {
    expect(FOOTBALL_PROPS_ASK).toContain("Pick the prop bets you want from today's board — an empty list means you pass this game.");
    expect(FOOTBALL_PROPS_ASK).toContain("fresh news — today's inactive — is the exception");
    expect(FOOTBALL_PROPS_ASK).toContain('"prop_type": "[key from the board]"');
    expect(FOOTBALL_PROPS_ASK).toContain('confidence_score (0.50–1.00)');
    expect(FOOTBALL_PROPS_ASK).not.toContain('tonight');
    // No steering, no strategy, no menu explanations beyond the output contract.
    expect(FOOTBALL_PROPS_ASK).not.toMatch(/value|edge|sharp|favor|prefer|target/i);
  });

  it('carries its own prompt era, distinct from the MLB props era', () => {
    expect(FOOTBALL_PROPS_PROMPT_SHA).toMatch(/^[0-9a-f]{12}$/);
    expect(FOOTBALL_PROPS_PROMPT_SHA).not.toBe(PROPS_PROMPT_SHA);
    // The two contracts differ ONLY in day grammar + injury noun — same laws.
    expect(THE_PROPS_ASK.replace(/tonight's/g, "today's").replace("today's scratch", "today's inactive"))
      .toBe(FOOTBALL_PROPS_ASK);
  });
});

// ═══ The football fun lane (anytime TD = the HR analog) ═════════════════════
describe('isFootballFunLane', () => {
  it('matches every anytime-TD alias and nothing else', () => {
    expect(isFootballFunLane('anytime_td')).toBe(true);
    expect(isFootballFunLane('anytime_touchdown')).toBe(true);
    expect(isFootballFunLane('player_anytime_td')).toBe(true);
    expect(isFootballFunLane('passing_touchdowns')).toBe(false);
    expect(isFootballFunLane('rushing_touchdowns')).toBe(false);
    expect(isFootballFunLane('receiving_touchdowns')).toBe(false);
    expect(isFootballFunLane('first_td')).toBe(false);
    expect(isFootballFunLane('receptions')).toBe(false);
  });

  it('selectPrimaryMarkets keeps takeable one-sided TD rungs under the football fun lane', () => {
    const rows = [
      { player: 'Joe Mixon', prop_type: 'anytime_td', line: 0.5, over_odds: 120, under_odds: null },
      { player: 'Nico Collins', prop_type: 'anytime_td', line: 0.5, over_odds: 165, under_odds: null },
      // Off-window TD rung is not takeable — off the board entirely.
      { player: 'Deep Bench', prop_type: 'anytime_td', line: 0.5, over_odds: 800, under_odds: null },
      // Ordinary two-sided market unaffected.
      { player: 'C.J. Stroud', prop_type: 'passing_yards', line: 245.5, over_odds: -110, under_odds: -110 },
      // One-sided CORE market (no opposing price) stays off the board.
      { player: 'Dalton Schultz', prop_type: 'receiving_yards', line: 30.5, over_odds: -140, under_odds: null },
    ];
    const { rows: primaries, stats } = selectPrimaryMarkets(rows, { isFunLane: isFootballFunLane });
    const kept = primaries.map((r) => `${r.player} ${r.prop_type}`).sort();
    expect(kept).toEqual(['C.J. Stroud passing_yards', 'Joe Mixon anytime_td', 'Nico Collins anytime_td']);
    expect(stats.dropped_one_sided_pairs).toBe(1); // Schultz
  });

  it('the default (MLB) fun lane still keeps HR rungs, not TD rungs', () => {
    const rows = [
      { player: 'Aaron Judge', prop_type: 'home_runs', line: 0.5, over_odds: 320, under_odds: null },
      { player: 'Joe Mixon', prop_type: 'anytime_td', line: 0.5, over_odds: 120, under_odds: null },
    ];
    const { rows: primaries } = selectPrimaryMarkets(rows);
    expect(primaries.map((r) => r.prop_type)).toEqual(['home_runs']);
  });
});

// ═══ Board hooks (football wording + external cleared counts) ═══════════════
describe('buildPropBoardV2 football hooks', () => {
  const rows = [
    { player: 'C.J. Stroud', team: 'Houston Texans', prop_type: 'passing_yards', line: 245.5, over_odds: -110, under_odds: -110 },
    { player: 'Joe Mixon', team: 'Houston Texans', prop_type: 'anytime_td', line: 0.5, over_odds: 120, under_odds: null },
  ];

  it('prints the football header and labeled sides', () => {
    const board = buildPropBoardV2(rows, { isFunLane: isFootballFunLane, headerLabel: `today's live prop prices` });
    expect(board.text).toContain(`THE PROP BOARD (today's live prop prices)`);
    expect(board.text).toContain('passing_yards 245.5 (Over -110 / Under -110)');
    expect(board.text).toContain('anytime_td 0.5 (Over +120)');
    expect(board.players).toEqual(new Set(['c.j. stroud', 'joe mixon']));
  });

  it('uses the injected cleared-count source (game logs, not MLB chrono rows)', () => {
    const board = buildPropBoardV2(rows, {
      isFunLane: isFootballFunLane,
      clearedClauseFor: (playerKey, propType, line) =>
        playerKey === 'c.j. stroud' && propType === 'passing_yards' && line === 245.5
          ? 'over in 4 of his last 5 games' : null,
    });
    expect(board.text).toContain('passing_yards 245.5 (Over -110 / Under -110) — over in 4 of his last 5 games');
    expect(board.text).not.toContain('anytime_td 0.5 (Over +120) —');
  });

  it('defaults stay byte-identical for the MLB board (no hooks passed)', () => {
    const board = buildPropBoardV2([
      { player: 'Aaron Judge', team: 'New York Yankees', prop_type: 'total_bases', line: 1.5, over_odds: -115, under_odds: -105 },
    ]);
    expect(board.text).toContain(`THE PROP BOARD (tonight's live prop prices)`);
  });
});

// ═══ ONE LIST: everything the board can publish, the grader can settle ══════
describe('football generation/grading alignment (the substring-class tripwire)', () => {
  it('every publishable NFL prop type canonicalizes to a grader type', () => {
    for (const propType of VALID_NFL_PROP_TYPES) {
      expect(canonicalNFLPropType(propType), `NFL type "${propType}" has no canonical grader mapping`).not.toBeNull();
    }
  });

  it('every published NCAAF prop type carries BDL stat evidence on a full row', () => {
    const fullRow = {
      passing_yards: 210, passing_touchdowns: 2, passing_attempts: 30, passing_completions: 21,
      passing_interceptions: 1, rushing_yards: 45, rushing_attempts: 9, rushing_touchdowns: 1,
      receiving_yards: 60, receptions: 5, receiving_touchdowns: 0,
    };
    for (const propType of Object.values(MARKET_TYPE_MAP)) {
      expect(hasNcaafPropStatEvidence(fullRow, propType), `NCAAF type "${propType}" has no BDL stat evidence path`).toBe(true);
    }
  });
});

// ═══ NFL weekly ledger keys (the game-call fetch) ═══════════════════════════
describe('NFL week keys for the game-call fetch', () => {
  it('Tue–Mon ET publication weeks anchor on Tuesday', () => {
    // Thu Aug 20 2026 8:00 PM ET kickoff (stored as Aug 21 UTC).
    expect(nflWeekStartForInstant('2026-08-21T00:00:00.000Z')).toBe('2026-08-18');
    // Monday night (Sep 14 2026, ET) belongs to the week that started Tue Sep 8.
    expect(nflWeekStartForInstant('2026-09-15T00:15:00.000Z')).toBe('2026-09-08');
    // A Tuesday is its own week start.
    expect(nflWeekStartForInstant('2026-09-08T17:00:00.000Z')).toBe('2026-09-08');
  });

  it('January belongs to the season that began the prior August', () => {
    expect(nflSeasonForInstant('2026-08-21T00:00:00.000Z')).toBe(2026);
    expect(nflSeasonForInstant('2027-01-10T18:00:00.000Z')).toBe(2026);
  });
});
