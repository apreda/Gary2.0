# Props Hub — Flip-to-Reveal Card Back ("The Breakdown")

**Date:** 2026-06-02
**Status:** Approved design, pending implementation
**Area:** iOS app — Props Hub ("Quant Terminal") dashboard

## Problem

Game picks in the app flip in place to reveal Gary's reasoning
(`FlippablePickCard` → `PickCardBack`, Views.swift:7242–7331). Prop picks never
got this treatment: tapping a prop row in the Props Hub opens `PropDetailPopup`,
a full-screen modal overlay (Views.swift:10091). The modal is heavier than the
inline flip and breaks the "Quant Terminal" terminal-feel that the rest of the
dashboard now uses.

This brings the flip-to-reveal pattern to prop **list rows**, and uses the
prop's structured `analysis` to render a richer, on-brand "Quant Terminal"
breakdown rather than a plain text blob.

## Scope

**In scope — convert to flip:**
- The cards-view **game-section prop rows** only: `CompactPropRow` at
  Views.swift:3694–3695 inside `GaryPropsView`.

**Out of scope — unchanged, still use the modal / their own expansion:**
- Slate "top plays" / featured prop buttons (Views.swift:3592, 3863).
- Table-view prop rows (Views.swift:3775) — already have inline "Gary's Take"
  expansion.
- Home/Today view prop taps (Views.swift:1717, 1721) — different screen.
- `PropDetailPopup` remains in the repo and is still presented by the sites
  above. The `GaryPropsView.selectedProp` overlay (Views.swift:3131) stays.

This keeps the change surgical and leaves every other prop surface working
exactly as today.

## Data model (no migration)

`PropPick` (Models.swift:881) already carries everything needed:
- `confidence: Double?` — drives the gold confidence bar.
- `key_stats: [String]?` — 3–4 bullets, **not** shown on `CompactPropRow`'s
  front, so safe to render on the back as "KEY READS" with no duplication.
- `analysis: String?` — multi-section labeled text. Sections observed:
  `HYPOTHESIS:`, `EVIDENCE:`, `CONVERGENCE (0.xx):`, `IF WRONG:`, `THE EDGE:`,
  `THE VERDICT:`, `RISK:`.
- `bet`, `odds`, `line`, `prop`, `player`, `team`, `matchup`, `effectiveLeague`.

`convergence` and `risk` are **not** model fields — they live inside the
`analysis` string and are parsed out (see below). No Supabase change.

## Components

### 1. Analysis parser — `PropAnalysisSections`

Location: `Models.swift`, near `PropPick`.

A value type + parse function, the structural inverse of the existing
`cleanAnalysis` (which *strips* labels):

```
struct PropAnalysisSections {
    var edge: String?         // "THE EDGE:"
    var verdict: String?      // "THE VERDICT:"
    var risk: String?         // "RISK:"
    var convergence: Double?  // parsed from "CONVERGENCE (0.78):"
    var ifWrong: String?      // "IF WRONG:"
    var hypothesis: String?   // "HYPOTHESIS:"
    var evidence: String?     // "EVIDENCE:"

    var hasStructuredSections: Bool   // true if any of edge/verdict/risk found
}

extension PropPick {
    var analysisSections: PropAnalysisSections { ... }
}
```

