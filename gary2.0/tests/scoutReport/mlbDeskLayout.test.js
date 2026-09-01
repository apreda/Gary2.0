import { describe, it, expect } from 'vitest';
import { renderBucketsDesk, resolveDeskLayout, TEAM_SUBSECTIONS } from '../../src/services/agentic/scoutReport/sports/mlbDeskLayout.js';
import { auditDeskManifest } from '../../src/services/agentic/scoutReport/sports/mlbDeskManifest.js';

const team = (name, over = {}) => ({
  name,
  stand: `${name}: division rank 1 · streak W3`,
  seasonStats: `${name}: .260 AVG / .760 OPS / 4.8 R/G`,
  lineup: `${name}:\n  1. Leadoff Guy (CF) [Bats: L]\n  SP: Ace Arm (Throws: R)`,
  bench: `${name}: Bench Bat (1B, bats R) .250/.700, 5 HR (120 AB)`,
  starter: `${name}: Ace Arm — 10-5, 3.10 ERA, 1.10 WHIP, 150 K, 160.0 IP (26 2026 starts)`,
  starterFlags: null,
  pitchTypes: `Ace Arm: FF 55% usage, 25% whiff, .300 xwOBA`,
  pen: `${name}: Closer Man — 30 SV, 2.10 ERA`,
  penWorkload: `${name}: Closer Man pitched yesterday (18 pitches)`,
  penPress: `${name}:\nThe closer has been described as fresh.`,
  catcher: `${name}: Backstop (C) — 30% CS (12-for-40), 4 PB; bats .240/.690 (300 AB)`,
  defense: `${name}: .985 FP, 60 E, 110 DP turned; OF assists 22`,
  injuries: `${name}:\n  [FRESH — 1 team game missed] Star Bat (LF) — Hamstring`,
  flags: `FRESH ABSENCE: Star Bat (${name}) — placed on the injured list 2026-08-31. First game(s) without him.`,
  spot: `${name}:\n  Won their last 2.\n  Last 7: 5-2`,
  recentForm: `${name}:\n  [L1] 2026-08-31: W 5-3 vs Opp\n  [Last 5] 4-1`,
  runShape: `${name}, last 10: scored 5.1/gm, allowed 3.9/gm`,
  recentResults: `${name} (Last 10):\n  2026-08-31: Opp 3 @ ${name} 5`,
  lastNight: `${name}, 2026-08-31 vs Opp (W 5-3) — Headline\nStory body.`,
  boxScores: `BOX SCORE — 2026-08-31 Opp 3 @ ${name} 5\n  lines`,
  rosterMoves: `${name}:\n  2026-08-30: Recalled Some Guy from AAA.`,
  ...over,
});

const pieces = () => ({
  header: 'MATCHUP: San Francisco Giants @ Atlanta Braves\nVenue: Truist Park\nStart: Sep 1, 2026, 7:15 PM ET',
  home: team('Atlanta Braves'),
  away: team('San Francisco Giants'),
  matchup: {
    seriesState: 'Series opener vs San Francisco Giants — first meeting of this series.',
    seasonSeries: 'San Francisco Giants lead the season series 5-1 (6 meetings).\n  Jun 16–Jun 17 at Atlanta Braves — San Francisco Giants won 2-0',
    divisionGame: null,
    seriesStories: null,
    sharedLastNight: null,
    sharedBoxScores: null,
    park: 'Truist Park: open-air, 400 to center, plays close to neutral for runs and homers in the summer months.',
    weather: 'Weather: Clear, 84°F, Wind: 6 mph, Out To CF',
    scheduleShape: 'Atlanta Braves: Game 1 of a 6-game homestand.\nSan Francisco Giants: Game 2 of a 7-game road trip.',
    lookahead: 'Atlanta Braves: same series continues tomorrow.',
    rest: 'Atlanta Braves: 0 days rest (played yesterday).\nSan Francisco Giants: 0 days rest (played yesterday).',
    news: 'No same-day breaking news.',
    storylines: 'The Giants arrive off a doubleheader split.',
  },
  market: { odds: 'Moneyline: Atlanta Braves -150 / San Francisco Giants +130' },
});

