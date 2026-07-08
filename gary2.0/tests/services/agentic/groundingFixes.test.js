// Jul 8 2026 grounding review — founder-approved bug fixes ("fix those clear bugs").
//
// The review found the Freshness Protocol core WORKS (same-day IL moves and
// rotation changes came back date-stamped), but four edges were broken:
//
//   (a) SEASON-CONTEXT LIE — every grounding call hardcoded
//       "(NBA/NHL mid-season, NFL playoffs)" from the NBA calendar. False
//       from ~February on; in July it misdirects MLB and World Cup queries.
//       Fix: describeSportsCalendar(date) in dateUtils — a truthful,
//       month-derived line (+ the 2026 World Cup only inside its real
//       Jun 11 – Jul 19 2026 window).
//   (b) UNWRAP-BUG FAMILY — geminiGroundingSearch returns {success, data,
//       raw}, but several stat-router fetchers were written for an older
//       `.content` shape: MLB_BULLPEN's day-of news note was dead code
//       (paid for the search, then discarded), MLB_GAME_PREVIEW leaked the
//       raw object, NBA lineup net-ratings and NCAAB NET always got
//       'Data unavailable'.
//   (c) MLB_GAME_PREVIEW solicited "expert picks, betting projections" —
//       contradicting the ignore-picks rule Flash runs under. Rewritten to
//       the founder's fan-knowledge doctrine: storylines, team news, media
//       narratives — no picks, no projections.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describeSportsCalendar } from '../../../src/utils/dateUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../../src');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

describe('(a) season context is derived from the date, not hardcoded to January', () => {
  it('July 2026: MLB regular season + World Cup knockout window, no NFL playoffs', () => {
    const july = describeSportsCalendar(new Date('2026-07-08T12:00:00'));
    expect(july).toContain('MLB regular season');
    expect(july).toContain('World Cup');
    expect(july).not.toContain('NFL playoffs');
  });

  it('January: NFL playoffs + NBA/NHL mid-season, no World Cup', () => {
    const jan = describeSportsCalendar(new Date('2026-01-15T12:00:00'));
    expect(jan).toContain('NFL playoffs');
    expect(jan).toContain('NBA');
    expect(jan).not.toContain('World Cup');
  });

  it('the World Cup line appears ONLY inside Jun 11 – Jul 19 2026', () => {
    expect(describeSportsCalendar(new Date('2026-06-05T12:00:00'))).not.toContain('World Cup');
    expect(describeSportsCalendar(new Date('2026-06-20T12:00:00'))).toContain('World Cup');
    expect(describeSportsCalendar(new Date('2027-07-08T12:00:00'))).not.toContain('World Cup');
  });

  it('grounding.js uses the helper and drops the hardcoded parenthetical', () => {
    const g = src('services/agentic/scoutReport/shared/grounding.js');
    expect(g).not.toContain('(NBA/NHL mid-season, NFL playoffs)');
    expect(g).toContain('describeSportsCalendar');
  });
});

describe('(b) stat-router fetchers unwrap the {success, data, raw} shape', () => {
  it('MLB_BULLPEN day-of news note reads .data (was dead: .length on an object)', () => {
    const f = src('services/agentic/tools/statRouters/mlbFetchers.js');
    expect(f).toContain('news?.data');
    expect(f).not.toMatch(/if \(news && news\.length > 20\)/);
  });

  it('MLB_GAME_PREVIEW returns text, not the raw result object', () => {
    const f = src('services/agentic/tools/statRouters/mlbFetchers.js');
    expect(f).toContain("result?.data || 'N/A'");
    expect(f).not.toMatch(/homeValue: result \|\| 'N\/A'/);
  });

  it('NBA lineup net-ratings reads .data (was .content → always unavailable)', () => {
    const f = src('services/agentic/tools/statRouters/nbaFetchers.js');
    expect(f).toContain("groundingResult?.data || 'Data unavailable'");
    expect(f).not.toContain("groundingResult?.content || 'Data unavailable'");
  });

  it('NCAAB NET extractor reads .data (was .content + a dead OpenAI shape)', () => {
    const f = src('services/agentic/tools/statRouters/ncaabFetchers.js');
    expect(f).not.toContain('response?.choices?.[0]?.message?.content');
  });
});

describe('(c) MLB_GAME_PREVIEW asks for fan context, never picks', () => {
  it('query solicits storylines/team news/media narratives and forbids picks', () => {
    const f = src('services/agentic/tools/statRouters/mlbFetchers.js');
    expect(f).not.toContain('betting projections, expert picks');
    expect(f).toContain('storylines');
    expect(f).toContain('do NOT include expert picks, betting predictions, or projections');
  });
});
