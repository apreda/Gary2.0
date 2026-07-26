# THE BETTOR'S BRIEF — everything a professional bettor knows before first pitch

**Date:** July 26, 2026
**What this is:** the founder's requirement — "a plan that details every single thing a pro sports betting human would and could know" — written as a complete taxonomy, each item mapped to its lane in the new system. Coverage was mined from the old research assistant's full question inventory (NBA's 10-factor walk, the deleted 17→8-factor MLB walk, the founder's old commits); **every implementation is new — nothing textual is reused.**

**The three lanes.** Every item a bettor knows arrives one of three ways, and the lane discipline is the design:
- **COMPUTED** — derivable from data we already hold (BDL, Savant, MLB Stats API, our own recaps/season index). Becomes a permanent desk section. Zero LLM.
- **SEARCHED** — narrative the world wrote (storylines, quotes, reputation). Web search as desk input, date-anchored, facts/attributed-narrative only.
- **JUDGMENT** — conclusions (is this a trap? does he bounce back? does the style matchup favor them?). Deliberately NEVER fed to Gary. The desk carries the ingredients; the brain owns the call. Feeding conclusions is the old system's disease.

A fourth status exists: **DECISION** — items needing a founder call (source, doctrine, or standing rule).

---

## 1. The market
| Item | Status | Lane |
|---|---|---|
| Every book's ML + RL prices | ✓ on desk (THE BOARD, outlier-filtered) | COMPUTED |
| Totals on the board | not offered (product: game picks = ML/RL) | — |
| Line movement / opening vs current | **DECISION** — founder standing NO (Jul era); restate or revisit | — |
| Public betting percentages / consensus | **MISSING — DECISION**: no data source today; needs a provider choice if wanted | — |
| Trap awareness (see §10) | ingredients on desk; labels never | JUDGMENT |

## 2. Stakes & schedule situation
| Item | Status | Lane |
|---|---|---|
| Records, division position, GB, seed, streak | ✓ (THE STAKES) | COMPUTED |
| Trade deadline proximity | ✓ (THE STAKES) | COMPUTED |
| Roster moves last 7 days | ✓ (shelf) | COMPUTED |
| Series position (game N of M), series score, last meeting | ✓ (SERIES STATE) | COMPUTED |
| Homestand/trip position, 7-day load, day-after-night | ✓ (SCHEDULE SHAPE) | COMPUTED |
| Record after a loss / after a 5+ blowout / after a win / series finales / after off day | ✓ NEW today (SITUATIONAL RECORDS) | COMPUTED |
| Getaway-day flag (travel game) | PARTIAL — schedule shape shows trip position; explicit getaway flag = small add | COMPUTED (build) |

