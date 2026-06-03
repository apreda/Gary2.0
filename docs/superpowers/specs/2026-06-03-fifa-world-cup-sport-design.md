# 2026 FIFA World Cup — New Sport for Gary 2.0

**Date:** 2026-06-03
**Status:** Approved design → implementation plan next
**Author:** Gary 2.0 / Claude
**Kickoff deadline:** 2026-06-11 (Mexico vs South Africa, Estadio Azteca) — 8 days out

---

## 1. Summary

Add the 2026 FIFA World Cup as a new, independently-isolated sport (`soccer_world_cup`, short name `WC`) to Gary 2.0, following the MLB integration template end-to-end. **Game picks only** — no props, no DFS. Intel (Flash research / scout report) and pick-card-back breakdowns work the same as every other sport.

The defining difference from all six existing sports: soccer is a **3-way market** (Home / Draw / Away), low-scoring (Poisson-ish goals), and runs as a **tournament** (group stage → knockout with extra time / penalties) rather than a league season. The BDL FIFA World Cup API supplies all the structured data needed to handle this richly.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Products | **Game picks only** (no props, no DFS) |
| Data source | **BDL FIFA World Cup API** (`/fifa/worldcup/v1/*`), GOAT tier — access confirmed on this key |
| Draw outcome | **Draw is a pickable selection** — Gary weighs Home/Draw/Away |
| Markets | **3-way ML + Total Goals + Asian Handicap** — all code paths built |
| Live-data reality | Only **3-way ML** odds are populated for 2026 today; `spread`/`total` are `null` in the feed |
| Phasing | 3-way ML ships for **June 11**; Totals + Asian handicap **auto-activate** when books post those lines |
| Knockout grading | 3-way ML & totals settle on **90′ regulation** (standard book rule): 1-1 after 90 in a knockout grades as **Draw**, even if a team advances on penalties |
| Knockout markets | Knockout matches get **both** a 3-way ML pick (90′) **and** a "To Advance" pick (2-way, incl. ET/penalties) — rendered as **two separate pick cards**. Infrastructure (bet-type enum + multi-pick-per-match + advance-result grading) is built now; advance **pick generation + odds source** is a knockout-phase plan (knockouts start ~2026-06-28, after group-stage launch). Per-match advance odds are **not** in the BDL feed — sourced via grounding or derived from the 3-way ML; decided at knockout-phase. |
| Sport identity | **New dedicated `WC` lane** — do NOT reuse the dormant iOS `.epl` (club football) scaffolding |
| Launch flag | `isBeta: true` |
| Intel + card backs | Same architecture as other sports, soccer-specific content |

## 3. The FIFA World Cup API surface (grounding)

Base: `https://api.balldontlie.io/fifa/worldcup/v1/` · Auth: `Authorization: <BALLDONTLIE_API_KEY>` (existing key) · Seasons: `2018, 2022, 2026` (default 2026) · Cursor pagination (`meta.next_cursor`) · GOAT = 600 req/min.

