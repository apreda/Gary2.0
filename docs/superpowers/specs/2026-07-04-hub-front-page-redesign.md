# The Hub — Front-Page Redesign (July 4, 2026)

Founder brief: full redesign, 100% delegated ("I want to see how you do a feature/page on your
own — don't match fonts to the rest of the app; keep the palette and logo loosely"). Free range
on data sources too.

## Diagnosis of the current page

The data layer is excellent (16 MLB lanes tonight, streaks, night board, today_board, 191 player
packs, graded history) — the page's failures are structural:

1. **A filing cabinet, not a page.** 12+ collapsible lanes named in house jargon (Owned, The
   Beneficiary, The Conditions). The reader must know the taxonomy before the page gives them
   anything. Most content hides behind closed disclosures; "COMING TODAY" placeholder rows are noise.
2. **No hierarchy of importance.** `relevance_score` (0–100) exists but only orders rows *within*
   lanes. The single best edge tonight renders identically to the 8th bullpen row.
3. **Three navigation grammars on one page** — transplanted Day-Ahead tab table, lane tab strips,
   then a pile of disclosures. No reading rhythm.
4. **No slate context.** The Hub never tells you what's on tonight (games, times).
5. **The receipts vanish during the day.** Graded honesty (the brand's spine) only shows in the
   morning-void state.
6. Live bugs: duplicate `regression_tomorrow` rows tonight (Ryan Johnson twice); July 3 grading
   never landed (scheduler outage fallout) — flagged, not in scope here.

## Directions considered

- **A. Editorial front page** — descending story importance, like the front of a sports section:
  the lead, the best of the board, the signature boards, the beats, the receipts. ✅ CHOSEN.
- **B. Game-first regrouping** — every edge under its game. Rejected: duplicates Picks GAME INTEL;
  the Hub's identity is the *signals* layer.
- **C. Single ranked feed.** Rejected: kills scannability; the boards (Regression, Streaks) are the
  best products on the page and deserve named homes.

## The design — "tonight's front page"

Visual language (deliberately new, loosely in-brand): warm black page, gold as the signature,
HubPalette green/red for good/bad. NEW: New York serif (system `.serif`) for the masthead,
lead headline, and section heads — an editorial voice no other tab uses; SF Pro for reads;
monospaced digits for all data; gold small-caps kickers instead of mono chips; newspaper hairline
rules instead of boxed panels wherever possible. No capsule chips. Secondary text ≥ 0.62 white.

Page structure (per league tab; sections render only when they have rows):

1. **Masthead** — serif "The Hub", context line ("Saturday, July 4 · 15 games tonight"), the
   honest record line (LAST 7 DAYS 269–223 · 55%, from a new tiny fetch), league tabs
   (gold-underline grammar), search + settings.
2. **Tonight's slate strip** — one quiet horizontal line per game from `today_board.board`
   (abbr @ abbr · time · O/U; marquee gold). Tap → that game on Picks.
3. **The Lead** — the #1 edge tonight (relevance-ranked, deduped, prefer player-backed): gold
   kicker, serif headline, huge tone-colored number vs its baseline, the read, tap → full breakdown.
4. **The Best of the Board** — ranked #2–7 across ALL lanes (max 2 per lane): rank numeral,
   kicker, one-line story, tone value. This is where relevance_score finally does its job.
5. **The Regression Board** — kept (founder's favorite) and restyled: TONIGHT / HITTERS /
   TOMORROW, diverging gap bars, expand → verdict + stat strip, second tap → profile.
6. **Streak Watch** — on-the-line-tonight first, plain tone-colored marks (W5 / 0-22), tap → Picks.
7. **The Beats** — the long tail collapsed into four human sections, each flat with top-3 rows +
   "See all n": **Matchups** (platoon, owned/BvP, H2H tug bar, beneficiary swaps, HR threats),
   **The Arms** (starter form, team record, bullpen/rest fatigue, ballpark), **Conditions**
   (first-inning dots, running game, park & weather), **Fantasy Corner** (SP / hitters two-col).
   WC variants: The Cup (tournament + advancement), The Numbers (xG regression + recap), Venue,
   Rest, Game Intel (confirmed XI → full dashboard).
8. **Last Night & the receipts** — night board + yesterday's graded edges with the tally, present
   ALL DAY (receipts now always fetched), closing the page.
9. Morning void = same page minus 3–7, with an honest "posts with lineups" note — the morning
   paper still has the slate, streaks, last night, and receipts.

## Contracts preserved

- Data machinery copied from PropsHubView: staleness/rollover reload, graded-date walk-back,
  kept-alive-tab visibility flips, pull-to-refresh, error/empty/loading states.
- `HubFocusState` deep links — every SignalKind maps to a new section anchor.
- `onSelectGame` → Picks focus; EdgeDetailSheet / PlayerInsightSheet / WC fullScreenCover reused.
- GaryTour `hub mlb|nba|wc` verb kept.
- NEW: app-side dedupe (category|headline|game) fixes tonight's double rows defensively.

## Where the code lives

New `ios/GaryApp/HubView.swift` (all subviews fileprivate). ContentView's GaryPage swaps
`PropsHubView` → `HubView`. PropsHubView left intact in Views.swift for instant rollback —
flagged for Tier-2 dead-code cleanup once the founder approves the new page. xcodegen regen
registers the file (pbxproj verified in sync with project.yml at 2.18/6).
