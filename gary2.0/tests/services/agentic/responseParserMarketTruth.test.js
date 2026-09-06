import { describe, expect, it } from 'vitest';
import { parseGaryResponse } from '../../../src/services/agentic/orchestrator/responseParser.js';
import { assertGamePickPublication } from '../../../src/services/gamePickPublication.js';

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
  it.each(['very confident', '0.73', {}, []])('retries malformed confidence %j through the existing parser failure path', confidence => {
    expect(parseGaryResponse(response({ confidence }), 'Buffalo Bills', 'Carolina Panthers', 'americanfootball_nfl',
      { spread_home: -3.5, spread_away: 3.5, spread_home_odds: -108, spread_away_odds: -112 })).toBeNull();
  });
  it.each([null, 0, 0.738, 1])('keeps stated confidence %j unchanged', confidence => {
    expect(parseGaryResponse(response({ confidence }), 'Buffalo Bills', 'Carolina Panthers', 'americanfootball_nfl',
      { spread_home: -3.5, spread_away: 3.5, spread_home_odds: -108, spread_away_odds: -112 })?.confidence).toBe(confidence);
  });
  it('does not replace an explicit zero/null with the alias and preserves an alias-only zero', () => {
    const parse = fields => parseGaryResponse(response(fields), 'Buffalo Bills', 'Carolina Panthers', 'americanfootball_nfl',
      { spread_home: -3.5, spread_away: 3.5, spread_home_odds: -108, spread_away_odds: -112 });
    expect(parse({ confidence: 0, confidence_score: 0.8 })?.confidence).toBe(0);
    expect(parse({ confidence: null, confidence_score: 0.8 })?.confidence).toBeNull();
    expect(parse({ confidence: undefined, confidence_score: 0 })?.confidence).toBe(0);
  });
  it('binds stored matchup metadata to the source game rather than model-authored names', () => {
    const parsed = parseGaryResponse(response({ homeTeam: 'Wrong Home Team', awayTeam: 'Wrong Away Team' }),
      'Buffalo Bills', 'Carolina Panthers', 'americanfootball_nfl',
      { spread_home: -3.5, spread_away: 3.5, spread_home_odds: -108, spread_away_odds: -112 });
    expect(parsed).toMatchObject({ homeTeam: 'Buffalo Bills', awayTeam: 'Carolina Panthers', confidence: 0.61 });
  });
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

describe('optional market metadata publication compatibility', () => {
  const spreadMarket = { spread_home: -3.5, spread_away: 3.5, spread_home_odds: -108, spread_away_odds: -112 };
  const parse = (fields = {}, market = {}) => parseGaryResponse(response(fields),
    'Buffalo Bills', 'Carolina Panthers', 'americanfootball_nfl', { ...spreadMarket, ...market });

  it('normalizes numeric-string optional metadata into a publication-ready decision', () => {
    const parsed = parse({ moneylineHome: ' -166 ', moneylineAway: '+140', total: '44.5' });
    expect(parsed).toMatchObject({ moneylineHome: -166, moneylineAway: 140, total: 44.5,
      pick: 'Buffalo Bills -3.5 -108', spread: -3.5, odds: -108, confidence: 0.61 });
    expect(() => assertGamePickPublication({ ...parsed, game_id: 42, commence_time: '2026-09-06T23:00:00Z' }, 'NFL')).not.toThrow();
  });

  it('normalizes source numeric strings while retaining their precedence over model metadata', () => {
    const parsed = parse({ moneylineHome: -999, moneylineAway: 999, total: 999 },
      { moneyline_home: '-166', moneyline_away: '+140', total: '44.5' });
    expect(parsed).toMatchObject({ moneylineHome: -166, moneylineAway: 140, total: 44.5 });
  });

  it.each(['moneylineHome', 'moneylineAway', 'total'])('retries malformed optional %s during parsing', key => {
    for (const value of ['', ' ', '44.5 points', 'NaN', 'Infinity', {}, [], true]) {
      expect(parse({ [key]: value }), `${key}: ${JSON.stringify(value)}`).toBeNull();
    }
  });

  it('normalizes spread metadata on a moneyline ticket and rejects malformed values', () => {
    const parseMoneyline = fields => parseGaryResponse(response({ pick: 'Boston Red Sox ML -120', type: 'moneyline', ...fields }),
      'Boston Red Sox', 'New York Yankees', 'baseball_mlb', { moneyline_home: -120 });
    expect(parseMoneyline({ spread: '-1.5', spreadOdds: '+140' })).toMatchObject({ spread: -1.5, spreadOdds: 140, odds: -120 });
    expect(parseMoneyline({ spread: '-1.5 runs', spreadOdds: 140 })).toBeNull();
    expect(parseMoneyline({ spread: -1.5, spreadOdds: {} })).toBeNull();
  });

  it('preserves missing and explicit null optional metadata without inventing values', () => {
    for (const fields of [{}, { moneylineHome: null, moneylineAway: null, total: null }]) {
      expect(parse(fields)).toMatchObject({ moneylineHome: null, moneylineAway: null, total: null });
    }
  });

  it('keeps authoritative numeric metadata, including zero, ahead of malformed model fallbacks', () => {
    expect(parse({ moneylineHome: {}, moneylineAway: 'bad', total: [] },
      { moneyline_home: -166, moneyline_away: 140, total: 0 }))
      .toMatchObject({ moneylineHome: -166, moneylineAway: 140, total: 0 });
  });

  it('preserves existing totalOdds passthrough outside the publication metadata contract', () => {
    expect(parse({ totalOdds: 'unavailable' })).toMatchObject({ totalOdds: 'unavailable' });
    expect(parse({ totalOdds: 'unavailable' }, { total_over_odds: '-110' })).toMatchObject({ totalOdds: '-110' });
  });

  it('retries malformed source metadata without replacing it with a model-authored value', () => {
    for (const total of ['unavailable', NaN, Infinity, -Infinity]) {
      expect(parse({ total: 44.5 }, { total })).toBeNull();
    }
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
