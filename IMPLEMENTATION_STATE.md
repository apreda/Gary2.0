# Gary — Implementation State & Reference

> Reference + tech-debt, not a creative brief. This is **how it's built right now** (for lookup) and **the accessibility bar** (run after designing). The thing you read *before* designing is the anti-slop card in `DESIGNER_BRIEFING.md`. Don't mine this file for ideas — it describes the current state, which is allowed to change.

## Tokens (source of truth = code)

Facts live in code; this is just where to find them:
- **Palette:** `GaryColors` (Views.swift) — gold `#C9A227`, silver `#C7CCD6` (prop metal), near-black bg `#08080A`, card fill `#15171C`, inner chip `#1C1F26`. Sport accents: NBA `#3B82F6`, NFL `#22C55E`, NHL `#00A3E0`, NCAAB `#F97316`, NCAAF `#DC2626`, MLB `#2D5A27`, World Cup `#14B8A6`. Results: win `#3FB950`, loss `#E5484D`, push gold.
- **Type:** `GaryFonts` — display `BarlowCondensed-Bold`, body SF Pro (system, for Dynamic Type), data `JetBrainsMono`.
- **Defined-but-unused:** `GaryColors.cardBg` `#121214` + glass-tint constants (cards use `#15171C`/`#1C1F26` + metal hairlines instead); **Inter** is bundled but unused (`GaryFonts.text` → SF Pro per the June 2026 type decision).

## Accessibility — definition of done (non-negotiable)

Run this checklist on every screen before it ships:
- **Dynamic Type:** body copy through `GaryFonts.text` (system) so it scales — no fixed `.system(size:)` for body.
- **Contrast:** body ≥ 4.5:1, large text & UI ≥ 3:1. Tertiary at ~42% white on `#08080A` ≈ 4:1 → **fails AA body**; raise to ≈55%+ or restrict 42% to large text.
- **Min legible size:** 8.5–10pt mono labels are below a comfortable floor — essential labels ≥ 11pt; reserve tiny sizes for non-essential decoration.
- **Reduce Motion:** gate the card flip, Terminal Tape underline slide, and any animated hero on `accessibilityReduceMotion`.
- **VoiceOver:** spoken labels for the base diamond, Terminal Tape, status-bar readout, charts, score strip (e.g. "Bases loaded, 2 outs").
- **Light mode** is a planned goal — don't hard-code dark-only assumptions into new components.

## Current component anatomy (for reference)

**Cards (compact pick & prop rows — the most-seen surface):** `#15171C` matte fill, a single metal hairline (gold = game, silver = prop), black depth shadow (no glow). The pick/call sits in an inner matte `#1C1F26` chip with a metal hairline. Radii 20 (full) / 12 (compact) / 10 (chip). Sport color appears small (eyebrow icon + tinted significance).

**Signature components (terminal surfaces):** Terminal Tape (pinned `GAMES n / PROPS n`, sliding gold underline) · matte pick chip · status-bar header (`REC w-l · win% | n PLAYS LIVE | sport codes`) · Live Score Strip + base diamond (gold score, inning, bases fill gold, outs dots).

**Game pick card** — front: eyebrow (sport icon + significance + time, or W/L/P + final score) → matchup `Away @ Home` (picked side bright) → pick as team abbreviation + spread/ML + odds (gold, in the chip) → chevron; live games get the Live Score Strip above. Back (flip): Gary's Lean · Gary's Take · Tale of Tape · sportsbook odds.

**Prop pick card** — silver twin: eyebrow (league + time) → player → team · market → call (OVER/UNDER + line, silver, in the chip) → Gary's Lean. Green/red OVER/UNDER coding only in the detail popup.

**DFS card** (product, not a tab): lineup table · total salary · ceiling projection · Gary's Notes · pivots.

## Current screens (tabs)

0 Home (*front door*) · 1 Winners "Gary's Best Bets" (*terminal*, GAMES/PROPS Terminal Tape) · 2 Gary (Hub ⟷ Talk to Gary, underline-tab) · 3 Picks (*terminal*, per-game carousel) · 4 Billfold (results). Settings is a modal. App version 2.12.

## Known divergences / to-dos
- **Full-card border:** `PickCardMobile` still wears a 2.5px sport-accent gradient border from the old system (the one place sport color is a full outline). Briefing rule = gold hairline; bring it down to match.
- **Tracking:** several mono eyebrows still use `.tracking(1)`; reduce on warm surfaces or convert to sentence-case sub-heads.
- **`GaryMadness.imageset`** exists but is unused (bracket feature removed May 2026) — safe to delete on a cleanup pass.