| Endpoint | Tier | Use |
|---|---|---|
| `teams` | Free | Participating nations (id, name, abbreviation, country_code, confederation) |
| `stadiums` | Free | Venue, city, country, capacity, lat/long (altitude/heat context) |
| `group_standings` | ALL-STAR+ | Group table: position, played/W/D/L, GF/GA/GD, points (must-win / tiebreaker context) |
| `matches` | GOAT | Schedule + results: datetime, status, stage, group, stadium, home/away team (null if TBD), `home_team_source`/`away_team_source` (knockout bracket resolution), `home_score`/`away_score` (regulation), `*_penalties`, half scores, `extra_time_*`, `has_extra_time`, `has_penalty_shootout`, `round_name`, formations, referee, managers |
| `odds` | GOAT | `moneyline_{home,away,draw}_odds`, `spread_{home,away}_value/odds`, `total_value/over/under_odds`. Vendors: draftkings, fanduel, fanatics, betmgm, betrivers, caesars |
| `odds/futures` | GOAT | Outright winner, group winner, qualify-from-group, reach-QF/SF/final, etc. (intel) |
| `players` | GOAT | Bio (position, DOB, country, height, jersey) |
| `rosters` | GOAT | Per-tournament squad + cumulative stats (apps, mins, goals, assists, cards, avg_rating) |
| `match_lineups` | GOAT | Match-day squad (starter/sub, shirt #, position, formation) |
| `match_events` | GOAT | Goals, cards, subs, shootout kicks (yellow-card accumulation tracking) |
| `player_match_stats` | GOAT | Per-player: rating, mins, xG, xA, goals, assists, SoT, passes, key passes, tackles, duels, GK saves |
| `team_match_stats` | GOAT | Per-team: possession%, xG, big chances, shots (total/on/off/blocked/in/out box), corners, offsides, fouls, cards, passes, crosses, tackles, interceptions, clearances, saves, duels, dribbles |
| `match_shots` | GOAT | Shot map: type, situation, body_part, xg, xgot, coords |
| `match_momentum` | GOAT | Per-minute attack momentum |
| `match_best_players` | GOAT | Top-rated XI + MOTM |
| `match_avg_positions` | GOAT | Heatmap centroids |
| `match_team_form` | GOAT | Pre-match form summary (avg rating, group position, recent points) |

**Live verification (2026-06-03):** `teams`/`matches`/`odds`/`group_standings` all return HTTP 200 on the configured key. 2026 schedule is final (opener match id 1 = Mexico vs South Africa, 2026-06-11T19:00Z, Estadio Azteca, Group A). Odds updating in real time (sample: match 11 home +270 / draw +180 / away +130; match 13 home -1250 / draw +950 / away +2200). `spread_*` and `total_*` are `null` for all 2026 rows today.

**Implications:**
- 3-way moneyline with a first-class `draw` field — the audit's biggest fear is a non-issue.
- xG at team, player, and shot level — the soccer efficiency proxy is built in.
- Tournament structure fully modeled (stage/group/round/knockout sources, ET & penalty fields) — grading and "advancement" context are clean.
- Historical 2018 + 2022 editions — usable for form, H2H, and Tale-of-Tape context.
- **No injury endpoint** — injuries & suspensions come from Flash grounding (as the user specified: "intel same as the other sports"). Yellow-card-accumulation suspensions are derivable from `match_events`.
- Extreme prices (-1250 / +2200) **confirm** the `responseParser.js` ML odds caps (`-149`, `-200`) must be bypassed for soccer.

## 4. Architecture — 10 layers

Template throughout: **MLB** (newest sport, May 2026). Anchors below reference the codebase map in the run on 2026-06-03. `gary2.0/` is the backend root; `ios/` is the app.

### Layer 1 — Data service (NEW)
- **ADD** `gary2.0/src/services/fifaWorldCupService.js` — standalone service (pattern: `mlbStatsApiService.js` + `baseballSavantService.js`). Raw HTTPS to `/fifa/worldcup/v1/*` (SDK has no FIFA client), cursor pagination, tiered caching (long TTL teams/standings; short odds/lineups; real-time live scores). Country-name ↔ `team_id` resolver. Multi-vendor odds → consensus/preferred-book selection.
- Methods: `getTeams`, `getStadiums`, `getGroupStandings`, `getMatchesForDate`, `getMatches`, `getOdds`, `getFutures`, `getRosters`, `getPlayers`, `getMatchLineups`, `getTeamMatchStats`, `getPlayerMatchStats`, `getMatchShots`, `getMatchTeamForm`, `getMatchEvents`, `getMatchBestPlayers`.
- **Rationale:** keeps soccer fully isolated; never touches `ballDontLieService.js` shared core that the 6 existing sports depend on.

### Layer 2 — Tokens & fetchers (NEW + wiring)
- **ADD** `gary2.0/src/services/agentic/tools/statRouters/soccerFetchers.js` — token → fetcher map (pattern: `mlbFetchers.js`).
- **ADD** `SOCCER_TOKENS` to `gary2.0/src/services/agentic/tools/toolDefinitions.js`; register in `ALL_TOKENS_BY_SPORT`.
- **MODIFY** `gary2.0/src/services/agentic/tools/statRouters/index.js` (merge `soccerFetchers`; season detection), `statRouterCommon.js` (`sportToBdlKey`, `normalizeSportName`).
- Tokens: `TEAM_FORM`, `GROUP_STANDINGS`, `RECENT_FORM`, `XG_FOR`, `XG_AGAINST`, `POSSESSION`, `SHOTS`, `SHOTS_ON_TARGET`, `BIG_CHANCES`, `GOALS_FOR`, `GOALS_AGAINST`, `PASS_ACCURACY`, `SET_PIECES` (corners), `DISCIPLINE` (cards/fouls), `H2H`, `KEY_PLAYERS`, `LINEUP_FORMATION`, `GOALKEEPER`.

### Layer 3 — Scout report (NEW + wiring)
- **ADD** `gary2.0/src/services/agentic/scoutReport/sports/soccer.js` (pattern: `sports/mlb.js`).
- **MODIFY** `scoutReport/scoutReportBuilder.js` — add `SOCCER` to `SPORT_BUILDERS`.
- **MODIFY** `scoutReport/shared/taleOfTape.js` — soccer rows block (~13–15 rows): GF/GA, xG/xGA, Win%/Draw%, Possession, Shots/SoT, Big Chances, Pass Acc, Corners, Cards, recent Form, Group position.
- Content: tournament form (across editions), group standings, xG for/against, shots/SoT, possession, big chances, set-piece/discipline, key players, confirmed-vs-uncertain lineup + formation, H2H, venue (incl. **altitude** at Azteca + June/July heat), referee.

### Layer 4 — Constitution (NEW + register) — **Layer-3 compliant**
- **ADD** `gary2.0/src/services/agentic/constitution/soccerConstitution.js` (pattern: `mlbConstitution.js`).
- **MODIFY** `constitution/index.js` — register in `GAME_CONSTITUTIONS` (`SOCCER` + `soccer_world_cup` aliases).
- Awareness (Layer 1/2 only, never Layer 3):
  - 3-way market exists; draw is structural (~25–30%); weigh all three outcomes.
  - Goals are low-variance/Poisson; xG describes *process*, is noisy single-game — never "high xG ⇒ back them."
  - Tournament structure: group (3 matches, must-win math, GD tiebreakers, dead-rubber rotation risk); knockout (ET/penalties; 90′ 3-way still bets).
  - Host/altitude/heat/travel as investigation factors (not point values).
  - Squad rotation & cumulative fatigue on compressed schedule.
  - Injuries **and yellow-card-accumulation suspensions** — conservative; verify via grounding/lineups.
  - No tape access → no formation-exploits-formation speculation; stick to what stats show.
- **Trilateral case prompt:** case-for-Home / case-for-Draw / case-for-Away (extends the existing bilateral pattern).

### Layer 5 — Game-picks pipeline (modify)
- **MODIFY** `gary2.0/src/services/agentic/orchestrator/agentLoop.js` — add `isSOCCERSport` flag; thread `options.sport`; grounding policy (soccer benefits from grounding for injuries/suspensions/lineups).
- **MODIFY** `gary2.0/src/services/agentic/orchestrator/passBuilders.js` — `buildSoccerPass1` (3-way + totals + handicap when present; trilateral case); Pass 2.5 line labels (3-way ML / O/U goals / Asian handicap); Pass 3 bet-type instruction.
- **MODIFY** `gary2.0/src/services/agentic/orchestrator/responseParser.js` — 3-way `detectPickedTeam` (**Draw is a valid selection**); **bypass `-149` / `-200` ML caps for soccer**; parse totals + handicap picks.
- **MODIFY** `gary2.0/src/services/agentic/orchestrator/orchestratorHelpers.js` — `normalizeSportToLeague` + `RESEARCH_BRIEFING_FACTORS` soccer entry.
- **ADD/MODIFY** `spreadEvaluationFactors.js` — `getSoccerEvalFactors` (form/xG/draw/rest factors; "spread" framing replaced by handicap/3-way).

### Layer 6 — Pick schema + storage
- Bet types: `moneyline_3way` (selection ∈ {Home, Draw, Away}), `total_goals` (Over/Under X.5), `asian_handicap` (team ±X), and `to_advance` (2-way knockout market, **enum reserved now**; pick-generation deferred to knockout-phase). The pipeline already supports multiple market picks per match (ML + total can coexist as separate cards), so a 2nd `to_advance` card on a knockout match uses the same mechanism — no new rendering primitive.
- **Storage:** soccer-specific fields are written as **keys inside the `daily_picks` JSONB pick object** — the existing tournament-context pattern (`cfpRound`/`homeSeed` for NCAAF, `homeConference` for NCAAB, `game_id` for MLB). JSONB is schemaless, so **no SQL migration is required** for these: `soccer_three_way_ml {home,draw,away}`, `soccer_competition` ("FIFA World Cup 2026"), `soccer_stage`, `soccer_round`, `soccer_group`, `soccer_match_id` (BDL match id for dedup), `soccer_goal_line`, `soccer_handicap`. Add a migration **only** if a queryable top-level column turns out to be needed (e.g., filtering results by competition) — decide during implementation, don't assume it.
- **MODIFY** `gary2.0/src/services/picksService.js` — write the new soccer keys (mirror where `cfpRound`/`game_id` are written, ~lines 229-244); dedup (`gameAlreadyHasPick`, ~367-381) keyed on `soccer_match_id` + market, allowing one pick **per market per match** (ML + total can coexist, like other sports' ML+spread+total).
- Test runs write to `test_daily_picks` (per CLAUDE.md).

### Layer 7 — Flash research (NEW + wiring)
- **ADD** `SOCCER_FACTORS` in `gary2.0/src/services/agentic/flashInvestigationPrompts.js`.
- **MODIFY** `gary2.0/src/services/agentic/orchestrator/investigationFactors.js` — `INVESTIGATION_FACTORS['soccer_world_cup']` factor→token map.
- **MODIFY** `gary2.0/src/services/agentic/orchestrator/flashAdvisor.js` — sport-label normalization + brand→key mapping.
- Factors: form (across editions), lineup/formation confidence, injuries & suspensions, tournament stakes/must-win, fatigue/rest/travel, weather/heat/altitude, xG trends, set-piece threat, H2H, goalkeeper.

### Layer 8 — Grading (modify)
- **MODIFY** `gary2.0/scripts/run-all-results.js`:
  - `gradeGame` — 3-way ML (Home win / Draw / Away win) and total goals, both computed from the **90′ regulation** score `regHome = first_half_home_score + second_half_home_score`, `regAway = first_half_away_score + second_half_away_score` (NOT `home_score`/`away_score`, which include ET); Asian handicap on the same regulation score (incl. quarter-line splits + draw-no-bet push).
  - **Knockout rule:** ML/totals settle on 90′ regulation; a knockout level after 90′ grades the 3-way ML as **Draw** regardless of the ET/penalty outcome.
  - **`to_advance` grading:** advancing team = leader of `home_score`/`away_score` (already incl. ET); if still level, `home_score_penalties` vs `away_score_penalties`; 2-way W/L. Built now; consumed once advance picks are generated (Phase 3).
  - Pure helpers `getRegulationScore(match)` → `{home, away}` and `getAdvanceResult(match)` → `{teamId, method}|null` live in `fifaWorldCupService.js` (Plan A) and are imported here.
  - `getStatValue` — soccer block (goals, shots, cards, corners) if score-derived grading needs it.
  - Source results from `fifaWorldCupService.getMatches` (status `completed` + scores) — structured, no grounding guesswork.

### Layer 9 — iOS rendering (NEW `WC` lane)
- **MODIFY** `ios/GaryApp/Views.swift` — new `Sport.worldCup` case (flag icon / distinct color; NOT `.epl`); ToT soccer rows + displayName mappings + skipTokens; pick-card front/back render 3-way ML, **Draw** picks, group/stage context.
- **MODIFY** `ios/GaryApp/Models.swift` — StatValues soccer optional properties + `getValue(for:token)` cases; GaryPick 3-way display; `effectiveLeague` maps `soccer_world_cup`/`WC`/`world cup` → WC.
- **MODIFY** `ios/GaryApp/SupabaseAPI.swift` — `SportRecord` icon/color.
- **MODIFY** `gary2.0/scripts/run-agentic-picks.js` — `tokenToIosKey` soccer tokens, `expectedRowCount`, ToT gate.

### Layer 10 — Config / registration
- **MODIFY** `gary2.0/scripts/run-agentic-picks.js` — `SPORT_CONFIG` `{ key:'soccer_world_cup', name:'WC', emoji:'⚽', isBeta:true, ... }`; `--wc`/`--worldcup` flag; help text.
- **MODIFY** `gary2.0/scripts/scheduler.js` — `SPORTS` entry (cron; no `propsScript`, no `dfs`). Date-based fetch with UTC→ET handling (MLB UTC-bleed pattern); multiple matches/day in group stage.

## 5. Soccer-specific logic (the genuinely new bits)

1. **3-way / Draw.** `moneyline_draw_odds` is first-class. Parser accepts `Draw` as a selection; pick card renders it; grading settles Draw on regulation score equality.
2. **ML odds-cap bypass.** Disable `-149` (NHL) and `-200` (non-NHL) ceilings for soccer — WC favorites hit -1250 and underdogs +2200.
3. **Knockout grading — field semantics (verified against 2022 shootouts).** `home_score`/`away_score` are **cumulative including extra time** (`= first_half + second_half + extra_time`), NOT the 90′ result. Therefore:
   - **3-way ML & totals settle on 90′ regulation = `first_half_* + second_half_*`** (never `home_score`/`away_score`, which would double-count ET in knockouts). Group games have no ET, so the two are equal there — the distinction only matters for knockouts.
   - **`to_advance` settles on `home_score`/`away_score` (already incl. ET); if still level, penalties (`*_penalties`)** — equivalently the next round's `*_team_source` winner. Built now; consumed once advance picks are generated (Phase 3).
4. **Tournament context.** Group standings, must-win math, GD tiebreakers, dead-rubber rotation risk feed the scout/constitution as awareness (not directives).
5. **Suspensions.** Yellow-card accumulation from `match_events` + grounding; no structured injury feed.
6. **Graceful market degradation.** When `spread`/`total` are `null` (today's reality), Gary picks 3-way ML; totals/handicap paths activate automatically when those odds appear.

## 6. Phasing

- **Phase 1 — ship before 2026-06-11:** data service, fetchers/tokens, scout + Tale of Tape, constitution, 3-way ML picks (Pass builders + parser + odds-cap bypass), grading (ML), iOS WC lane, config + scheduler, pick-storage keys in `daily_picks` JSONB (no migration). (3-way ML is the only live market.)
- **Phase 2 — fast-follow (when books post lines):** Totals + Asian handicap parsing/grading activate (code built in Phase 1).
- **Phase 3 — knockout-advance (before 2026-06-28):** `to_advance` pick generation — constitution guidance for "who advances," pass-builder emits the 2nd pick, advance odds source wired (grounding or derived-from-3-way). The `to_advance` enum + advance-result grading + multi-pick/2-card rendering are already in place from Phase 1, so this phase only adds generation + pricing.

## 7. Out of scope

- Player props, DFS (explicitly excluded).
- Reusing the dormant `.epl` iOS lane.
- Live in-play betting.
- Futures picks (data available; could be a later "intel" surface, not a game pick).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| ML odds caps mangle soccer prices | Explicit soccer bypass in `responseParser.js`; covered by a test with -1250/+2200 inputs |
| Knockout grading ambiguity (ET/penalties) | Locked rule: regulation-only; documented + unit-tested |
| Stale rosters / unconfirmed lineups near kickoff | Scout flags lineup confidence; constitution stays conservative; `match_lineups` + grounding |
| Touching shared BDL core breaks other sports | Standalone `fifaWorldCupService.js`; no edits to `ballDontLieService.js` core paths |
| Tight timeline (8 days) | Phase 1 = 3-way ML only (the live market); everything else built but dormant until data |
| LOCKED injury-handling code | Soccer uses its own grounding-based availability; do NOT touch existing injury labels/logic without explicit approval |

## 9. Testing

- Test picks → `test_daily_picks` table (CLAUDE.md rule).
- Unit tests: 3-way parse (incl. Draw), odds-cap bypass, knockout regulation grading, Asian-handicap push/quarter-line.
- Smoke test: run `--wc` against today's live 2026 fixtures + odds end-to-end (scout → Flash → Gary → stored pick → iOS shape).
- Backtest sanity: grade a sample of completed 2022 matches to validate `gradeGame` 3-way/totals logic against known results.

## 10. Compliance notes

- **Layer-3 rule:** the soccer constitution and all soccer prompts state awareness/investigation only — never link a factor to a pick conclusion or assign point values.
- **No-edits-without-approval:** this spec is the approval artifact for *what* to build; code changes proceed via the implementation plan, on a feature branch (not `main`).
- **Clean-up rule:** all new sport wiring is additive and isolated; no orphaned references.
