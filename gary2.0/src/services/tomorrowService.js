/**
 * Tomorrow Board Service
 *
 * Pre-assembles the iOS "TOMORROW" tab into ONE snapshot row of the
 * `tomorrow_board` Supabase table (one read for the app). Everything is
 * computed server-side from the SAME real fetchers the rest of the pipeline
 * already pays for, pointed at TOMORROW's ET game day — it adds NO new data
 * sources.
 *
 * WHY a dedicated snapshot (not daily_slate): daily_slate only ever carries
 * TODAY (the scheduler writes it with the 5am plan day = today), so the
 * Tomorrow tab cannot read it. And the board's derived lanes — ranked big
 * games, by-sport probable starters, best-effort key returns, and the
 * earliest-game countdown — don't fit daily_slate's flat per-game shape. A
 * single jsonb snapshot keyed on (date) keeps ranking logic out of Swift.
 *
 * Lanes are GROUNDED only — "—"/empty when source facts are genuinely
 * unposted, never fabricated. Data and generated commentary enrichments are
 * best-effort; unavailable commentary never blocks fresh factual board data:
 *   1. SLATE + LINES — reuses dailySlateService.buildLeagueRows for every slate
 *      sport at tomorrow's ET date, so the Tomorrow board never drifts from the
 *      Today slate. Lines null => board renders "—". any_lines=false when ZERO
 *      games have any posted line ("lines open soon" hero).
 *   2. PROBABLE STARTERS — MLB probable pitchers ONLY (getMlbSchedule, both
 *      sides, all games) joined to Savant season ERA by name, each tagged
 *      with its game ("HOU @ DET"), opponent abbr, and home flag. Shape:
 *      {name, team, abbr, era, game, opponent, home, detail}. Plus a
 *      top-level grounded league_avg_era (PA-weighted mean of
 *      the same Savant pitcher corpus) so the iOS can color each pitcher's
 *      ERA relative to league (below = good). era null when Savant
 *      has no row (never fabricated).
 *   3. KEY RETURNS — best-effort IL->active roster-status lane; honest-empty
 *      when nothing qualifies (no dedicated return-date feed exists).
 *   3b. EXTRA TABBED LANES (the iOS Starters/Returns section is now a tab strip —
 *      Starters · Key Returns · +3 more). Three additional GROUNDED day-before
 *      lanes, each a clearly-named array on the snapshot:
 *        • FORM        — per MLB team L10 (W-L) + current streak (standings
 *                        records.splitRecords lastTen + streak.streakCode).
 *        • RUN PROFILE — per MLB team season runs scored / allowed / differential
 *                        + per-game rates (standings). The grounded stand-in for
 *                        an "over/under trend": game_results stores no betting
 *                        total to compute a real O/U record from, so we never
 *                        fabricate one — we surface the team's actual scoring /
 *                        run-prevention shape instead.
 *        • WEATHER     — first-pitch forecast for OUTDOOR MLB games via Open-Meteo
 *                        (key-less, day-before-available); domed/closed parks
 *                        skipped, omitted when no coords / forecast resolve.
 *                        temp_f / wind_mph / precip_pct + note.
 *   4. BIG GAMES — up to five qualified marquee games, ranked by college
 *      rankings, NFL national windows and MLB standings/rivalry/starters. The
 *      DISPLAYED context is now each game's ACTUAL current divisional standing
 *      as plain text (e.g. "Brewers 1st · Cubs 2nd, NL Central") via the
 *      `standing` field — not a reason chip. MLB items also carry BOTH probable
 *      starters' last names — `awayPitcher` / `homePitcher` (+ a `pitchers:{away,
 *      home}` mirror) — sourced from the SAME schedule read as the starters lane,
 *      "Undecided" per side when a probable is unposted (never blank, never
 *      fabricated). NO Layer-3 betting conclusions.
 *   5. COUNTDOWN — earliest commence_time across ALL of tomorrow's slate +
 *      that game's league (drives the hero term + clock).
 *
 * Write path: service-role REST upsert on (date) — idempotent, safe to re-run;
 * a later (evening) run refreshes overnight-posted lines in place.
 */
// Split by area on Oct 13 2026: each file under tomorrowBoard/ holds one area; this index keeps every export.
export { tomorrowET } from './tomorrowBoard/basics.js';
export { buildSlate, mergeFailedTomorrowLeagues, TomorrowBoardSourceError } from './tomorrowBoard/slate.js';
export { buildRecentTeamMetrics } from './tomorrowBoard/teamForm.js';
export { buildBigGames, toBoardRow, marqueeGameKeys } from './tomorrowBoard/bigGames.js';
export { attachArmsTakes } from './tomorrowBoard/armsTakes.js';
export { writeTomorrowBoard, refreshMarqueeBoard } from './tomorrowBoard/write.js';
import { tomorrowET } from './tomorrowBoard/basics.js';
import { writeTomorrowBoard } from './tomorrowBoard/write.js';

export default { writeTomorrowBoard, tomorrowET };
