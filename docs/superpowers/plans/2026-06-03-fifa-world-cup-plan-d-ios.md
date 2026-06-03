# FIFA World Cup — Plan D: iOS WC Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans / direct execution. Swift is verified by `xcodebuild`, not unit tests — each task ends with a compile check.

**Goal:** Render stored World Cup picks in the iOS app under a dedicated **`WC`** lane — a new `Sport` case, 3-way + **Draw** pick display, group/stage context, soccer Tale-of-Tape rows, and W/L results — without reusing the dormant club-football `.epl` lane.

**Architecture:** Add `Sport.worldCup` ("WC") with its own icon/color/`isBeta`; teach the three `effectiveLeague` resolvers to map `wc` / `world cup` / `soccer_world_cup` → `"WC"`; add the soccer `StatValues` properties + `getValue` token cases the Tale of Tape needs; render the 3-way price + Draw selection on the pick card. Backend stores `league: 'WC'` (Plan B `config.name`) and `soccer_three_way_ml` (Plan B).

**Tech Stack:** Swift/SwiftUI (`ios/GaryApp`). Verified with `xcodebuild`. Depends on **Plan B** (stored pick shape).

**Spec:** `docs/superpowers/specs/2026-06-03-fifa-world-cup-sport-design.md` Layer 9.

---

## Verified anchors

- `ios/GaryApp/Views.swift:2045` `enum Sport: String, CaseIterable` — `.epl = "EPL"` at 2054; icon switch (`.epl → "soccerball"`) at 2068; color (`.epl → #8B5CF6`) at 2084; `isBeta` (`.epl → true`) at 2112; another icon switch returning `"soccerball"` for `"EPL"` at 11697.
- `ios/GaryApp/Models.swift` — `effectiveLeague` in three structs at 939, 1019, 1091; each has `if normalized.contains("epl") || ... { return "EPL" }`. Prop-type inference for soccer at 1134-1136.
- `ios/GaryApp/SupabaseAPI.swift:187` `struct SportRecord`; icon switch `case "EPL": return "soccerball"` at 204.

**Identifier contract:** backend `league` = `'WC'`; pick fields `soccer_three_way_ml {home,draw,away}`, `soccer_stage`, `soccer_group`, `type` (`moneyline`|`draw`|`total`|`asian_handicap`).

---

## File Structure (all modifications — no new Swift files)

- `ios/GaryApp/Views.swift` — `Sport` enum case + icon/color/isBeta + the 11697 icon switch + pick-card 3-way/Draw rendering + soccer Tale-of-Tape display names.
- `ios/GaryApp/Models.swift` — three `effectiveLeague` resolvers + `StatValues` soccer properties + `getValue` token cases + `GaryPick` 3-way fields.
- `ios/GaryApp/SupabaseAPI.swift` — `SportRecord` icon.

---

## Task 1: Add the `Sport.worldCup` case + branding

**Files:** `ios/GaryApp/Views.swift` (2045-2129, 11697)

- [ ] **Step 1: Add the enum case + branding**

In `enum Sport` (after `case epl = "EPL"`, line 2054), add:
```swift
    case worldCup = "WC"
```
- Icon switch (≈2068, after `.epl`): `case .worldCup: return "trophy.fill"`
- Color switch (≈2084, after `.epl`): `case .worldCup: return Color(hex: "#16A34A")   // World Cup green`
- `isBeta` (≈2112, after `.epl`): `case .worldCup: return true`
- Second icon switch (≈11697, after `case "EPL"`): `case "WC": return "trophy.fill"`

- [ ] **Step 2: Ensure `Sport.from(league:)` resolves "WC"**

Find `Sport.from(league:)` (used at Views.swift:6679). Since the raw value of `.worldCup` is `"WC"` and backend stores `league: 'WC'`, `Sport(rawValue:)` resolves it. Confirm `from(league:)` upper/lowercases consistently; if it normalizes, add a `"wc"`/`"world cup"` → `.worldCup` mapping alongside the existing cases.

