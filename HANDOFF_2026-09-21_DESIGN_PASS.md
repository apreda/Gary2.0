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
