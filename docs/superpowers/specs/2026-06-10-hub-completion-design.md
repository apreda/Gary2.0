# Hub Page Completion — Design (June 10, 2026)

Adam's brief: "the Hub Page has great bones but it needs your help — complete this page."
Decisions made autonomously per the standing creative-autonomy delegation. Grounded in a
six-lens audit (UI, data layer, lifecycle, design language, live Supabase data, backend
pipeline) run June 10; findings referenced inline.

## What "complete" means

The Hub (PropsHubView, tab 2) is fully wired to real data — no mocks, no TODOs, all 30
backend lanes map. What's missing is (1) homes for the four June-10 MLB lanes that
currently dump into "More Edges", (2) a working lifecycle (the page loads once per app
session and goes stale/dead), (3) league scoping the night before the World Cup, and
(4) design-language conformance with the rest of the Quant Terminal app.

## 1. The four new lanes get homes

Live tonight in production: `starter_form` (5 rows), `first_inning` (3), `running_game`
(3), `park_weather` (6).

- **STARTERS joins Player Edges** as a fifth lane tab (alongside PLATOON / HEAT CHECK /
  BALLPARK / COOLING). The payload is player-backed with a `[seasonERA, recentERA]`
  two-bar spark — exactly the flip-card scroller shape. Pitchers already have
  player_insight_cards (the Regression Board routes them today), so FULL BREAKDOWN works.
  Sub: "Last three starts vs the season".
- **New section: "The Conditions"** — one tabbed section (FIRST INNING / RUN GAME /
  PARK & WEATHER) after Rest & Fatigue, SignalRow lists in a quantPanel. These are
  game-condition reads, not player edges; grouping them mirrors the Player Edges tab
  idiom instead of adding three sparse stacked sections. Per-lane subs:
  NRFI/YRFI reads · Catcher arms vs teams that run · Wind, heat, and the total.
- The four kinds join the More Edges exclusion list (no double-render).

Considered and rejected: dedicated full-width sections per lane (page already has ~10
sections; 3-6 rows each renders sparse), and a second ranked board for starter form
(two adjacent identical board shapes reads as a uniform stack — against the Hub's stated
"varied shapes" intent).

## 2. Lifecycle: load → refresh → deep-link

- **Loading state**: gate the body on `didLoad` with the gold ProgressView idiom
  (PicksCarouselView pattern). Kills the false "No MLB edges yet" flash.
- **Re-runnable load()**: `.refreshable` (every other data tab has it) + a staleness gate
  — reload when the loaded EST date != todayEST() or the data is >30 min old, checked on
  tab visibility and scenePhase .active. The dead `league` init param becomes
  `isVisible: Bool` (ContentView passes `selectedTab == 2`). `sel` is only auto-assigned
  when the current selection has no rows in the new data (no stomping the user's choice).
- **Failure is visible**: track fetch errors; when everything is empty AND a fetch
  errored, show "COULDN'T LOAD THE HUB / pull to refresh" instead of the misleading
  pre-lineup copy. Pull-to-refresh is the retry path.
- **Deep links work forever**: `focusLane` becomes `@Published`, consumed via the
  PicksFocusState `@StateObject` idiom on every Hub appearance, not just first load.
  Every SignalKind maps to a section anchor (player-edge kinds + starterForm set the
  lane tab and scroll to Player Edges; conditions kinds set the conditions tab; the rest
  scroll to their section).
- **Graded void walk-back**: between 3:00–6:45am ET the graded date has no results yet;
  walk back one extra day for hit-rate/receipts/night board (Home's existing idiom).

## 3. League scoping (WC starts tomorrow)

- Streaks and Last Night boards are MLB-only feeds today; scope both to the selected
  league (filter `streakRows` by league; add `league` to the night_highlights fetch).
  No more MLB hot bats under the NBA/WC tabs.
- The `.streak` connection backstop becomes per-league: WC's pedigree/form rows and
  NBA's streak rows get their Streaks section whenever the streaks table has no rows
  for that league.
- fetchStreaks: latest-snapshot **per league** (today one global latest date can evict
  a league), limit raised 80 → 200.

## 4. Correctness fixes

- Graded `push` renders gold PUSH (PropSlipCard convention), not red MISS.
- StreakBoard index-crash guard when no rows match its four groups.
- Receipts rows become tappable (EdgeDetailSheet) and show `result_note` as the subline
  (newly fetched); receipts keep pushes visible.
- VIEW GAME only shows for matchup-shaped game strings (WC board rows like
  "TO LIFT THE CUP" currently dead-end).
- NightBoard player names: suffix-aware shortener (no more "JR.").
- Lossy array decode in fetchInsightConnections — one malformed row drops one card,
  not the league's whole day. Dropped-row count logged.
- `.debut` SignalKind deleted (no producer exists; enum stays honest).

## 5. Design-language conformance (Quant Terminal)

Baseline finding: the locked font rule passes (zero outlawed `.system(design:)` uses);
everything below is drift, not rule breaks.

- Selector grammar: lane tabs, league toggle, and the new Conditions tabs move to
  GaryFonts.mono labels (Billfold sport-chip pattern — mono text in the capsule fill).
- Stat numerals (card values, board values/ranks, sheet hero stat) move from SF bold to
  GaryFonts.mono — the terminal numeral voice. Names/headlines stay SF.
- Card chrome: FeatureEdgeCard/MiniEdgeCard/EdgeCardBack pure-white fills rebased on
  QuantPanel's warm `#F6F1E7` (the cool cast its comment outlaws).
- Panel gutters 14pt → 16pt (aligns with HubSectionHeader and every sibling page).
- One search per page: the top field adopts the mono/warm-fill treatment, spans
  everything the page shows (edges across leagues + streaks + night rows + receipts),
  and NightBoard's embedded field is removed (NightBoard is Hub-only — verified).
- Affordances: quiet chevrons on tappable rows; "tap to flip back ↺" on EdgeCardBack
  (three of three sibling card backs carry it).
- hubEmptyState restyled to the page's own NO MATCHES grammar (mono uppercase headline).
- `GaryColors.win`/`.loss` hoisted (#3FB950/#E5484D); Hub call sites use them.
- HubSectionHeader doc comment corrected (says "serif" — the outlawed word — but renders
  display-face gold).

## Out of scope (backend / other tabs — noted for Adam, not touched)

- 2 of 8 gary_hr_threats rows from 06-09 missed grading (grader-side).
- WC situational/ballpark lanes are never graded; could grade on match results.
- night_highlights bulk upsert is all-or-nothing if a CHECK migration lags (the gem/rbi/sb
  migration IS applied — verified live — but chunking would derisk future categories).
- PicksCarouselView's 60s polling .task never cancels under keep-alive tabs (pre-existing,
  other tab).
- market_pulse has 5 rows lifetime — worth confirming the pipeline runs daily.

## Build & verify

Baseline `xcodebuild` (iPhone 17 Pro sim) green before changes; rebuild after
implementation + adversarial multi-agent review of the diff; fix confirmed findings;
final green build before declaring complete.
