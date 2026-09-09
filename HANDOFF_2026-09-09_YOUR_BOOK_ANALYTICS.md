# Your Book analytics — September 9, 2026 (Claude)

Founder GO on the nine-item list from the Pikkit / OddsJam competitive analysis: calendar, period pager, breakdowns, bet types, tags, bankroll windows, friends board, web parity, slip scanner. Skipped by founder decision: sportsbook syncing, CLV/EV/arbitrage, following other users' picks.

Spec: `docs/superpowers/specs/2026-09-09-your-book-analytics-design.md`.

## What shipped

**Database (applied to production via MCP, files in `gary2.0/supabase/migrations/`)**
- `20260909130000_book_analytics.sql`: `user_bets.market` (moneyline | spread | total | prop | parlay | other) derived server-side inside `place_user_bet` and `place_prop`, chosen by the user on outside bets, backfilled from pick text; `user_bets.tags text[]` (≤8, cleaned by the guard, editable on locked verified tickets like notes); `public.user_follows` + `set_follow` / `my_follows`; `your_book_leaderboard_v3` gains `p_scope` (`all` | `friends`) and a `following` flag per row — the five-argument version was dropped so PostgREST sees one function, old clients keep working through the default; `record_slip_scan` (40 per user per Eastern day).
- `20260909130500_book_analytics_guard_fix.sql`: the guard trigger runs as the caller, which has no usage on the private schema, so the tag cleaner lives in `public.book_clean_tags`.
- Verified live as a user inside a transaction: tag cleaning on a verified row, manual insert with market + tags, market edit on a verified row refused, friends lens, five-argument board call, follow of a non-public profile refused, scan counter.

**Edge function `book-slip-scan` (deployed)**: verifies the session, counts the scan as the user, sends the screenshot to Anthropic (`claude-opus-5`, effort low, JSON schema output, server-side refusal fallbacks) and returns normalized wagers. Never writes a bet. Four Deno tests.

**iOS (`ios/GaryApp/`)**
- New `BookAnalytics.swift` (Foundation only): `BookEntry`, `BookDates` (Eastern calendar date — the Book's day rolls at midnight, not the slate's 3 AM), `BookPeriod` (WEEK Sunday–Saturday / MONTH / YEAR / ALL, prev/next, forward stops at today), `BookSummary`, `BookCalendar.month` (six rows of seven), `BookBreakdown` (league, type, book, tags, riding vs fading Gary, Gary's lean tiers), `BookBankroll.rolling` (30/60/90 ending today), `BookTags`, `BookMarket`.
- New `BookAnalyticsViews.swift`: period pager, calendar, day sheet, breakdowns card (columns mirror Gary's BY SPORT grid), bankroll card, tag chips + editor (iOS 16 `Layout`), bet-type picker.
- `UserBookView.swift`: YOU page order is pager → balance → equity curve → calendar → actions → streak → by source → tiles → breakdowns → bankroll → search/export → open slips → daily ledger. The period replaces the 7D/30D/SEASON/ALL menu and the chart's row. Calendar and breakdowns follow the graded lane (verified unless YOURS) — two ledgers, never mixed. Search matches tags and bet type; CSV gains Bet type + Tags. Outside-bet form gains bet type, tags (suggestions from the user's own book) and SCAN A SLIP (PhotosPicker → edge function → prefilled form; nothing saves until Add). Leaderboard gains EVERYONE / FRIENDS; the player sheet gains Follow / Following. Harness verbs (DEBUG): `bookday <date>`, `bookperiod week|month|year|all`, `bookdim league|market|bookmaker|tags|side|confidence`, `bookfilter all|tail|fade|manual`, `boardscope all|friends`.
- `UserBetDetailSheet.swift`: bet type on the receipt, tag editor on every row, bet-type picker on manual rows.
- `ProfileExperience.swift`: `ProfileFollowAPI`, `BoardRow.following`, board scope parameter.
- `project.pbxproj`: the two new files registered.
- Test: `ios/Tests/BookAnalyticsTests.swift` (65 checks; copy to a scratch `main.swift` and compile with `BookAnalytics.swift`).

**Web (`web/`)**
- New `lib/book/analytics.ts` (port of the Swift math, same answers), `components/book/BookCalendar.tsx`, `components/book/BookAnalytics.tsx` (pager, breakdowns, bankroll, tag chips/input, market select).
- `BookClient.tsx`: period pager replaces the timeframe chips; calendar with a day panel; breakdowns; bankroll; the "no history" gate counts settled rows only; the export carries every row in the period. `LogBet.tsx`: bet type, tags, scan a slip. `BookSlips.tsx`: bet type + tags on slips, tags editable with notes. `Leaderboard.tsx`: Everyone / Friends. `PublicProfile.tsx`: Follow.
- Tests: `tests/book-analytics.test.ts` (new), `book-loading-interaction.test.ts` and `public-profile-interaction.test.ts` ported to the period model. Full suite 884/884, typecheck clean, lint clean on the touched files.

## QA account
`qa.book@betwithgary.ai` (id `98e396c8-27f5-428d-8966-e059a87c3bea`), profile `QA_Book`, leaderboard hidden and listed in `user_experience_private.excluded_profiles`, unit value $50, 96 seeded bets (Jul 20 – Sep 9: MLB/NFL/NCAAF tails and fades with markets, leans, tags; outside bets with sportsbooks; three open slips today). Credentials live only in the session scratchpad; rotate with the admin API if needed.

## Founder note
Adam confirmed Apple Sign-in works on the phone (Sep 9). That item is closed.

## Not done / next
- The founder peek: iOS screenshots and the web page, then push (deploys web on Vercel) and the next TestFlight build. Build 920 is still in App Review; this work rides the next upload.
- `node scripts/production-truth.js` must be green before the session ends; the edge function is deployed, migrations applied.
