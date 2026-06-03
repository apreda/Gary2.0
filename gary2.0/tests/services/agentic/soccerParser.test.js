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