- [ ] **Step 3: Compile check**

Run (per project convention; uses external derivedDataPath to avoid disk pressure):
```bash
cd ios && xcodebuild -scheme GaryApp -destination 'generic/platform=iOS Simulator' -derivedDataPath /Volumes/KINGSTON/DerivedData build 2>&1 | tail -15
```
Expected: `** BUILD SUCCEEDED **`. (If `/Volumes/KINGSTON` is unavailable, use a local `-derivedDataPath ./build/DD`.)

- [ ] **Step 4: Commit**

```bash
git add ios/GaryApp/Views.swift
git commit -m "feat(wc): iOS Sport.worldCup case + branding (green, trophy, beta)"
```

---

## Task 2: `effectiveLeague` → "WC" in all three structs

**Files:** `ios/GaryApp/Models.swift` (939-952, 1019-1029, 1091-1101, 1134-1136)

- [ ] **Step 1: Map soccer World Cup strings to "WC"**

In each of the three `effectiveLeague` resolvers (after the existing `epl`/`soccer_epl`/`premier` → `"EPL"` line), add a World Cup check **before** the EPL check so a World Cup pick is never mislabeled EPL:
```swift
        if normalized.contains("world_cup") || normalized.contains("worldcup") || normalized == "wc" || normalized.contains("soccer_world_cup") { return "WC" }
```
Keep the existing EPL line intact for any real EPL data.

- [ ] **Step 2: Prop inference (1134-1136)** — N/A for this build (no props), leave unchanged.

- [ ] **Step 3: Compile check**

Run the same `xcodebuild ... build` as Task 1 Step 3. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add ios/GaryApp/Models.swift
git commit -m "feat(wc): map World Cup league strings to WC in effectiveLeague"
```

---

## Task 3: `StatValues` soccer properties + `getValue` cases

**Files:** `ios/GaryApp/Models.swift` (`StatValues` struct + `getValue(for:)`)

- [ ] **Step 1: Add optional soccer properties**

In the `StatValues` struct, add (mirroring existing optional Double/String stat properties + their `CodingKeys`):
```swift
    var goalsFor: Double?            // goals_for
    var goalsAgainst: Double?        // goals_against
    var expectedGoals: Double?       // expected_goals (xG)
    var expectedGoalsAgainst: Double?// expected_goals_against
    var possessionPct: Double?       // possession_pct
    var shotsOnTarget: Double?       // shots_on_target
    var bigChances: Double?          // big_chances
    var passAccuracy: Double?        // pass_accuracy
    var corners: Double?             // corners
```
Add matching `CodingKeys` entries (snake_case) so they decode from the stored Tale-of-Tape stat payload (the keys produced by `tokenToIosKey` in Plan B Task 5).

- [ ] **Step 2: Add `getValue(for:)` token cases**

In `getValue(for token: String)`, add cases mirroring the existing MLB/NHL pattern, returning formatted strings:
```swift
        case "GOALS_FOR", "goals_for": return goalsFor.map { String(format: "%.2f", $0) } ?? "—"
        case "GOALS_AGAINST", "goals_against": return goalsAgainst.map { String(format: "%.2f", $0) } ?? "—"
        case "XG", "expected_goals": return expectedGoals.map { String(format: "%.2f", $0) } ?? "—"
        case "XGA", "expected_goals_against": return expectedGoalsAgainst.map { String(format: "%.2f", $0) } ?? "—"
        case "POSSESSION_PCT", "possession_pct": return possessionPct.map { String(format: "%.0f%%", $0) } ?? "—"
        case "SHOTS_ON_TARGET", "shots_on_target": return shotsOnTarget.map { String(format: "%.1f", $0) } ?? "—"
        case "BIG_CHANCES", "big_chances": return bigChances.map { String(format: "%.1f", $0) } ?? "—"
        case "PASS_ACCURACY", "pass_accuracy": return passAccuracy.map { String(format: "%.0f%%", $0) } ?? "—"
        case "CORNERS", "corners": return corners.map { String(format: "%.1f", $0) } ?? "—"