Parsing rules:
- Case-insensitive label match (mirror `cleanAnalysis`'s label list).
- A section's text = everything from after its label up to the next known
  label (or end of string), trimmed.
- `convergence`: extract the float inside `CONVERGENCE (…)`.
- Resilient to missing labels, extra whitespace, and labels in any order.
- `hasStructuredSections` gates the structured layout vs. the fallback.

### 2. `FlippablePropCard`

Location: `Views.swift`, beside `FlippablePickCard` (~7242).

Exact mechanical clone of `FlippablePickCard`:
- `ZStack { front; back }`, front = existing `CompactPropRow` (untouched),
  back = `PropCardBack`.
- Front measured via `PickCardHeightKey` (reuse the existing preference key).
- `expandedH = max(frontH + 160, 320)`.
- `.rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (0,1,0), perspective: 0.55)`
  on the container; back pre-rotated 180°.
- `.animation(.spring(response: 0.6, dampingFraction: 0.82), value: flipped)`.
- `.contentShape(Rectangle()).onTapGesture { flipped.toggle() }`,
  `.accessibilityAddTraits(.isButton)`.

Signature: `FlippablePropCard(prop: PropPick, gameResult: String? = nil, showSportBadge: Bool = false)`.

### 3. `PropCardBack`

Location: `Views.swift`, beside `PickCardBack`.

Sport accent via `Sport.from(league: prop.effectiveLeague).accentColor`
(same source as `PropDetailPopup`). `betColor`: green for over/yes, red for
under/no. Card chrome matches `PickCardBack`: `Color(hex:"#141210")` fill,
rounded 12, gold-opacity stroke, padding 14.

**Structured layout** (when `analysisSections.hasStructuredSections`):
```
THE BREAKDOWN                         {matchup}   ↺      (header: accent + dim mono + glyph)
{player} · {propType}                       {OVER/UNDER}  (gold rounded + bet color)
[████████████░░░] {NN}% CONF                      {odds}  (gold confidence bar + mono odds)
THE EDGE ───────────────────────────────────────────────
{edge text}                                              (white .opacity 0.8, lineSpacing)
KEY READS                                                (only if key_stats non-empty)
  ▸ {stat}
  ▸ {stat}
CONVERGENCE {0.xx}   ·   RISK  {risk text, 1–2 lines}    (only the parts that parsed)
THE VERDICT ─────────────────────────────────────────────
{verdict text}
                  tap to flip back  ↺
```
Sections render only when their parsed field is non-nil — never an empty
header. Body text scrolls if it overflows `expandedH` (`ScrollView`, hidden
indicators), matching `PickCardBack`.

**Fallback layout** (no structured sections — older picks, TD picks):
Render exactly like `PickCardBack`:
- `GARY'S TAKE` header (accent) + matchup,
- `player · propType` + `NN% CONF`,
- gold confidence bar,
- scrollable cleaned analysis text (reuse the `cleanAnalysis` logic, lifted to
  a shared helper so both the popup and the back use one implementation),
- `tap to flip back ↺`.

This guarantees the back is always populated and never shows blank sections.

### 4. Wire-in

Views.swift:3694–3695, inside the game-section `ForEach`:

```
// before
CompactPropRow(prop: prop, gameResult: resultForProp(prop), showSportBadge: false)
    .onTapGesture { selectedProp = prop }
// after
FlippablePropCard(prop: prop, gameResult: resultForProp(prop), showSportBadge: false)
```

`selectedProp` state and the overlay remain (other sites still use them).

## Edge cases

- **No analysis at all** → fallback layout shows "No analysis available." (mirrors
  `PickCardBack`'s "No rationale available.").
- **TD picks** (`isTDPick`) → analysis usually lacks the labeled sections →
  fallback layout. Acceptable; matches popup behavior.
- **Result stamp**: the front `CompactPropRow` already overlays W/P/L for graded
  picks; the flip is purely additive and does not touch grading.
- **Very long edge/verdict** → the back's `ScrollView` handles overflow; front
  height is unaffected (measured before flip).
- **Convergence absent but edge present** → render THE EDGE, omit the
  `CONVERGENCE · RISK` row if both are nil.

## Testing / verification

SwiftUI views in this project are verified by building and visual inspection
(no unit-test harness for views). Verification steps:
1. Project builds clean (matches the "builds clean" memory note for Props Hub).
2. A prop with full structured `analysis` flips to the structured back with all
   sections.
3. A prop with unlabeled/short analysis flips to the fallback back (no blank
   sections).
4. A TD pick flips to the fallback back.
5. Slate/top-plays, table view, and Home view still open the modal.
6. Flip animation, height expansion, and accent color match the game-pick flip.

The parser (`analysisSections`) is pure and string-only — it is the one piece
worth a lightweight unit check if/when a test target exists.

## Files touched

- `ios/GaryApp/Models.swift` — add `PropAnalysisSections` + `PropPick.analysisSections`; lift `cleanAnalysis` into a shared helper.
- `ios/GaryApp/Views.swift` — add `FlippablePropCard` + `PropCardBack`; change one call site (3694).
