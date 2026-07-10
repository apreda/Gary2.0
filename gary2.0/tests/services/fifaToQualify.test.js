// Jul 10 2026 — Picks-page scout odds fix (founder): the WC scout header should
// show TO-ADVANCE (qualify) odds — a different market from Gary's pick, so the
// two never need to match — with the 3-way ML (draw included) as data for the
// fallback. The feed carries "To Qualify" / "To Qualify for the Next Round"
// markets on preferred vendors (verified live Jul 10; two outcomes, side
// home/away, american_odds; knockout matches only — the final has none).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { extractToQualify, PREFERRED_VENDORS } from '../../src/services/fifaWorldCupService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(__dirname, '../../', rel), 'utf8');

const qualifyMarket = (homeOdds, awayOdds, name = 'To Qualify') => ({
  name,
  outcomes: [
    { name: 'Spain', type: 'home', side: 'home', american_odds: homeOdds },
    { name: 'Belgium', type: 'away', side: 'away', american_odds: awayOdds },
  ],
});

describe('extractToQualify: to-advance odds from the raw vendor markets', () => {
  it('finds the To Qualify market on the preferred vendor and maps sides', () => {
    const rows = [
      { vendor: 'fanduel', markets: [qualifyMarket(-450, 320)] },
      { vendor: 'draftkings', markets: [qualifyMarket(-500, 350)] },
    ];
    const q = extractToQualify(rows);
    expect(q).toEqual({ home: -500, away: 350, vendor: 'draftkings' }); // DK outranks FD
  });

  it('matches "To Qualify for the Next Round" too, and falls through vendors missing the market', () => {
    const rows = [
      { vendor: 'draftkings', markets: [{ name: 'Both Teams to Score', outcomes: [] }] },
      { vendor: 'fanduel', markets: [qualifyMarket(-8000, 4800, 'To Qualify for the Next Round')] },
    ];
    const q = extractToQualify(rows);
    // Qualify prices legitimately run huge (Canada -8000 seen live) — no junk strip here.
    expect(q).toEqual({ home: -8000, away: 4800, vendor: 'fanduel' });
  });

  it('returns null when no vendor offers the market (the final), on empty input, and on half-priced markets', () => {
    expect(extractToQualify([])).toBeNull();
    expect(extractToQualify(null)).toBeNull();
    expect(extractToQualify([{ vendor: 'draftkings', markets: [] }])).toBeNull();
    // One side missing its price → not renderable as a pair → null.
    const halfPriced = [{ vendor: 'draftkings', markets: [{ name: 'To Qualify', outcomes: [{ side: 'home', american_odds: -300 }] }] }];
    expect(extractToQualify(halfPriced)).toBeNull();
  });

  it('ignores non-preferred vendors entirely', () => {
    const rows = [{ vendor: 'thinbook', markets: [qualifyMarket(-200, 170)] }];
    expect(extractToQualify(rows)).toBeNull();
    expect(PREFERRED_VENDORS).not.toContain('thinbook');
  });
});

describe('tomorrow board wiring: WC lookahead lines carry draw + advance odds', () => {
  const tomorrow = src('src/services/tomorrowService.js');

  it('buildWcLookahead ships ml_draw and advance_home/advance_away in lines{}', () => {
    expect(tomorrow).toContain('ml_draw');
    expect(tomorrow).toContain('advance_home');
    expect(tomorrow).toContain('advance_away');
    expect(tomorrow).toContain('extractToQualify');
  });

  it('daily_slate row shape is untouched — the table upsert must not gain unknown columns', () => {
    const slate = src('src/services/dailySlateService.js');
    expect(slate).not.toContain('ml_draw');
    expect(slate).not.toContain('advance_home');
  });
});
