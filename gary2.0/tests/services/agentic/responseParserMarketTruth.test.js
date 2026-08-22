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
