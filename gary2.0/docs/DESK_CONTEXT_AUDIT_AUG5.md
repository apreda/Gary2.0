# Desk Context Audit — Aug 5, 2026

Founder-ordered ("let's do a review of every piece of data and context we give Gary"),
anchored by two live incidents he called from memory, both confirmed against stored
`pick_desks` snapshots. Companion to the blind split (era `850ff3bd754b`): the blind
read makes the desk the whole ballgame — whatever the desk misstates, the read inherits.

## Incident 1 — Luzardo: a lookup failure printed as a fact

Jul 29 and Aug 4 desks (Phillies games) both stated:

```
Phillies: Jesús Luzardo — no 2026 starts yet
MLB_PITCH_TYPES_SP: Phillies: Jesús Luzardo — not found in BDL season stats
vs Jesús Luzardo (TODAY'S SP): no career history in source
```

Luzardo had ~22 starts and a 1.08 July ERA (which THE WORLD said, two sections up).
Root cause: the probable-pitcher feed sometimes carries the accent ("Jesús") and BDL
doesn't. Three independent name-match sites are all diacritic-blind:

| Site | Match rule | What it prints on miss |
|---|---|---|
| `scoutReport/sports/mlb.js:365` `findBdlPitcherByName` | strips `.-'` only, exact equality | **"no 2026 starts yet"** — a false negative asserted as fact |
| `statRouters/mlbFetchers.js:450` pitch-types SP resolve | plain lowercase substring | "not found in BDL season stats" |
| `statRouters/mlbFetchers.js:2063` BvP `matchesSp` | plain lowercase equality | "no career history in source" |

On days the feed spells him "Jesus" everything matches — which is why it's intermittent
and why it survived. Aug 4 Gary took Nationals +1.5 against a top-10 arm whose lab was
empty. This class violates the prevent-fabrication doctrine from the desk side: the
data layer, not the model, generated the false statement.

## Incident 2 — Bieber: the aggregate hides its own composition

Aug 3 desk season line: `Shane Bieber — 2-2, 5.74 ERA, 1.63 WHIP, 22 K, 31.1 IP
(7 2026 starts)`. Inside that 31.1 IP sits Jul 28: 0.2 IP, 6 BB (career-worst).
What the desk does and doesn't carry today:

- **Carries**: starts count on the season line; THE ARC last-6 start-by-start ledger
  (id-keyed, immune to the name bug); recent-window arithmetic; month decomposition;
  career baseline; venue split (IP-gated).
- **Doesn't carry**: IL-stint visibility. `PITCHER SAMPLE CONTEXT` flags team changes,
  home debuts, and rookie-season concentration — not IL returns. Bieber's June
  activation reached Gary only if THE WORLD's news happened to mention it.
  `firstStartDate` is already stashed (`pitcherArcData`) but no gap detector renders.

## Full section inventory (Aug 4 Angels @ Orioles desk, 706 lines)

Recency-scale surface (~255 lines): THE WORLD 63, RECENT FORM (L1/L3/L5/L10) 60,
SERIES STATE 44, LINEUP RECENT BATTING (7/15d) 34, PROBABLE PITCHERS + ARC 24,
ROSTER MOVES 17, BULLPEN WORKLOAD 10, LAST GAME STORY 7, SCHEDULE SHAPE 8, REST 3.

Season/career-scale surface (~340 lines): HITTER L/R SPLITS 90, BATTER vs PITCHER 61,
RISP 50, DIVISION STANDINGS 43, BULLPEN season 26, CONFIRMED LINEUPS 25 (neutral),
CATCHERS 15, SP PITCH TYPES 15, HITTERS vs PITCH TYPES 14, xSTATS 14, TEAM DEFENSE 8,
WITHOUT KEY PLAYERS 8, SITUATIONAL RECORDS 4, TEAM SEASON STATS 4.

So the split is roughly 45/55 — not as season-skewed as feared, and the founder's
"learn from last night / the series" context already exists (SERIES STATE + LAST GAME
STORY + WORLD). The sharper issue: the three fattest lab sections (L/R splits 90,
BvP 61, RISP 50 = 201 lines) are career/season aggregates whose individual rows run
on tiny samples — BvP rows of 2–14 ABs render with the same visual weight as a
600-PA season line. ABs are printed, but nothing marks 5 AB as noise vs 60 AB as
signal, and no N-gating suppresses the pure-noise rows.

Also: `BETTING CONTEXT` (the scout's own odds block) was found riding the shelf —
already stripped same-day (commit `aaa550fd`) since it broke the blind read.
`DIVISION STANDINGS` at 43 lines duplicates THE STAKES' function at 5 and is
explicitly long-horizon standing (the founder's own example of not-tonight data) —
but it exists by a Jul 26 founder call (league-wide state so stale training-data fame
self-corrects). Flagged, his to re-decide, not touched.

## Proposed fixes — each needs founder GO, none applied

- **F1 (urgent, small): diacritic-fold every name-match site.** One shared
  normalize (`NFD` + strip combining marks + existing punctuation strip) used by all
  three sites. And re-phrase the false negative: "no 2026 starts yet" may only print
  when the lookup SUCCEEDED with `gs=0`; a failed join must say
  "season stats unavailable (name mismatch vs source)" — never assert a negative
  the data didn't establish.
- **F2: sample-size honesty in the lab.** Every BvP/split/RISP row already has N —
  add gating: drop or de-emphasize rows under a floor (e.g. BvP under ~10 AB prints
  under a "small sample" subline or not at all). Data-side presentation, no steering.
  Founder picks the floor philosophy.
- **F3: IL-gap line in PITCHER SAMPLE CONTEXT.** From the season game log (already
  fetched): detect a ≥21-day gap between starts and render
  "X starts since [date] return; season aggregate includes pre-injury work." Facts
  only, no trend words — same rules as THE ARC.
- **F4 (founder decision, not a bug): DIVISION STANDINGS size.** 43 lines of
  standings vs THE STAKES' 5. Keep (Jul 26 rationale) or trim now that stakes carry
  the point. No recommendation strong enough to push — flagging the duplication.
