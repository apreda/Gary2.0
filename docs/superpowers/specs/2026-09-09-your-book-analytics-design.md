# Your Book analytics — calendar, periods, breakdowns, tags, bankroll, friends, slip scan

Date: September 9, 2026. Founder GO on the nine-item list from the Pikkit/OddsJam competitive analysis.
Scope: iOS Billfold YOU tab, the web `/you` page, and the shared `user_bets` schema.
Out of scope, by founder decision: sportsbook syncing, CLV/EV/arbitrage, following other users' picks.

## What exists (verified in code)
- `public.user_bets` rows: tail | fade | manual; columns through Sep 4 include `is_favorite`, `notes`, `bookmaker`, `source_*`, `gary_confidence`, `streak_pick`.
- iOS `UserBookSection` (UserBookView.swift): wallet header, equity curve, 7D/30D/SEASON/ALL menu, ALL/TAILS/FADES/YOURS tabs, streak, BY SOURCE, WIN%/ROI/AVG ODDS/BEST DAY, search + favorites + CSV, OPEN SLIPS with live state, DAILY LEDGER.
- Web `BookClient.tsx` mirrors it with `lib/book/model.ts` pure math and vitest coverage.
- Leaderboard: `your_book_leaderboard_v3(p_window, p_sort, p_league, p_limit, p_offset)` on both surfaces.

## Data changes (one migration, additive, backwards compatible)
1. `user_bets.market text` — `moneyline | spread | total | prop | parlay | other | null`.
   Verified rows: derived server-side inside `place_user_bet` (from the pick JSON `type`, then the pick text) and `user_experience_private.place_prop` (`prop`). Manual rows: client-supplied, validated by the guard. Existing rows are backfilled by the same derivation.
2. `user_bets.tags text[] not null default '{}'` — up to 8 tags, each 1–24 chars, lowercased and trimmed by the guard. Editable on every row, including locked verified tickets (annotation, like notes).
3. `public.user_follows(follower_id, followed_id, created_at)` — owner RLS; `set_follow(p_user, p_follow)` requires the target to be a public, unblocked profile; cap 500 per follower; `my_follows()` lists ids + handles.
4. `your_book_leaderboard_v3` gains `p_scope text default 'all'` (`all | friends`). The five-argument function is dropped and recreated with six so PostgREST sees one function; old clients keep working through the default. Rows carry `following boolean`.
5. `record_slip_scan()` — per-user daily counter for the scanner (40/day), called by the edge function with the user's own JWT.

## iOS
New file `BookAnalytics.swift` (Foundation only, compiled standalone by the test script):
- `BookEntry` — the slice of a bet the analytics need; `UserBet` maps to it.
- `BookPeriod` — week / month / year / all, anchored on an ET date, with previous/next and a label.
- `BookCalendar.month(year, month, entries)` — 7-column grid of `DayCell(date, net, count, inMonth)` plus the month net.
- `BookBreakdown` — rows for league, market, bookmaker, tags, side (tail vs fade), and Gary-confidence tier: GP, win%, net.
- `BookBankroll.rolling(days: 30/60/90)` — net, staked, ROI.

New file `BookAnalyticsViews.swift`: `BookPeriodPager`, `BookCalendarView` (tap a day → `BookDaySheet` with that day's slips), `BookBreakdownsCard` (segmented LEAGUE · TYPE · BOOK · TAGS · VS GARY, columns mirror Gary's BY SPORT grid), `BookBankrollCard`, `TagChips` editor.

YOU page order: wallet header → period pager (WEEK · MONTH · YEAR · ALL, ‹ › arrows, Profit · ROI · Record strip) → equity curve scoped to the period → THE CALENDAR → actions → streak → BY SOURCE → stat tiles → BREAKDOWNS → BANKROLL → search/favorites/export → OPEN SLIPS → DAILY LEDGER. The period replaces the old timeframe menu and the chart's 1W/1M/SEASON/ALL row. Tags are searchable.

Log sheet: outside-bet form gains a market picker, a tag editor, and SCAN A SLIP (PhotosPicker → edge function → prefilled form; nothing saves until the user taps Add). Detail sheet: tags on every row, market on manual rows.

Leaderboard: EVERYONE · FRIENDS scope; the public player sheet gets Follow / Unfollow.

## Web (parity)
`lib/book/model.ts` gains the same pure functions; `BookClient` gains the pager, `BookCalendar`, `BookBreakdowns`, `BookBankroll`; `LogBet` gains market, tags, and slip scan; `Leaderboard` gains the scope toggle; `PublicProfile` gains follow. Vitest covers the math.

## Edge function `book-slip-scan`
POST `{ image_base64, media_type }` with the user's JWT. Verifies the user, records the scan, sends the image to Anthropic with a strict JSON schema, returns `{ bets: [{ description, league, market, odds_american, stake_dollars, sportsbook, game_date }] }`. Never writes a bet.

## Verification
- SQL: apply on production (additive), then exercise the RPCs as a QA user inside a transaction (`request.jwt.claims`).
- Web: vitest + typecheck + `next build`.
- iOS: `swiftc` test script for `BookAnalytics.swift`; full simulator build; screenshots of the YOU page, calendar day sheet, breakdowns, log sheet, and board on a QA account.
- `node scripts/production-truth.js` green before the peek.

## Build order
DB migration → iOS analytics + views → iOS log/detail/tags/market → iOS friends → edge function + iOS scan → web parity → tests → screenshots → commit → founder peek → push + TestFlight.
