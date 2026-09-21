# Design pass — September 21, 2026 (evening)

Adam's screenshot review of the app, worked as one batch. Commit `e3fcb0ae`
(iOS + backend), plus the peer commit `6dabf90b` that carried the
two-paragraph Quarterbacks/Arms contract. Sim build installed on
"iPhone 17 (Gary)"; no TestFlight, no push (Verify runs on push to main —
Adam authorizes).

## Rules he set (now in `design.md`, linked from `gary2.0/CLAUDE.md`)
- No filled oval bubbles for filters, tabs, chips or badges — ever. Text
  with a gold underline instead.
- No internal tags ("FANDUEL · SAME BOOK") or machine dates ("2026-09-20",
  "current-2026") in anything a fan reads.
- One design per component across sports; MLB is the reference.
- The nav bar floats (fade dock).

## iOS (all in `ios/GaryApp`)
- `ContentView.swift`: fade dock restored (the Sep 19 solid bar reverted).
- `Picks/EdgesSection.swift`: filters are mono text + gold underline; new
  `contained:` mode = the Slate Intel row cards without header/tabs. The
  pick page's MORE INTEL (NFL `FootballGameIntelView`, MLB
  `MLBGameIntelView`) uses it; the old MoreIntelPanel and its gold hairline
  are gone.
- `FootballGameIntelView.swift`: THE LINE row drops book/market tags; THE
  SWEAT shows for college only; injury report keeps the feed's importance
  order (no re-sort by status), shows 6 names with SEE ALL / SHOW FEWER,
  note = Gary's write-up + the verbatim wire line underneath, status never
  wraps (min-width column); `footballPanel` = MLB's panel fill/stroke.
- `HubLineMovers.swift`: NFL window = current NFL week (Thu–Mon) via
  `getNFLWeekStart`, not today+6; spacer capped at 18pt; type 12.5/12.
- `HubView.swift`: After Gary beat removed for NFL/NCAAF; NFL SWEAT rows
  ineligible on the Hub; football quick pages = 4 lanes (Mismatch, Field,
  Edges, Form) like MLB's 4; section nav 14pt; every module gets a `blurb`.
- `HubResearchDashboard.swift`: `HubResearchModule.blurb(for:mlb:)` — each
  tile explains its section instead of quoting a sample headline.
- `DesignSystem.swift`: `readingPanel` = `#141210` (the Picks page fill).
- `Hub/HubHeader.swift` date line 12.5; `Hub/HubSlateStrip.swift` 13/11.5;
  `BillfoldView.swift` menu labels 14, sport legend + timeframe + scope
  chips → text/underline; `MLBGameIntelView.swift` weather chip and
  HITTER/PITCHER badge unfilled; `BookAnalyticsViews.swift` tag chips
  unfilled.

## Backend (`gary2.0`)
- `src/services/insights/researchCopyPolicy.js`: `fan-writeup-v2`. Reads
  are write-ups: what the number says, why it looks that way (opponent,
  sample, last season), whether it holds, how a bettor can use it. Plain
  dates only; the guard rejects ISO dates and "current-YYYY"; every number
  must appear on the item's own fact sheet (unchanged). Narrowed betting
  regex: still blocks first-person picks, guarantees, locks.
- `src/services/insights/laneReads.js`: `perGame` budget (football lanes
  pass 3; availability 6) and batched calls of 16 items; default 3–4
  sentences.
- `computers/footballTeamEdges.js`: MLB headline shape ("NYG: 28 points per
  game to LAR's 7"), `humanDate`, last season's numbers for both sides in
  every detail (one extra prior-season BDL load per run).
  `footballDefensiveEdges.js`, `footballMismatch.js`: same headline shape,
  no dash pre-context, plain dates.
- `computers/footballAvailability.js`: every reported player ships (no
  4-per-game cap); reads for the top 6 per game; ask = who the player is,
  the injury and when, what the status means, who picks up the work.
- `computers/theSweat.js`: college only. `computers/afterGary.js`: detail
  in words.
- `generateInsightConnections.js` + `run-insight-connections.js`: `--lanes`
  scope (computer function names) → `options.onlyLanes`.
- New launchd job `~/Library/LaunchAgents/com.gary2.football-availability.plist`
  (bootstrapped): hourly at :05, 6 AM–11 PM ET, NFL injury + practice
  lanes only. Logs: `~/Library/Logs/Gary2.0/football-availability-*.log`.

## Runs this session
- `run-insight-connections.js --league NFL --reset --skip-cards`, then MLB,
  then `scripts/run-tomorrow-board.js --today` (the app reads
  `tomorrow_board` for today's date). Logs in the session scratchpad.

## Open
- NCAAF: THE SWEAT kept (he said NFL). His call.
- Explosive-play write-ups cannot name the plays: team boxes only. Needs
  play-level data.
- MLB Hub layout vs NFL: containers, tiles and top are now one design;
  the lane lists differ by sport on purpose.
- Push to main held (Verify workflow).

## Second batch (same evening) — commit `7c9ad3d4`
- **Leaderboard.** `Book/CommunityLeaderboardView.swift` rewritten: RECORD
  (ranked by wins, W–L + win rate) and STREAK tabs, podium + table, no
  friends lens, no time/sport filters, leads with the board signed in or
  out; a small "Sign in to get on the board" row at the bottom. Billfold
  scope tab reads LEADERBOARD (value `board` unchanged). The mock cast
  (`supabase/testcast_seed.sql`, 9 locked @testcast accounts) was purged and
  reseeded at recent dates so the board is populated; the old Aug cast rows
  were still in the DB (cleanup had not run). `testcast_cleanup.sql` removes it.
- **LOG BET.** Both card backs (`BookGameTailFadeRow`, `BookPropTailFadeRow`)
  show one LOG BET button → Bet with Gary / Fade the Bear → stake → Lock it
  in. The STREAK toggle left the stake row.
- **The streak star.** `StreakStarButton` (in `BookGameTailFadeRow.swift`;
  the pbxproj is not folder-synced, so a new file needs a project edit) sits
  on the front of game cards (meta row, before ⓘ) and prop cards (beside the
  line value). Tap → "Count this pick toward your streak?" → side → the bet
  logs with `streak: true`. Starred + unlocked → "Remove the star". Logged
  but unstarred → "Star it". Server: `set_streak_pick` no longer un-stars
  the day's other pick; the `user_bets_one_streak_per_day` unique index is
  dropped (migration `20260921233000_streak_many_stars`, applied to
  xuttubsfgdcjfgmskcol). `streak_summary` already restarts the run at any
  loss across all starred plays.
- **THE SWEAT** is gone for NCAAF too: iOS mount/gate removed, dead views
  deleted, `theSweat.js` computes for no league (proof helpers kept for
  grading).
- **Explosive plays.** `ballDontLieService.getNflPlays(gameId)` (cursor
  paged, cached 7 days) + `footballTeamEdges` names each side's 20+-yard
  scrimmage plays from its last game on the yards-per-play fact sheet
  (`PLAY_FETCH_BUDGET` 16 games per run; the BDL gate makes a cold run ~10
  min, cached runs free). Today's NFL explosive rows were regenerated.
- **Hub type.** Beat-row kicker 11 / game label 11.5; quick-page kicker,
  context and link text 12.5.
- **League Pulse and NFL Mismatch**: both already render through the shared
  components (`HubLeaguePulse`/`PulseTable`, `HubBeatList`); what differs by
  sport is the backend tab/column content, not the design. No change made.