describe('renderBucketsDesk', () => {
  it('orders the three buckets TEAMS → MATCHUP → MARKET, home team first, no SITUATION bucket', () => {
    const text = renderBucketsDesk(pieces());
    const at = (s) => { const i = text.indexOf(s); expect(i, `missing "${s}"`).toBeGreaterThan(-1); return i; };
    expect(at('THE TEAMS')).toBeLessThan(at('THE MATCHUP'));
    expect(at('THE MATCHUP')).toBeLessThan(at('THE MARKET'));
    expect(text).not.toContain('THE SITUATION');
    // Inside THE MATCHUP: series → park (with weather) → schedule and rest → news.
    expect(at('── Series state ──')).toBeLessThan(at('── The park ──'));
    expect(at('── The park ──')).toBeLessThan(at('Weather: Clear, 84°F'));
    expect(at('Weather: Clear, 84°F')).toBeLessThan(at('── Schedule and rest ──'));
    expect(at('── Schedule and rest ──')).toBeLessThan(at("── Today's news ──"));
    expect(at("── Today's news ──")).toBeLessThan(at('THE MARKET'));
    expect(at('═══ ATLANTA BRAVES ═══')).toBeLessThan(at('═══ SAN FRANCISCO GIANTS ═══'));
    expect(at('═══ SAN FRANCISCO GIANTS ═══')).toBeLessThan(at('THE MATCHUP'));
  });

  it('keeps every team subsection inside its own team block, in the agreed order', () => {
    const text = renderBucketsDesk(pieces());
    const homeStart = text.indexOf('═══ ATLANTA BRAVES ═══');
    const awayStart = text.indexOf('═══ SAN FRANCISCO GIANTS ═══');
    const matchupStart = text.indexOf('THE MATCHUP');
    const homeBlock = text.slice(homeStart, awayStart);
    const awayBlock = text.slice(awayStart, matchupStart);
    let last = -1;
    for (const label of TEAM_SUBSECTIONS) {
      const marker = `── ${label} ──`;
      const i = homeBlock.indexOf(marker);
      expect(i, `home block missing ${marker}`).toBeGreaterThan(last);
      last = i;
      expect(awayBlock.indexOf(marker), `away block missing ${marker}`).toBeGreaterThan(-1);
    }
    // The Giants' pen line lives under the Giants, never under the Braves.
    expect(homeBlock).not.toContain('San Francisco Giants: Closer Man');
    expect(awayBlock).toContain('San Francisco Giants: Closer Man');
  });

  it('puts the market last and the price nowhere else', () => {
    const text = renderBucketsDesk(pieces());
    const marketIdx = text.indexOf('THE MARKET');
    expect(text.indexOf('Moneyline:')).toBeGreaterThan(marketIdx);
    expect(text.slice(0, marketIdx)).not.toContain('Moneyline:');
  });

  it('prints an honest absence line for required pieces and omits optional ones', () => {
    const p = pieces();
    p.home.seasonStats = null;      // required → absence line
    p.home.penPress = null;         // optional → subsection body omits it
    p.home.lastNight = null;
    p.home.boxScores = null;
    p.matchup.park = null;          // required → absence line
    p.matchup.weather = null;       // pending, not absent — its own wording
    const text = renderBucketsDesk(p);
    expect(text).toContain('Atlanta Braves: team season stats unavailable this run');
    expect(text).toContain('park profile unavailable this run');
    expect(text).toContain('Weather: not yet posted in the game feed for this build.');
    const homeBlock = text.slice(text.indexOf('═══ ATLANTA BRAVES ═══'), text.indexOf('═══ SAN FRANCISCO GIANTS ═══'));
    expect(homeBlock).not.toContain('As reported:');
    expect(homeBlock).not.toContain('As written:');
  });

  it('routes a shared last-night game and its box score to THE MATCHUP, not to either team', () => {
    const p = pieces();
    p.home.lastNight = null; p.away.lastNight = null;
    p.home.boxScores = null; p.away.boxScores = null;
    p.matchup.sharedLastNight = 'These two, 2026-08-31 — Giants win the opener\nStory body.';
    p.matchup.sharedBoxScores = 'BOX SCORE — 2026-08-31 SF 7 @ ATL 3';
    const text = renderBucketsDesk(p);
    const matchupStart = text.indexOf('THE MATCHUP');
    expect(text.indexOf('These two, 2026-08-31')).toBeGreaterThan(matchupStart);
    expect(text.indexOf('BOX SCORE — 2026-08-31 SF 7')).toBeGreaterThan(matchupStart);
  });

  it('never emits an ellipsis', () => {
    const text = renderBucketsDesk(pieces());
    expect(text).not.toContain('...');
    expect(text).not.toContain('…');
  });

  it('is graded present by the manifest in buckets mode', () => {
    const audit = auditDeskManifest(renderBucketsDesk(pieces()), 'buckets');
    expect(audit.missing).toEqual([]);
    expect(audit.empty).toEqual([]);
    // 10 team subsections (graded once each, both clubs) + 4 matchup + 1 market.
    expect(audit.present.length).toBe(15);
  });

  it('is flagged by the manifest when a per-team subsection appears for only one club', () => {
    const p = pieces();
    p.away.lineup = null;
    const text = renderBucketsDesk(p);
    const audit = auditDeskManifest(text, 'buckets');
    expect(audit.honestAbsent).toContain("Tonight's lineup");
  });
});

describe('resolveDeskLayout', () => {
  it('defaults to legacy, honors the option, then the env var', () => {
    const saved = process.env.GARY_MLB_DESK_LAYOUT;
    delete process.env.GARY_MLB_DESK_LAYOUT;
    expect(resolveDeskLayout({})).toBe('legacy');
    expect(resolveDeskLayout({ deskLayout: 'buckets' })).toBe('buckets');
    process.env.GARY_MLB_DESK_LAYOUT = 'buckets';
    expect(resolveDeskLayout({})).toBe('buckets');
    expect(resolveDeskLayout({ deskLayout: 'legacy' })).toBe('legacy');
    process.env.GARY_MLB_DESK_LAYOUT = 'nonsense';
    expect(resolveDeskLayout({})).toBe('legacy');
    if (saved === undefined) delete process.env.GARY_MLB_DESK_LAYOUT; else process.env.GARY_MLB_DESK_LAYOUT = saved;
  });
});
