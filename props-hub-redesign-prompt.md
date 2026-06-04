# Props Hub — Full Redesign Prompt

## The ask in one line
Redesign the **Props Hub** (`PropsHubView` in `ios/GaryApp/Views.swift`) from a static, scrollable list into an **interactive, dashboard-style hub** — a single scrollable page that mixes several *different* ways of displaying the same prop data, with collapsible/expandable sections and dropdown controls.

## Hard reset — read this first
- **Abandon the previous attempt completely.** Throw out the "featured props horizontal swipe carousel of trading-card slates" direction entirely. Do not iterate on it, do not salvage components from it.
- **This is a brand-new page.** Do **not** feel bound by the app's existing colors, fonts, spacing, or layout conventions (the serif matchup titles, mono time labels, hairline-separated rows, gold-on-black list look). Design this screen on its own terms. If you land somewhere that diverges from the rest of the app, that's fine — we'll reconcile later.
- The only thing that must carry over is the **data and its meaning** (below). Everything visual is open.

## Why we're redoing it
The current Props Hub is a **list view that still feels like a blog**: game after game stacked vertically, each one a title + a column of near-identical prop rows. It reads as a document you scroll through, not a product you interact with. There's one display pattern repeated down the whole page, no density, no glanceability, nothing to *do*.

We want the opposite: a **dashboard** — an interactive hub of information where the eye can land on different module types, drill in, filter, and scan. Think "control center for tonight's props," not "article listing tonight's props."

## North star
A bettor opens the Props Hub and within 3 seconds gets a **read on the whole slate** (how many props, which sports, Gary's confidence shape, what's hitting), then can **drill down** into any game, league, or individual prop without leaving the page. Scrolling reveals progressively more detail; dropdowns and expandable sections let them collapse what they don't care about.

## The data you have to work with
Design around the *real* content. Per the existing hub, every prop/game carries roughly:
- **Player props** — player name, prop type (points, rebounds, assists, total bases, etc.), the line value, over/under direction, and odds.
- **Gary's game pick per matchup** — moneyline / spread / total, sitting above that game's player props.
- **Matchup + time** — `Team @ Team`, game start time, league.
- **Leagues / sports** — NBA, NFL, NHL, NCAAB, NCAAF, MLB. NFL also has TD categories (Regular / Value / First TD).
- **Confidence** — a per-pick confidence score.
- **Gary's analysis / rationale** — the narrative reasoning behind a pick ("Gary's Take").
- **Results / record** — W/L result stamps on graded props, and the ability to surface a hit-rate / record.

You don't have to display all of this everywhere — but the design should *make room* for these data types and use the richest ones (confidence, results, analysis) as first-class visual material, not afterthoughts.

## What "interactive dashboard hub" means here (interaction model)
- **One long vertical scroll** is still the spine — but it's a sequence of *distinct modules*, not one repeated row pattern.
- **Dropdowns / expand-collapse everywhere it helps.** Sports, games, and prop groups should be collapsible (think disclosure groups / accordions). The user curates their own view by opening and closing sections. Remember their open/closed and filter state where reasonable.
- **Filtering is a primary action**, not a secondary one. Filter by sport, by game, by prop type, by over/under, by "only show props that are live/hitting," etc.
- **Glanceable top, detailed bottom.** Lead with summary/overview modules; reveal granular per-prop detail as you scroll or expand.
- **Tap-to-drill.** Tapping a summary element (a sport, a confidence band, a player) should scroll/expand to the relevant detail.

## Combine multiple display methods (this is the core request)
The whole point is **variety of representation** — the same prop data shown several ways so the page feels like a dashboard. Pull from a menu like this (use several, not all; choose what serves the data):
- **A slate-summary header / overview strip** — counts (e.g. "23 props · 5 sports · 8 games"), today's record or hit-rate, maybe a confidence distribution at a glance.
- **At-a-glance KPI tiles** — small stat cards (props live, avg confidence, W-L today, best bet).
- **A compact data table / grid** — dense, sortable rows for power users who want to scan many props fast (player, prop, line, O/U, odds, confidence, result).
- **Sport / league segmented control or pill bar** — switch or filter the slate by sport.
- **Collapsible game sections (disclosure groups)** — each game expands to reveal its game pick + player props.
- **Confidence visualization** — bars, rings, heat, or a sorted "highest conviction" lane so confidence is *visual*, not just a number.
- **A "Gary's top plays / best bets" highlighted module** — a few hero picks treated differently from the rest.
- **Results / performance module** — recent W/L, streak, or a small trend chart, using the result stamps.
- **Filter / sort controls** (dropdowns, menus) — sport, prop type, O/U, confidence, sort order.
- **An expandable "Gary's Take" reveal** per prop — analysis tucked behind a tap so the surface stays clean.

The mix matters more than any single component: an overview strip + KPI tiles + a filterable table + collapsible game groups + a confidence visual already reads as a dashboard instead of a list.

## Information architecture (suggested, not mandatory)
1. **Overview / slate summary** (the "command center" header) — totals, record, confidence shape.
2. **Filter & sort bar** — sport pills + dropdown controls, sticky if practical.
3. **Top plays** — Gary's highest-conviction props, visually elevated.
4. **The slate** — collapsible game (or league) sections, each opening to game pick + player props, with per-prop "Gary's Take" expanders.
5. **Optional: dense table view toggle** — same data, scan-optimized.

Feel free to reorganize — but every screen-height of scroll should introduce a *different kind* of module, not more of the same rows.

## Design principles
- **Density with hierarchy** — a dashboard can be information-rich as long as type, size, and grouping make it scannable.
- **Glanceability first** — the most important reads (what's hitting, what's most confident, how many) should be absorbable without reading.
- **Progressive disclosure** — default to a clean, collapsed surface; let the user expand into detail.
- **Make confidence and results *visual*** — these are the most interesting data and currently get buried as text.
- **Motion with restraint** — expand/collapse, filter transitions, and tap feedback should feel responsive, not decorative.

## Constraints
- **Platform: SwiftUI**, iOS app, this is `PropsHubView`. Use native idioms (`ScrollView`, `LazyVStack`, `DisclosureGroup`, `Menu`/`Picker`, `Section`, segmented controls). Keep it performant on a long slate — lazy-load rows.
- Keep the existing **data plumbing / models** intact (the prop fetching, result-matching, game-pick lookup logic). This is a **view-layer redesign**, not a data refactor.
- Handle the real states: loading, empty slate, a sport with no fresh props (yesterday-recap fallback), and graded vs ungraded props (W/L stamps only on graded).

## Creative latitude
**You own the visual design.** Colors, typography, component styling, layout grid, and the specific module treatments are yours to invent — this is a fresh canvas, not a restyle of the current page. The spec above defines *what the page must do and contain*; how it looks is your call. Bias toward something that feels like a premium, modern sports dashboard rather than a content feed.

## Done looks like
- The page no longer reads as a single repeated list — it's a sequence of **distinct, interactive modules**.
- A user can **filter by sport / prop type / O-U / confidence** and **collapse/expand** games and sections.
- **Confidence and results are shown visually**, not just as text.
- There's a **glanceable overview** up top and **drill-down detail** further down.
- It works across all sports including the NFL TD categories, and handles loading/empty/recap states cleanly.

## Before you build
Briefly propose the **module list and page structure** you intend to build (and one or two visual-direction options) so we can align before you write the SwiftUI. Then implement.