## 3. The pitchers
| Item | Status | Lane |
|---|---|---|
| Season line, last-3 starts w/ per-start detail, career vs opponent, arsenal velocity, platoon allowed, contact quality | ✓ (PROBABLE PITCHERS) | COMPUTED |
| Per-pitch usage/whiff/chase/xwOBA/BA | ✓ NEW today (SP PITCH TYPES) | COMPUTED |
| Venue + day/night splits | ✓ (xStats/desk) | COMPUTED |
| Workload trend / innings pattern | PARTIAL — last-3 IP visible; season IP-per-start trend = small add | COMPUTED (build) |
| "Needs a bounce-back" psychology, mechanics reports, velocity chatter | ingredients: last-3 lines (computed) + beat-writer reports | SEARCHED + JUDGMENT |
| Catcher pairing (framing/arm behind tonight's SP) | fetcher exists (MLB_CATCHER_DEFENSE) — port | COMPUTED (build) |

## 4. Lineups & hitting
| Item | Status | Lane |
|---|---|---|
| Confirmed lineups w/ handedness | ✓ (hard gate) | COMPUTED |
| Per-hitter L7/L15 form | ✓ | COMPUTED |
| Hitter L/R splits | ✓ NEW today | COMPUTED |
| Hitters vs pitch types (w/ PA samples) | ✓ NEW today | COMPUTED |
| Batter vs pitcher career | ✓ NEW today | COMPUTED |
| RISP / situational hitting | fetcher exists (MLB_RISP_SITUATIONAL) — port | COMPUTED (build) |
| Statcast contact quality (team/key hitters) | ✓ (xStats) | COMPUTED |
| Who's hot THIS SERIES | ✓ NEW today (per-player series aggregates) | COMPUTED |
| Team record without each currently-injured key player | ✓ NEW today (WITHOUT KEY PLAYERS) | COMPUTED |

## 5. The bullpens
| Item | Status | Lane |
|---|---|---|
| Last-3-games per-appearance usage + pitch counts | ✓ | COMPUTED |
| Closer/high-leverage arms: who they are, current form | fetcher exists (MLB_CLOSER_RELIEVER_STATS) — port | COMPUTED (build) |
| Season workload context | fetcher exists (MLB_BULLPEN_WORKLOAD) — port | COMPUTED (build) |
| "Who is actually available tonight" | JUDGMENT from usage lines (never labeled by us) | JUDGMENT |

## 6. Defense & run prevention
| Item | Status | Lane |
|---|---|---|
| Team fielding % / errors | ✓ (season stats) | COMPUTED |
| Team defense quality (DRS/OAA) | fetcher exists (MLB_TEAM_DEFENSE) — port | COMPUTED (build) |
| Catcher framing/arm + opponent SB threat | fetcher exists — port (see §3) | COMPUTED (build) |

## 7. The ballpark & conditions
| Item | Status | Lane |
|---|---|---|
| Roof/weather/wind/temp for tonight | ✓ (header + WORLD) | COMPUTED/SEARCHED |
| What THIS park does — run/HR environment, dimensions, quirks, elevation | fetcher exists (MLB_PARK_FACTORS) — port + verify source quality; if thin, **DECISION**: adopt a curated parks dataset (checked-in, founder-approved once) | COMPUTED (build) |
| Wind × park interaction ("out to LF at Wrigley") | ingredients (wind + park); conclusion is Gary's | JUDGMENT |

## 8. The narrative layer (the fan's knowledge)
| Item | Status | Lane |
|---|---|---|
| Same-day hard news (scratches, moves, weather) | ✓ (WORLD, OpenAI search) | SEARCHED |
| Team storylines / momentum narratives / media focus | ✓ NEW today (STORYLINES search) | SEARCHED |
| Post-game comments from last night (managers, players) | **build**: extend storylines query to explicitly pull post-game quotes | SEARCHED (build) |
| Player storylines (contract year, trade rumors, milestone chases, slump narratives) | PARTIAL via storylines; add explicit player-storyline language to the query | SEARCHED (build) |
| Team identity/reputation — "how they win," style as the world talks about it | two halves: computed style profile (HR share of runs, SB volume, BB rate, GO/AO, bullpen usage share — team fingerprint from season stats) + searched reputation | COMPUTED (build) + SEARCHED |
| Last game as a STORY, both teams | ✓ NEW today (our own recap rows) | COMPUTED |

## 9. Psychology & spots
| Item | Status | Lane |
|---|---|---|
| Bounce-back spot after embarrassment | ingredients ✓ (last game story + situational records) | JUDGMENT |
| Letdown after sweep/emotional win | ingredients ✓ (series state + last-game story) | JUDGMENT |
| Lookahead/sandwich spot (marquee series next) | PARTIAL — upcoming games fetched for series-N-of-M; add "next series vs X starting tomorrow" line | COMPUTED (build) |
| Revenge spots (recent trades, ex-teams, prior playoff exits) | roster moves ✓ + storylines search | SEARCHED + JUDGMENT |
| Must-win pressure (elimination math, seed races) | stakes ✓ | JUDGMENT |

## 10. Traps — the founder's named item
A "trap" is a conclusion, not a data field: a line that looks free because the visible story points one way while the situation points the other. The classic taxonomy (lookahead spot, letdown spot, public darling inflated by narrative, too-good-to-be-true number, division dog in a rivalry, getaway-day lineup softening, ace-priced-at-memory-not-form): **every ingredient is a desk item above** — schedule spots (§2, §9), narrative vs form gaps (§8 vs §3-4), price context (§1). Doctrine per the founder's own laws: we do NOT label games as traps (that is Layer 3 / pre-chewing — the exact disease we deleted). The desk guarantees Gary holds every ingredient a trap-spotter uses. **DECISION (optional):** a short founder-authored trap-awareness note in the ask/system is available if wanted — his words, his sign-off, not mine by default.
Research note: verify/extend this taxonomy against current betting literature (founder: "you can google") in a dedicated pass before NFL season.

## 11. Availability truth
Lineups (hard gate) ✓ · IL with [NEW]/[KNOWN]/[SP SCRATCH] tags ✓ · day-of scratches via WORLD search ✓ · without-X season impact ✓ NEW.

## 12. History
Season H2H per-game w/ venue split ✓ · prior 3 seasons H2H ✓ · BvP careers ✓ NEW.

---

## Build queue (in order)
1. **Fetcher ports into the desk** (all exist, zero LLM): RISP, TEAM_DEFENSE, CATCHER_DEFENSE, CLOSER_RELIEVER_STATS, BULLPEN_WORKLOAD, PARK_FACTORS (+quality check) — the matchup-lab pattern.
2. **Search expansion**: post-game quotes + player storylines folded into the storylines query (one query, richer language).
3. **Computed style fingerprint**: team identity block from season stats (HR share, SB, BB rate, GO/AO, pen usage share).
4. **Small computes**: getaway flag, next-series-preview line, SP innings-trend.
5. **DECISIONS for the founder**: park dataset adoption (if the fetcher is thin) · public-percentage source (if ever) · line movement (standing NO — confirm) · optional founder-authored trap note.

## What stays out, on purpose
Pre-chewed conclusions of any kind: trap labels, "this is a bounce-back spot," style-matchup verdicts, weighted factor scores. The desk is complete; the judgment is Gary's. That is the system.
