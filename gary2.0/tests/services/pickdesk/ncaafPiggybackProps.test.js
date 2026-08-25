import { describe, expect, it } from 'vitest';
import {
  NCAAF_PIGGYBACK_BOOKS,
  NCAAF_PIGGYBACK_PROMPT_SHA,
  piggybackOddsBand,
  buildPiggybackMenu,
  renderPiggybackMenu,
  matchSelectionsToMenu,
} from '../../../src/services/pickdesk/ncaafPiggybackProps.js';
import { transformNcaafEventOdds } from '../../../src/services/ncaafPropOddsService.js';

/**
 * THE NCAAF PIGGYBACK (founder GO, Aug 25 2026) — college props ride the game
 * pick. These tests pin the lane's three contracts:
 *   1. The menu is popular-books-only and price-banded — Gary never sees a
 *      book or a price the founder excluded.
 *   2. A selection survives only as a menu row (identity rail) — an invented
 *      line or off-menu player can never store.
 *   3. At most two ride, highest conviction first.
 */

const BAND = { min: -250, max: 250 };

const row = (over = {}) => ({
  player: 'Jayden Maiava',
  player_id: 555,
  team: 'USC Trojans',
  prop_type: 'passing_yards',
  line: 290.5,
  over_odds: -110,
  under_odds: -118,
  market_type: 'over_under',
  ...over,
});

describe('the piggyback menu', () => {
  it('keeps both sides of a standard market inside the band', () => {
    const options = buildPiggybackMenu([row()], BAND);
    expect(options.map((o) => o.bet)).toEqual(['over', 'under']);
    expect(options[0]).toMatchObject({ player: 'Jayden Maiava', odds: -110, line: 290.5 });
  });

  it('drops chalk heavier than the production window and longshots above the cap', () => {
    const options = buildPiggybackMenu([
      row({ prop_type: 'anytime_td', line: 0.5, over_odds: -500, under_odds: null, market_type: 'yes_no' }),
      row({ player: 'Jabari Bates', prop_type: 'anytime_td', line: 0.5, over_odds: 290, under_odds: null, market_type: 'yes_no' }),
      row({ player: 'Tanook Hines', prop_type: 'anytime_td', line: 0.5, over_odds: 210, under_odds: null, market_type: 'yes_no' }),
    ], BAND);
    // -500 fails the band, +290 exceeds the founder's cap; +210 stays.
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ player: 'Tanook Hines', bet: 'over', odds: 210 });
  });

  it('a yes_no market never grows an under side', () => {
    const options = buildPiggybackMenu([
      row({ prop_type: 'anytime_td', line: 0.5, over_odds: -140, under_odds: 110, market_type: 'yes_no' }),
    ], BAND);
    expect(options).toHaveLength(1);
    expect(options[0].bet).toBe('over');
  });

  it('rows without a player or line never reach the menu', () => {
    const options = buildPiggybackMenu([
      row({ player: '' }),
      row({ line: null }),
    ], BAND);
    expect(options).toEqual([]);
  });

  it('renders every option with its exact copyable identity', () => {
    const text = renderPiggybackMenu(buildPiggybackMenu([row()], BAND));
    expect(text).toContain('Jayden Maiava (USC Trojans) — passing_yards OVER 290.5 @ -110');
    expect(text).toContain('passing_yards UNDER 290.5 @ -118');
  });
});

