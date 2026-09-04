# NCAAF Picks Page Parity — Design Spec

**Date:** 2026-09-04
**Origin:** Founder, Sep 3: "NCAAF does not match NFL when it comes to what is under The Pick on The Picks Page. That needs to be 100% the same as NFL. Every design, each section." Only the words and the big-number categories may differ. Sep 4 GO: "you can just pick all that, I trust you as co-founder"; "NCAAF doesn't need fantasy."

## Finding

The front end is already one view. `FootballGameIntelView` mounts the same sections in the same order for NFL and NCAAF (THE QUARTERBACKS, THE NEWS, THE BIG NUMBERS, THE SERIES, PLAYER INTEL, AVAILABILITY, MORE INTEL, THE SWEAT). The only college branches are the accent color and the tale-of-tape token list. College looks thinner because the lanes that feed those sections are NFL-only and every module hides itself without evidence.

Aug 29 (the real Week 0 Saturday): NCAAF wrote 7 row kinds vs NFL's 16; zero `quarterback`, zero `injury`, zero standings rows, zero player packs.

## What we are building (backend, NCAAF-owned files — league isolation law)

| Section | New NCAAF source |
|---|---|
| THE QUARTERBACKS | `computers/ncaafQbWatch.js` — the passing leader per side from BDL college active roster + player season stats. Prior season allowed only for a quarterback on THIS season's active roster, labeled with the year. Words never say "starts" (college starting-QB policy). |
| AVAILABILITY | `computers/ncaafAvailability.js` — one grounded web search per slate game (Codex sub first, Anthropic server search fallback), strict JSON, every name validated against the BDL active roster of the named side; unmatched names dropped. Position from the roster, never the model. Cap 4 per game, worst status first. |
| Standings lanes (streak / site split / conference game) | `computers/ncaafStandings.js` + `ballDontLieService.getNcaafStandings(season, conferenceId)` — per-conference BDL standings for the slate's conferences; streak from the team's final games. |
| PLAYER INTEL | `insights/ncaafPlayerInsightCards.js` — the NFL pack contents: season line, LAST N log with opponent and home/road from the team's game index, HOME/ROAD splits, props from the day's `prop_picks` NCAAF entries. Roster-verified prior-season baseline in Week 1, labeled. |
| Fantasy | REMOVED for NCAAF: `ncaafFantasyEdges.js` deleted, its tests deleted, Hub FANTASY scope hidden on the NCAAF desk. |

Practice report stays NFL-only (the college game has no league ledger). The shared team-box lanes are untouched.

## Guardrails

- No `if (ncaaf)` branch inside an NFL file. Each college lane is its own file, registered only in `NCAAF_COMPUTERS`; NFL lanes stay untouched.
- A failed fetch or a failed search is `[]` with a warning, never a fabricated empty report.
- Prior-season numbers only for players on the current active roster, always labeled with the season.
- No new iOS section code; the page contract is unchanged.
