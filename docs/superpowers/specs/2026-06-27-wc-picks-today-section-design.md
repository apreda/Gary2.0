in s# WC Picks TODAY Section Redesign — Design Spec

**Date:** 2026-06-27
**Surface:** iOS — Picks page → WC sport filter → TODAY page → the section currently called "TODAY'S EDGES"
**Approach:** Path A — bespoke `WCTodaySection`, replacing the generic `EdgesSection` for WC on the TODAY page only.

---

## 1. Problem

On the Picks page, with the WC filter on the TODAY page, the World Cup intel is rendered by the **generic** `EdgesSection` (`Views.swift:18015`) — the same data-driven component MLB uses. World Cup content (lineups, formations, group-stage stakes) doesn't fit a card shape built for one-line MLB "edge" blurbs, so the result reads messy:

- **Up to 8 category tabs** auto-generated from whatever lanes the backend emitted (`TEAM-NEWS/SITUATIONAL, ADVANCEMENT, TOURNAMENT, STREAK, HEAD-TO-HEAD, XG RECAP, XG REGRESSION, VENUE`), several overlapping or backward-looking.
- The **SITUATIONAL** card (`SignalRow` → `ConfirmedXISheetView`, `Views.swift:22282` / `:22337`) dumps **both full 11-man lineups** inline (~22 surnames, comma-joined, wrapping), stacked across every game on the slate.
- It **violates locked design rules**: player/label text is `.white.opacity(0.3–0.7)` at 7.5–11pt (the faint-grey-too-small anti-pattern); headline/detail/names use raw `.system()` instead of `GaryFonts`; the same boilerplate subtitle repeats on every card.
- It is **lowest-signal content rendered loudest** — a raw *projected* XI (the regulars from each side's last match, explicitly "not a real selection") dominates a page whose job is Gary's plays.
- It **duplicates, in a worse form, a better view that is one tap away**: the per-game page already renders `WCGameIntelView` (`Views.swift:19299`) — a real pitch with jersey'd players — but the TODAY-page rows are dead-end (no `onTap`, `Views.swift:18087`).

## 2. Goals

1. **Rethink the categories** — consolidate ~8 sprawling lanes into 4 fan-legible, forward-looking lanes.
2. **Lead with Gary's angle** — the TEAM NEWS card headlines the *news that matters* (who's in doubt / confirmed), not "projected XI", with status forward and legible.
3. **Clean, readable team-news** — fix contrast/fonts/density to the locked rules; kill repeated boilerplate.
4. **Slim it / move the heavy detail** — stop dumping both full XIs inline; the card teases the team news and **taps through to the existing `WCGameIntelView`** for the full pitch + XI.

## 3. Non-goals / scope guardrails

- **Do NOT touch the locked, loved surfaces:** the MLB path, the generic `EdgesSection` / `SignalRow` / `ConfirmedXISheetView` as used by MLB, the per-game WC page, the hero/score strip, prop slips. (`CLAUDE.md` LOCKED — Picks page.)
- **Do NOT touch the backend** (`run-insight-connections.js`, the `wc*.js` computers, `insight_connections` schema). The new view composes from the structured `meta` already present in the data. No regrade risk.
- **Keep existing edge copy verbatim** for the FORM / STAKES / CONDITIONS lanes (respects the prior veto on rewriting edge text into fan-voice). Only the TEAM NEWS card composes its own presentation text, and that from structured fields, in plain professional voice (no slop, no hooks).
- **The Hub keeps its own WC lane layout** (`HubDisclosure`, `Views.swift:~20851+`) — unchanged.

## 4. Architecture (Path A)

A new SwiftUI view, `WCTodaySection`, lives alongside `EdgesSection`. `PicksTodayPage` (`Views.swift:19091`) swaps it in for WC:

```swift
// PicksTodayPage.body — the ONLY shared-code edit
if scopeLeague == "WC" {
    WCTodaySection(edges: edges)            // bespoke, WC-only
} else {
    EdgesSection(title: "TODAY'S EDGES", edges: edges, tabbed: true)  // untouched
}
```