describe('the identity rail', () => {
  const options = buildPiggybackMenu([
    row(),
    row({ player: 'King Miller', prop_type: 'rushing_yards', line: 74.5, over_odds: -112, under_odds: -115 }),
    row({ player: 'Tanook Hines', prop_type: 'receiving_yards', line: 79.5, over_odds: -114, under_odds: -114 }),
  ], BAND);

  it('accepts only exact menu rows and drops invented lines', () => {
    const matched = matchSelectionsToMenu([
      { player: 'Jayden Maiava', prop_type: 'passing_yards', line: 290.5, bet: 'over', confidence_score: 0.7, rationale: 'a' },
      // Invented line — one yard off the menu.
      { player: 'King Miller', prop_type: 'rushing_yards', line: 75.5, bet: 'over', confidence_score: 0.9, rationale: 'b' },
      // Player not on the menu at all.
      { player: 'Made Up Guy', prop_type: 'receiving_yards', line: 79.5, bet: 'over', confidence_score: 0.9, rationale: 'c' },
    ], options);
    expect(matched).toHaveLength(1);
    expect(matched[0].option.player).toBe('Jayden Maiava');
  });

  it('caps at two, highest conviction first, and dedupes a player+prop pair', () => {
    const matched = matchSelectionsToMenu([
      { player: 'Jayden Maiava', prop_type: 'passing_yards', line: 290.5, bet: 'over', confidence_score: 0.61, rationale: 'a' },
      { player: 'Jayden Maiava', prop_type: 'passing_yards', line: 290.5, bet: 'under', confidence_score: 0.99, rationale: 'dupe' },
      { player: 'King Miller', prop_type: 'rushing_yards', line: 74.5, bet: 'over', confidence_score: 0.8, rationale: 'b' },
      { player: 'Tanook Hines', prop_type: 'receiving_yards', line: 79.5, bet: 'under', confidence_score: 0.75, rationale: 'c' },
    ], options);
    expect(matched).toHaveLength(2);
    // The duplicate player+prop keeps its FIRST accepted side; the two
    // survivors rank by conviction.
    expect(matched.map((m) => m.option.player)).toEqual(['King Miller', 'Tanook Hines']);
  });
});

describe('the popular-books whitelist', () => {
  const payload = {
    id: 'evt1',
    sport_key: 'americanfootball_ncaaf',
    bookmakers: [
      {
        key: 'betonlineag',
        markets: [{ key: 'player_pass_yds', outcomes: [
          { name: 'Over', description: 'Jayden Maiava', price: -105, point: 290.5 },
        ] }],
      },
      {
        key: 'fanduel',
        markets: [{ key: 'player_pass_yds', outcomes: [
          { name: 'Over', description: 'Jayden Maiava', price: -114, point: 290.5 },
        ] }],
      },
    ],
  };

  it('an off-whitelist book never prices a menu row', () => {
    const rows = transformNcaafEventOdds(payload, { bdlGameId: '457612', allowedBookmakers: [...NCAAF_PIGGYBACK_BOOKS] });
    expect(rows).toHaveLength(1);
    // Without the whitelist, best-price would take betonlineag's -105.
    expect(rows[0].over_odds).toBe(-114);
    expect(rows[0].over_vendor).toBe('fanduel');
  });

  it('no whitelist keeps the historic every-book behavior', () => {
    const rows = transformNcaafEventOdds(payload, { bdlGameId: '457612' });
    expect(rows[0].over_odds).toBe(-105);
  });

  it('the whitelist is the founder-approved mainstream set', () => {
    expect(NCAAF_PIGGYBACK_BOOKS).toContain('fanduel');
    expect(NCAAF_PIGGYBACK_BOOKS).toContain('draftkings');
    expect(NCAAF_PIGGYBACK_BOOKS).not.toContain('betonlineag');
  });
});

describe('configuration', () => {
  it('band defaults to the founder cap and honors env overrides', () => {
    expect(piggybackOddsBand({})).toEqual({ min: -250, max: 250 });
    expect(piggybackOddsBand({ GARY_NCAAF_PIGGYBACK_MIN_ODDS: '-180', GARY_NCAAF_PIGGYBACK_MAX_ODDS: '150' }))
      .toEqual({ min: -180, max: 150 });
  });

  it('the prompt era hash is pinned to the contract wording', () => {
    expect(NCAAF_PIGGYBACK_PROMPT_SHA).toMatch(/^[0-9a-f]{12}$/);
  });
});