```

- [ ] **Step 3: Compile check** — `xcodebuild ... build`, expect `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add ios/GaryApp/Models.swift
git commit -m "feat(wc): StatValues soccer stats + getValue token cases"
```

---

## Task 4: Pick card — 3-way price + Draw selection + stage context

**Files:** `ios/GaryApp/Views.swift` (pick card front/back — `FlippablePickCard`/`PickCardBack`), `ios/GaryApp/Models.swift` (`GaryPick` 3-way fields)

- [ ] **Step 1: Add `GaryPick` soccer fields**

In `GaryPick` (Models.swift), add optional fields + CodingKeys: `soccerThreeWayMl` (a small struct `{ home, draw, away: Double? }` or `[String: Double]`), `soccerStage: String?` (`soccer_stage`), `soccerGroup: String?` (`soccer_group`), `soccerRound: String?` (`soccer_round`). Decode leniently (all optional).

- [ ] **Step 2: Render Draw + 3-way on the card**

On the pick card, when `Sport.from(league: pick.league) == .worldCup`:
- Show the pick selection text as-is (it may literally be `"Draw"` — render it as a first-class outcome, e.g. a centered "DRAW" chip, not a team name).
- Below the matchup, show a compact 3-way line from `soccerThreeWayMl`: `H {home} · X {draw} · A {away}`.
- Show stage/group context (e.g. "Group A · Group Stage" or "Round of 16") from `soccerStage`/`soccerGroup`/`soccerRound`.
Reuse the existing card layout components; gate the soccer-specific row with the `.worldCup` check so other sports are unaffected.

- [ ] **Step 3: Compile check** — `xcodebuild ... build`, expect `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add ios/GaryApp/Views.swift ios/GaryApp/Models.swift
git commit -m "feat(wc): pick card renders 3-way price, Draw selection, stage context"
```

---

## Task 5: SportRecord icon + final build/run verification

**Files:** `ios/GaryApp/SupabaseAPI.swift:204`

- [ ] **Step 1: Add WC to SportRecord icon switch**

After `case "EPL": return "soccerball"` (line 204), add:
```swift
            case "WC": return "trophy.fill"
```

- [ ] **Step 2: Full build**

Run `cd ios && xcodebuild -scheme GaryApp -destination 'generic/platform=iOS Simulator' -derivedDataPath /Volumes/KINGSTON/DerivedData build 2>&1 | tail -15`.
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Visual smoke (optional, when a WC pick exists)**

When a World Cup pick is in `test_daily_picks`/`daily_picks`, launch the app in the simulator and confirm: the pick appears under a green "WC" beta lane, Draw picks show a DRAW chip, the 3-way price renders, and the Tale of Tape shows soccer rows. (Use the project's run/screenshot skill.)

- [ ] **Step 4: Commit**

```bash
git add ios/GaryApp/SupabaseAPI.swift
git commit -m "feat(wc): SportRecord WC icon; iOS WC lane complete"
```

---

## Self-Review (completed)

- **Spec coverage:** Layer 9 — dedicated `WC` lane (not `.epl`); 3-way + Draw rendering; stage/group context; soccer Tale-of-Tape stats; results via `effectiveLeague` → "WC". ✓
- **Reuse decision:** new `Sport.worldCup` case; `effectiveLeague` World-Cup check ordered BEFORE the EPL check so picks are never mislabeled. ✓
- **Placeholder scan:** exact verified anchors; Tasks 3-4 reference mirroring existing StatValues/card patterns (the Swift files are large — the executor adds CodingKeys/layout following the established pattern, which is specified, not blank). Verification is `xcodebuild` per task. ✓

## Done

Plans A (built), B, C, D complete. Build order: A ✅ → B → C → D. Phase 2/3 (totals+AH activation, knockout `to_advance` generation) are tracked in the spec for after group-stage launch.
