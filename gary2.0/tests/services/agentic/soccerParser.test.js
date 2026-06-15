import { describe, it, expect } from 'vitest';
import { normalizePickFormat } from '../../../src/services/agentic/orchestrator/responseParser.js';

// Gary's Take must be >= 1000 chars (parser rejects shorter as "tooShort").
const RATIONALE = (
  'Mexico have been the sharper side in the final third, generating strong expected-goals output across recent matches and converting at a rate that holds up against the underlying chance quality. ' +
  'Playing at altitude at the Estadio Azteca with full home support is a real environmental factor that the investigation surfaced, and South Africa have shown difficulty creating clear-cut chances when forced to travel and press at elevation. ' +
  'The defensive numbers point the same way: Mexico have limited shots on target and big chances conceded, while South Africa have leaked opportunities from open play and set pieces in their recent sample. ' +
  'Set-piece threat favors the home side given their height and delivery, and the midfield control metrics — possession share and pass completion in the final third — tilt toward Mexico as well. ' +
  'Availability matters here: both squads appear close to full strength based on the latest reporting, with no confirmed absences among the key creators, which keeps the projected lineups intact. ' +
  'Taken together, the matchup evidence investigated across both squads — attack, defense, conditions, set pieces, and availability — supports the position the model has landed on, with the price offering value relative to the implied probability.'
);

// normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds)
describe('soccer pick parsing (3-way + odds-cap bypass)', () => {
  it('accepts Draw as a valid 3-way selection (type=draw)', () => {
    const out = normalizePickFormat({ pick: 'Draw', odds: 250, rationale: RATIONALE }, 'Mexico', 'South Africa', 'soccer_world_cup', {});
    expect(out).not.toBeNull();
    expect(out.type).toBe('draw');
  });

  it('does NOT force a heavy favorite ML to spread (no -200 cap for soccer)', () => {
    const out = normalizePickFormat(
      { pick: 'Mexico ML', odds: -1250, type: 'moneyline', rationale: RATIONALE },
      'Mexico', 'South Africa', 'soccer_world_cup',
      { moneyline_home: -1250, spread_home: -1.5 }
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('moneyline'); // not coerced to 'spread' by the -200 ceiling
    expect(out.pick).toMatch(/Mexico/i);
    expect(out.pick).not.toMatch(/-1\.5/); // was NOT forced onto the spread line
  });

  it('sanity: the bypass is soccer-only — NBA still caps a -1250 favorite to spread', () => {
    const out = normalizePickFormat(
      { pick: 'Lakers ML', odds: -1250, type: 'moneyline', rationale: RATIONALE },
      'Lakers', 'Suns', 'basketball_nba',
      { moneyline_home: -1250, spread_home: -8.5 }
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('spread');
  });
});

// Totals and Asian handicaps are offered to Gary (consensus odds carry both),
// so the parser must accept them and extract the line grading reads.
describe('soccer totals + Asian handicap parsing', () => {
  it('accepts an Over total without a team name (no "wrong game" rejection) and extracts goal_line', () => {
    const out = normalizePickFormat(
      { pick: 'Over 2.5', odds: 105, type: 'total', rationale: RATIONALE },
      'Mexico', 'South Africa', 'soccer_world_cup', {}
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('total');
    expect(out.goal_line).toBe(2.5);
  });

  it('detects an Under total from pick text alone (no explicit type)', () => {
    const out = normalizePickFormat(
      { pick: 'Under 2.5', odds: -145, rationale: RATIONALE },
      'Mexico', 'South Africa', 'soccer_world_cup', {}
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('total');
    expect(out.goal_line).toBe(2.5);
  });

  it('detects an Asian handicap from pick text and extracts the handicap', () => {
    const out = normalizePickFormat(
      { pick: 'Mexico -1.5', odds: 125, rationale: RATIONALE },
      'Mexico', 'South Africa', 'soccer_world_cup', {}
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('asian_handicap');
    expect(out.handicap).toBe(-1.5);
  });

  it('does NOT mistake American odds for a handicap ("Mexico -230" stays moneyline)', () => {
    const out = normalizePickFormat(
      { pick: 'Mexico ML -230', odds: -230, rationale: RATIONALE },
      'Mexico', 'South Africa', 'soccer_world_cup', {}
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('moneyline');
    expect(out.handicap ?? null).toBeNull();
  });
});

// Regression: the WC two-pick formatter shipped malformed strings to the app card
// AND the X auto-poster — odds doubled ("Under 3.5 @ 105 +105"), unsigned handicap
// jammed next to the team with a dangling "@" ("Cabo Verde 3.3 @ -160"), and the
// stored `type`/`odds` disagreeing with the displayed string. The fix rebuilds a
// clean, self-contained pick string from the resolved market data.
describe('soccer pick string is rebuilt clean from market data', () => {
  it('total: no "@", no doubled odds — single signed price ("Under 3.5 +105")', () => {
    const out = normalizePickFormat(
      { pick: 'Under 3.5 @ 105', rationale: RATIONALE },
      'Spain', 'Cabo Verde', 'soccer_world_cup',
      { soccer_total: { line: 3.5, over: -130, under: 105 } }
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('total');
    expect(out.goal_line).toBe(3.5);
    expect(out.odds).toBe(105);
    expect(out.pick).toBe('Under 3.5 +105');
    expect(out.pick).not.toContain('@');
    expect(out.pick).not.toMatch(/105\s*\+?105/); // odds not doubled
  });

  it('asian handicap: unsigned prose handicap becomes a clean signed line from the market ("Cabo Verde +3.3 -160")', () => {
    const out = normalizePickFormat(
      { pick: 'Cabo Verde 3.3 @ -160', rationale: RATIONALE },
      'Spain', 'Cabo Verde', 'soccer_world_cup',
      { soccer_spread: { homeValue: -3.3, homeOdds: 120, awayValue: 3.3, awayOdds: -160 } }
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('asian_handicap');
    expect(out.handicap).toBe(3.3);
    expect(out.odds).toBe(-160);
    expect(out.pick).toBe('Cabo Verde +3.3 -160');
    expect(out.pick).not.toContain('@');
  });

  it('moneyline still renders clean ("Iran ML -120")', () => {
    const out = normalizePickFormat(
      { pick: 'Iran ML -120', rationale: RATIONALE },
      'Iran', 'New Zealand', 'soccer_world_cup',
      { soccer_three_way_ml: { home: -120, draw: 240, away: 320 } }
    );
    expect(out).not.toBeNull();
    expect(out.type).toBe('moneyline');
    expect(out.odds).toBe(-120);
    expect(out.pick).toBe('Iran ML -120');
  });
});

// The "append odds" step only recognized SIGNED odds, so an unsigned plus-money
// price already in the text (Gary drops the +) got a second copy appended.
describe('unsigned trailing odds are normalized, not duplicated (all sports)', () => {
  it('MLB: "Yankees ML 150" → "Yankees ML +150" (no "150 +150")', () => {
    const out = normalizePickFormat(
      { pick: 'Yankees ML 150', rationale: RATIONALE },
      'Yankees', 'Red Sox', 'baseball_mlb', {}
    );
    expect(out).not.toBeNull();
    expect(out.pick).toBe('Yankees ML +150');
    expect(out.pick).not.toMatch(/150\s*\+?150/);
  });
});
