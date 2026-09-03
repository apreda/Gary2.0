import { describe, expect, it } from 'vitest';
import { parseGaryResponse } from '../../../src/services/agentic/orchestrator/responseParser.js';

const rationale = `${'Verified matchup evidence supports this side at the posted market price. '.repeat(18)}Final sentence.`;

function response(overrides = {}) {
  return JSON.stringify({
    pick: 'Buffalo Bills +0.0 -999',
    type: 'spread',
    odds: -999,
    spread: 0,
    spreadOdds: -999,
    confidence: 0.61,
    rationale,
    ...overrides,
  });
}

describe('game-pick market truth', () => {
  it('replaces a model-authored spread and price with the picked side verified market', () => {
    const parsed = parseGaryResponse(
      response(),
      'Buffalo Bills',
      'Carolina Panthers',
      'americanfootball_nfl',
      {
        spread_home: -3.5,
        spread_away: 3.5,
        spread_home_odds: -108,
        spread_away_odds: -112,
        moneyline_home: -166,
        moneyline_away: 140,
      },
    );

    expect(parsed).toMatchObject({
      pick: 'Buffalo Bills -3.5 -108',
      type: 'spread',
      spread: -3.5,
      spreadOdds: -108,
      odds: -108,
    });
  });

  it('rejects a spread when the selected side has no verified price', () => {
    const parsed = parseGaryResponse(
      response(),
      'Buffalo Bills',
      'Carolina Panthers',
      'americanfootball_nfl',
      {
        spread_home: -3.5,
        spread_away: 3.5,
        spread_home_odds: null,
        spread_away_odds: null,
        moneyline_home: -166,
        moneyline_away: 140,
      },
    );

    expect(parsed).toBeNull();
  });

  it('uses the verified moneyline instead of a model-authored price', () => {
    const parsed = parseGaryResponse(
      response({ pick: 'Carolina Panthers ML -999', type: 'moneyline' }),
      'Buffalo Bills',
      'Carolina Panthers',
      'americanfootball_nfl',
      {
        spread_home: -3.5,
        spread_away: 3.5,
        spread_home_odds: -108,
        spread_away_odds: -112,
        moneyline_home: -166,
        moneyline_away: 140,
      },
    );

    expect(parsed).toMatchObject({
      pick: 'Carolina Panthers ML +140',
      type: 'moneyline',
      odds: 140,
    });
  });

  it('rejects an ambiguous shared-mascot pick instead of defaulting to away', () => {
    const parsed = parseGaryResponse(
      response({ pick: 'Bulldogs +3.5 -999', type: 'spread' }),
      'Georgia Bulldogs',
      'Mississippi State Bulldogs',
      'americanfootball_ncaaf',
      {
        spread_home: -3.5,
        spread_away: 3.5,
        spread_home_odds: -108,
        spread_away_odds: -112,
      },
    );

    expect(parsed).toBeNull();
  });

  it('preserves an explicit away line instead of deriving it from home', () => {
    const parsed = parseGaryResponse(
      response({ pick: 'Carolina Panthers +0.0 -999', type: 'spread' }),
      'Buffalo Bills',
      'Carolina Panthers',
      'americanfootball_nfl',
      {
        spread_home: -3.5,
        spread_away: 4,
        spread_home_odds: -108,
        spread_away_odds: -112,
      },
    );

    expect(parsed).toMatchObject({
      pick: 'Carolina Panthers +4 -112',
      spread: 4,
      spreadOdds: -112,
    });
  });

  it('uses an away-only line and rejects a selected side with no line', () => {
    const awayOnly = parseGaryResponse(
      response({ pick: 'Carolina Panthers +0.0 -999', type: 'spread' }),
      'Buffalo Bills',
      'Carolina Panthers',
      'americanfootball_nfl',
      {
        spread_home: null,
        spread_away: 4,
        spread_home_odds: null,
        spread_away_odds: -112,
      },
    );
    expect(awayOnly).toMatchObject({ pick: 'Carolina Panthers +4 -112', spread: 4 });

    const noLine = parseGaryResponse(
      response({ pick: 'Carolina Panthers +0.0 -999', type: 'spread' }),
      'Buffalo Bills',
      'Carolina Panthers',
      'americanfootball_nfl',
      {
        spread_home: null,
        spread_away: null,
        spread_home_odds: null,
        spread_away_odds: -112,
      },
    );
    expect(noLine).toBeNull();
  });
});


// Sep 3 2026 (NBA winning-era smoke): the Codex bridge answered the
// format-only turn with the JSON object alone — no code fence — and the
// bare-JSON fallback only knew the legacy "pick" key, so a perfect
// "final_pick" answer was rejected twelve times in a row.
describe('bare JSON with final_pick (no code fence)', () => {
  it('parses a fenceless final_pick object the way it parses a fenced one', () => {
    const bare = `{
  "final_pick": "Boston Celtics -6.5 -110",
  "rationale": "Gary's Take\\n\\n${rationale}",
  "confidence_score": 0.67
}`;
    const pick = parseGaryResponse(bare, 'Boston Celtics', 'Miami Heat', 'basketball_nba', { spread_home: -6.5, spread_home_odds: -110, spread_away: 6.5, spread_away_odds: -110 });
    expect(pick).toBeTruthy();
    expect(pick.pick).toContain('Boston Celtics');
    expect(pick.odds).toBe(-110);
    expect(pick.confidence).toBeCloseTo(0.67, 2);
  });
});