`WCTodaySection` consumes the same `[Signal]` the page already builds (`sportConnections`), so no new fetch/loader. Each `Signal` already carries `kind`, `headline`, `detail`, `game`, `value`, `tone`, and (for team news) `confirmedXI: SwapMeta?` with `status`, `home`/`away` `TeamSheet`, `doubts`, `kickoff`.

### View structure

```
WCTodaySection
├── laneStrip            // 4 tabs: TEAM NEWS · FORM & xG · STAKES · CONDITIONS
│                        //   (gold underline active, GaryFonts.mono, matches existing tab styling)
└── content(for: lane)
    ├── TEAM NEWS  → ForEach(game) { WCTeamNewsCard(signal) }   // bespoke per-game card
    └── other 3   → ForEach(game) { WCEdgeRow(signal) }         // restyled, copy verbatim, tappable
```

Tapping any card/row sets a `@State selectedMatchup` that presents `WCGameIntelView(matchup:...)` (the same view the per-game page uses) via `.sheet` / `navigationDestination`.

## 5. Lane consolidation (8 → 4)

A display-layer map (in `WCTodaySection`, not the backend) groups the existing `SignalKind`s. Mapping derived from `toSignal()` (`Views.swift:20118–20130`) and the computer categories:

| New lane | Absorbs `SignalKind` (← computer) | Rationale |
|---|---|---|
| **TEAM NEWS** | `.situational` (← wcConfirmedXI lineups, wcRestEdge) | Who's playing / availability — the team-news lane. |
| **FORM & xG** | `.streak` (form, pedigree), `.h2h` (h2h, openers), `.xgRecap` (xg), `.xgRegression` | "Are they hot / due" — recent form, matchup history, xG trends. |
| **STAKES** | `.tournament` (groupValue, knockoutPath, stakes, previewGroups), `.advancement` (advancementOdds) | What each side needs to advance. ADVANCEMENT and TOURNAMENT were the same idea split. |
| **CONDITIONS** | `.ballpark` (venueEdge, weather) | Altitude, heat, roof, forecast. Relabel from "VENUE". |

Lanes render only when they have ≥1 row that day (same "data-driven presence" rule as today, just bucketed). Lane order is fixed (TEAM NEWS → FORM & xG → STAKES → CONDITIONS), not feed order, so the strip is stable day to day. Default selected lane = first present.

**Open toggle (low-stakes):** XG RECAP is pure look-back. Default = merge into FORM & xG (nothing lost). Optional = suppress on the forward-looking TODAY page (it remains in the Hub). Recommend merge for simplicity.

## 6. The TEAM NEWS card (`WCTeamNewsCard`)

The worked example and the main rebuild. **One card per game.** No inline full XI.

```
┌──────────────────────────────────────────────┐
│  TEAM NEWS                     ENG @ PAN · 5PM │   ← lane chip (gold) + matchup + kickoff
│                                                │
│  England — Rice & Anderson game-time calls  ▸ │   ← headline, GaryFonts, white, status-forward
│  Both starters in doubt; sheet posts ~2h out.  │   ← one plain sub-line, team-news data only
│                                                │
│                                                │
│  ┌────────────┐   PAN 5-4-1  ·  ENG 4-2-3-1   │   ← status chip + formations (no 22 names)
│  │  IN DOUBT  │   Watching: Rice, Anderson     │   ← only the story players
│  └────────────┘                                │
│                          tap for the full XI → │
└──────────────────────────────────────────────┘
```

### Content rules (composed from `confirmedXI` meta)

- **Headline** — derived from `status` + `doubts`, plain/professional:
  - `confirmed` → "England's XI is in" (or "Confirmed: <formation> for England").
  - `contested` → "<Team> — <doubt surnames> game-time call(s)".
  - `projected` → "<Home> v <Away> — likely XIs" (no false certainty).
- **Sub-line** — at most one short line, composed **only from team-news data** the card actually holds (`status`, `doubts`, `kickoff`) — never a claim it can't back. No repeated boilerplate across cards; the "sheet posts ~2h before" idea is carried by the status chip's meaning. *(Optional later enhancement — a Gary's-lean tie-in — would require joining the matchup's pick into the card; out of scope for v1 to keep it honest and the page edit one line.)*
- **Status chip** — large, legible, `GaryFonts.mono`, color-coded: `CONFIRMED` green (`GaryColors.win`), `PROJECTED` gold (`GaryColors.gold`), `IN DOUBT` amber (`#D9913F`, matching `WCI.amber`).
- **Formations** — both, compact: `PAN 5-4-1 · ENG 4-2-3-1` (from `TeamSheet.formation`).
- **Story players only** — the `doubts[]` (and, on confirmed, any notable change if cheaply derivable), not all 22. If nothing's in doubt: omit the "Watching" line.
- **Tap-through** — whole card taps into `WCGameIntelView(matchup: signal.game)` for the full pitch + XI.

## 7. The other three lanes (`WCEdgeRow`)

FORM & xG / STAKES / CONDITIONS rows are mostly fine one-liners that just need restyling and grouping. `WCEdgeRow`:

- Renders `headline` / `detail` / `value` **verbatim** (no copy rewrite).
- All text via `GaryFonts`; secondary text ≥0.6 opacity, ≥~11.5pt; value badge as today but legible.
- Grouped under a small game header when a lane has multiple games, so rows don't blur together.
- Tappable into `WCGameIntelView` (consistent with TEAM NEWS).

## 8. Styling (locked-rule compliance)

- **Every string through `GaryFonts`** — `GaryFonts.text(...)` for prose, `GaryFonts.mono(...)` for labels/chips/formations. No raw `.system(size:)`.
- **Contrast** — primary text white; secondary ≥0.6 white; no text below ~11pt. (Replaces today's 0.3 @ 7.5pt and 0.7 @ 11pt.)
- **Gold is signature** — lane chip + active underline gold; sport accent (WC teal `#14B8A6`) used sparingly; status colors as in §6.
- Card container, spacing, and divider rhythm mirror the existing Picks cards so the section sits naturally on the locked page.

## 9. Empty / edge states

- **No WC rows today** → section renders nothing (the page's other content / empty state stands).
- **A lane present but a game lacks that lane** → that game simply has no card in that lane.
- **`projected` with no usable XI** (backend returns no row) → no TEAM NEWS card for that game; never fabricate.
- **Kickoff passed / live** → card still shows last known status; tap-through to `WCGameIntelView` carries live state as it already does.

## 10. Risks & mitigations

- **Touching the locked Picks page** → mitigated: the only shared edit is the one-line conditional in `PicksTodayPage`; `EdgesSection` and all MLB rendering are byte-for-byte unchanged.
- **Tap-through wiring** → `WCGameIntelView` already exists and is instantiated elsewhere (`:19299`, `:21004`); reuse its initializer. Verify it presents standalone (outside a `PicksGamePage`) cleanly.
- **Lane map drift** → if the backend adds a new WC category, it falls into no lane and is silently dropped. Mitigation: a default "everything unmapped → FORM & xG (or a MORE lane)" catch so nothing vanishes; log unmapped kinds in DEBUG.
- **Copy-voice** → TEAM NEWS headlines are composed plain/professional; no funnel hooks. FORM/STAKES/CONDITIONS copy stays verbatim.

## 11. Out of scope (future)

- Backend computer changes (merging/renaming categories at source).
- Restyling the per-game WC page or `WCGameIntelView` internals.
- Any MLB or Hub changes.
- A "Source Consensus" desk lane (no backend feed exists; previously removed).

## 12. Build sequence (for the plan)

1. `WCTodaySection` scaffold + lane map + lane strip (4 tabs, fixed order, present-only).
2. `WCTeamNewsCard` (compose headline/sub/status/formations/story-players from `meta`; tap-through).
3. `WCEdgeRow` (restyle + group + tap-through; copy verbatim).
4. One-line swap in `PicksTodayPage` (WC → `WCTodaySection`).
5. Verify on device/sim against today's WC slate; confirm MLB TODAY page is visually unchanged.
