# FIFA World Cup — Plan B: Game-Picks Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. NOTE: the Plan-A subagent run hit a StructuredOutput handshake bug — if subagent dispatch is flaky, execute these tasks directly (the code/content is complete here).

**Goal:** Wire `soccer_world_cup` through Gary's game-picks pipeline so `node scripts/run-agentic-picks.js --wc --test` produces a stored 3-way-ML (Home/Draw/Away) World Cup pick, using the Plan-A data service, with scout report, Flash investigation, soccer constitution, and the odds-cap bypass.

**Architecture:** Additive sport registration following the MLB template across ~15 shared files + 3 new files. Soccer's data enters at the single fetch point (`run-agentic-picks.js:337`) via `fifaWorldCupService`; everything downstream branches on a sport flag. The 3-way/draw market and extreme odds are handled in `responseParser`; tournament/3-way awareness lives in a Layer-3-clean constitution.

**Tech Stack:** Node 22+ ESM, Vitest 4, existing Gemini orchestrator. Depends on **Plan A** (`fifaWorldCupService.js`) being merged.

**Spec:** `docs/superpowers/specs/2026-06-03-fifa-world-cup-sport-design.md`.

---

## ⚠️ Sport Identifier Contract (use these EXACT strings everywhere)

The Plan-B exploration found six different spellings across agents. **Lock these and use them verbatim in every task. Do not invent variants.**

| Role | Value | Mirrors |
|---|---|---|
| Pipeline sport key (`config.key`, threaded as `sport`) | `'soccer_world_cup'` | `'baseball_mlb'` |
| Normalized short name (SPORT_BUILDERS, constitution short alias, ALL_TOKENS_BY_SPORT, normalize* outputs, sportLabel) | `'WC'` | `'MLB'` |
| CLI flag | `--wc` | `--mlb` |
| iOS/display league (Plan D) | `'WC'` | — |

**Every sport check is:** `const isSoccer = sport === 'soccer_world_cup' || sport === 'WC';` (mirrors `isMLB = sport === 'baseball_mlb' || sport === 'MLB'`).

Soccer must be registered in **all five** normalizers or it silently no-ops: `normalizeSport` (utilities.js), `normalizeSportToLeague` (orchestratorHelpers.js), `normalizeSportName` + `sportToBdlKey` (statRouterCommon.js), and flashAdvisor's `sportKeyMap`. Task 1 does all of them.

---

## File Structure

**New files:**
- `gary2.0/src/services/agentic/constitution/soccerConstitution.js` — Layer-3-clean awareness.
- `gary2.0/src/services/agentic/scoutReport/sports/soccer.js` — scout report builder.
- `gary2.0/src/services/agentic/tools/statRouters/soccerFetchers.js` — token → FIFA-service fetchers.

**Modified files (with verified anchors):**
- `scripts/run-agentic-picks.js` — SPORT_CONFIG (122-129), flags (217-226), fetch dispatch (337), tokenToIosKey (1328-1398), expectedRowCount (1426), ToT gate (1320).
- `src/services/agentic/orchestrator/passBuilders.js` — dispatch (10-42), `buildSoccerPass1` (after 871), Pass 2.5 (399-418), Pass 3 (589/619).
- `src/services/agentic/orchestrator/responseParser.js` — soccer branch + cap bypass (305-390).
- `src/services/agentic/orchestrator/orchestratorHelpers.js` — `normalizeSportToLeague` (1000-1014), `RESEARCH_BRIEFING_FACTORS` (1018-1054).
- `src/services/agentic/constitution/index.js` — import + GAME_CONSTITUTIONS (87-101).
- `src/services/agentic/scoutReport/scoutReportBuilder.js` — SPORT_BUILDERS (27-34).
- `src/services/agentic/scoutReport/shared/utilities.js` — `normalizeSport` (124-140).
- `src/services/agentic/scoutReport/shared/taleOfTape.js` — soccer rows block (before generic fallback).
- `src/services/agentic/tools/toolDefinitions.js` — `SOCCER_WC_TOKENS` + ALL_TOKENS_BY_SPORT (264-271).
- `src/services/agentic/tools/statRouters/index.js` — soccerFetchers merge (10-19).
- `src/services/agentic/tools/statRouters/statRouterCommon.js` — `sportToBdlKey` + `normalizeSportName` (365-396).
- `src/services/agentic/orchestrator/flashAdvisor.js` — `sportKeyMap` (391-398).
- `src/services/agentic/flashInvestigationPrompts.js` — `SOCCER_WC_FACTORS` (before MLB_FACTORS) + getter registration.
- `src/services/agentic/orchestrator/investigationFactors.js` — INVESTIGATION_FACTORS soccer entry.
- `src/services/picksService.js` — soccer field mapping (after 244 + after 301) + dedup gameKey (374-381).

---

## Task 1: Sport-key plumbing (all five normalizers + briefing factors)

**Files:**
- Modify: `gary2.0/src/services/agentic/scoutReport/shared/utilities.js:124-140`
- Modify: `gary2.0/src/services/agentic/orchestrator/orchestratorHelpers.js:1000-1014,1018-1054`
- Modify: `gary2.0/src/services/agentic/tools/statRouters/statRouterCommon.js:365-396`
- Modify: `gary2.0/src/services/agentic/orchestrator/flashAdvisor.js:391-398`
- Test: `gary2.0/tests/services/agentic/soccerSportKeys.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `gary2.0/tests/services/agentic/soccerSportKeys.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeSport } from '../../../src/services/agentic/scoutReport/shared/utilities.js';
import { normalizeSportToLeague } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

describe('soccer sport-key normalization', () => {
  it('normalizeSport maps soccer key + short to WC', () => {
    expect(normalizeSport('soccer_world_cup')).toBe('WC');
    expect(normalizeSport('WC')).toBe('WC');
  });
  it('normalizeSportToLeague maps soccer key + short to WC', () => {
    expect(normalizeSportToLeague('soccer_world_cup')).toBe('WC');
    expect(normalizeSportToLeague('WC')).toBe('WC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/agentic/soccerSportKeys.test.js`
Expected: FAIL — `normalizeSport('soccer_world_cup')` returns `'SOCCER_WORLD_CUP'` (uppercase fallback), not `'WC'`.

- [ ] **Step 3: Implement the mappings**

In `utilities.js` `normalizeSport` mapping object (after `'baseball_mlb': 'MLB',` and after `'mlb': 'MLB'`), add:
```js
    'soccer_world_cup': 'WC',
    'wc': 'WC',
```

In `orchestratorHelpers.js` `normalizeSportToLeague` mapping (after `'baseball_mlb': 'MLB',` and after `'MLB': 'MLB'`), add:
```js
    'soccer_world_cup': 'WC',
    'WC': 'WC',
```

In `orchestratorHelpers.js` `RESEARCH_BRIEFING_FACTORS` (after the `americanfootball_ncaaf` block, before the closing `})`), add:
```js
  ,
  soccer_world_cup: Object.freeze([
    'form_and_recent_results',
    'attacking_and_xg',
    'defensive_solidity',
    'lineups_injuries_suspensions',
    'tournament_context_and_fatigue'
  ])
```

In `statRouterCommon.js` `sportToBdlKey` mapping, add `'WC': 'soccer_world_cup'`. In `normalizeSportName` mapping, add both `'soccer_world_cup': 'WC'` and `'WC': 'WC'`.

In `flashAdvisor.js` `sportKeyMap` (391-398), add `'WC': 'soccer_world_cup'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/agentic/soccerSportKeys.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/agentic/scoutReport/shared/utilities.js gary2.0/src/services/agentic/orchestrator/orchestratorHelpers.js gary2.0/src/services/agentic/tools/statRouters/statRouterCommon.js gary2.0/src/services/agentic/orchestrator/flashAdvisor.js gary2.0/tests/services/agentic/soccerSportKeys.test.js
git commit -m "feat(wc): register soccer_world_cup<->WC across all sport normalizers"
```

---

## Task 2: SPORT_CONFIG + CLI flag in run-agentic-picks.js

**Files:**
- Modify: `gary2.0/scripts/run-agentic-picks.js:122-129` (SPORT_CONFIG), `:217-226` (flags), usage/help text.

- [ ] **Step 1: Add the SPORT_CONFIG entry**

In `SPORT_CONFIG` (after the `mlb:` line, line 128), add:
```js
  ,
  wc: { key: 'soccer_world_cup', name: 'WC', emoji: '⚽', isBeta: true, useToday: true } // 2026 FIFA World Cup — today's matches (EST window)
```

- [ ] **Step 2: Add CLI flag parsing**

In the flag-parsing block (217-226), add after the `--mlb` line:
```js
  if (args.includes('--wc')) sportsToRun.push('wc');
```
Add `'wc'` to the `--all` sports array. Update the usage/help text to document `--wc` (2026 FIFA World Cup).

- [ ] **Step 3: Verify the flag is recognized (no crash on dispatch yet)**

Run: `cd gary2.0 && node scripts/run-agentic-picks.js --wc --help 2>&1 | head -5` (or the script's dry/usage path).
Expected: `--wc` is listed / accepted; no "unknown sport" error. (Full fetch is Task 3.)

- [ ] **Step 4: Commit**

```bash
git add gary2.0/scripts/run-agentic-picks.js
git commit -m "feat(wc): add --wc flag + SPORT_CONFIG entry (isBeta)"
```

---

## Task 3: Games + odds fetch dispatch → fifaWorldCupService

**Files:**
- Modify: `gary2.0/scripts/run-agentic-picks.js:337` (and add import near top).

- [ ] **Step 1: Import the FIFA service**

Near the other service imports at the top of `run-agentic-picks.js`, add:
```js
import * as fifaWorldCupService from '../src/services/fifaWorldCupService.js';
```

- [ ] **Step 2: Branch the fetch at line 337**

Replace the single `getUpcomingGames` call with a soccer branch. The soccer path fetches today's WC matches, attaches consensus odds, and normalizes to the pipeline game shape:
```js
      let allGames;
      if (config.key === 'soccer_world_cup') {
        const dateStr = (dateFilter ? dateFilter.split(',')[0].trim()
          : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
        const matches = await fifaWorldCupService.getMatchesForDate(dateStr);
        const oddsRows = await fifaWorldCupService.getOdds({});
        allGames = matches
          .filter(m => m.home_team && m.away_team) // skip TBD knockout slots
          .map(m => {
            const consensus = fifaWorldCupService.selectConsensusOdds(
              oddsRows.filter(o => o.match_id === m.id)
            );
            return fifaWorldCupService.formatMatchForPipeline(m, consensus);
          });
        console.log(`[${config.name}] Fetched ${allGames.length} World Cup matches for ${dateStr}`);
      } else {
        allGames = await oddsService.getUpcomingGames(config.key, { nocache: true, targetDate: dateFilter });
      }
```

- [ ] **Step 3: Ensure soccer uses the generic (useToday) filter path**

In the sport-specific filter block (the `if (config.key === 'americanfootball_nfl') ... else ...` chain starting line 345), confirm soccer falls into the generic/`useToday` branch (it already will, since it is not NFL). The `formatMatchForPipeline` output has `commence_time`, so the EST day-window filter applies unchanged. No edit needed unless a branch hard-excludes unknown keys — if so, add `|| config.key === 'soccer_world_cup'` to the generic path guard.

- [ ] **Step 4: Live dispatch smoke test**

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import './src/loadEnv.js';
import * as wc from './src/services/fifaWorldCupService.js';
const dateStr = new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const matches = await wc.getMatchesForDate(dateStr);
console.log('WC matches today (EST', dateStr + '):', matches.length, matches.slice(0,2).map(m=>(m.home_team?.name||'TBD')+' v '+(m.away_team?.name||'TBD')));
"
```
Expected: prints today's match count (may be 0 before June 11 — that is correct; the pipeline simply finds no games). Closer to/within the tournament it prints fixtures.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/scripts/run-agentic-picks.js
git commit -m "feat(wc): fetch World Cup matches + consensus odds via fifaWorldCupService"
```

---

## Task 4: soccerFetchers.js + SOCCER_WC_TOKENS + statRouter merge

**Files:**
- Create: `gary2.0/src/services/agentic/tools/statRouters/soccerFetchers.js`
- Modify: `gary2.0/src/services/agentic/tools/statRouters/index.js:10-19`
- Modify: `gary2.0/src/services/agentic/tools/toolDefinitions.js:264-271`

- [ ] **Step 1: Create soccerFetchers.js**

Each token maps to a function returning a short text finding for the orchestrator. Read team stats/form/standings from the FIFA service.
```js
/**
 * Soccer (World Cup) stat fetchers. Token → async (ctx) => string finding.
 * ctx provides { homeTeamId, awayTeamId, matchId, seasons }. Backed by fifaWorldCupService.
 */
import * as wc from '../../../fifaWorldCupService.js';

async function teamFormSummary({ matchId }) {
  if (!matchId) return 'No match id available for team form.';
  const form = await wc.getMatchTeamForm([matchId]);
  if (!form.length) return 'No pre-match form data available.';
  return form.map(f => `team ${f.team_id}: avg rating ${f.avg_rating ?? 'n/a'}, group pos ${f.position ?? 'n/a'}, recent pts ${f.value ?? 'n/a'}`).join(' | ');
}

async function groupStandings() {
  const rows = await wc.getGroupStandings();
  if (!rows.length) return 'Group standings not yet available.';
  return rows.map(r => `${r.group?.name} #${r.position} ${r.team?.name}: ${r.points}pts (GD ${r.goal_difference}, ${r.played}gp)`).join(' | ');
}

async function teamMatchStatsSummary({ matchId }) {
  if (!matchId) return 'No match id for team match stats.';
  const rows = await wc.getTeamMatchStats([matchId]);
  if (!rows.length) return 'No team match stats yet (match not played).';
  return rows.map(s => `team ${s.team_id}: poss ${s.possession_pct}%, xG ${s.expected_goals}, shots ${s.shots_total}/${s.shots_on_target} on target, corners ${s.corners}`).join(' | ');
}

// Most game-pick tokens resolve through the scout report; these provide on-demand depth.
export const soccerFetchers = {
  TEAM_FORM: teamFormSummary,
  RECENT_FORM: teamFormSummary,
  GROUP_STANDINGS: groupStandings,
  GROUP_STAGE_CONTEXT: groupStandings,
  TEAM_MATCH_STATS: teamMatchStatsSummary,
  POSSESSION_STATS: teamMatchStatsSummary,
  EXPECTED_GOALS: teamMatchStatsSummary,
};
```

- [ ] **Step 2: Merge into statRouters/index.js**

Add `import { soccerFetchers } from './soccerFetchers.js';` and add `...soccerFetchers,` to the `FETCHERS` object (after `...mlbFetchers,`).

- [ ] **Step 3: Add tokens to toolDefinitions.js**

Before the `ALL_TOKENS_BY_SPORT` object (264), add:
```js
const SOCCER_WC_TOKENS = [
  'TEAM_FORM', 'RECENT_FORM', 'GROUP_STANDINGS', 'GROUP_STAGE_CONTEXT',
  'TEAM_MATCH_STATS', 'POSSESSION_STATS', 'EXPECTED_GOALS',
  'GOALS_PER_MATCH', 'GOALS_CONCEDED', 'SHOTS_ON_TARGET', 'SET_PIECES',
  'KEY_PLAYERS', 'INJURIES', 'SUSPENSIONS', 'LINEUP_FORMATION', 'H2H_HISTORY',
];
```
Add `WC: SOCCER_WC_TOKENS,` to `ALL_TOKENS_BY_SPORT`.

- [ ] **Step 4: Verify it loads**

Run: `cd gary2.0 && node --input-type=module -e "import('./src/services/agentic/tools/statRouters/index.js').then(m=>console.log('FETCHERS has TEAM_FORM:', typeof m.FETCHERS?.TEAM_FORM)).catch(e=>{console.error(e);process.exit(1)})"`
Expected: prints `FETCHERS has TEAM_FORM: function` (or whatever the export name is — adjust if FETCHERS isn't exported; then just confirm no import error).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/agentic/tools/statRouters/soccerFetchers.js gary2.0/src/services/agentic/tools/statRouters/index.js gary2.0/src/services/agentic/tools/toolDefinitions.js
git commit -m "feat(wc): soccer stat fetchers + WC token menu"
```

---

## Task 5: Scout report + Tale of Tape + iOS token mapping

**Files:**
- Create: `gary2.0/src/services/agentic/scoutReport/sports/soccer.js`
- Modify: `scoutReportBuilder.js:27-34`, `shared/taleOfTape.js` (before generic fallback), `run-agentic-picks.js:1320,1328-1398,1426`.

- [ ] **Step 1: Create sports/soccer.js (mirror mlb.js signature)**

```js
/**
 * Soccer (World Cup) scout report builder. Mirrors sports/mlb.js shape.
 * Returns { text, verifiedTaleOfTape, injuries, tokenMenu }.
 */
import * as wc from '../../../fifaWorldCupService.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';

export async function buildSoccerScoutReport(game, options = {}) {
  const homeTeam = typeof game.home_team === 'string' ? game.home_team : (game.home_team?.full_name || game.home_team?.name || 'Home');
  const awayTeam = typeof game.away_team === 'string' ? game.away_team : (game.away_team?.full_name || game.away_team?.name || 'Away');
  console.log(`[Scout Report] Building WC report: ${homeTeam} vs ${awayTeam}`);

  const matchId = game.soccer_match_id || game.id;
  const [teamStats, form, standings] = await Promise.all([
    matchId ? wc.getTeamMatchStats([matchId]).catch(() => []) : [],
    matchId ? wc.getMatchTeamForm([matchId]).catch(() => []) : [],
    wc.getGroupStandings().catch(() => []),
  ]);

  const stage = game.soccer_stage || 'Group Stage';
  const group = game.soccer_group ? ` (${game.soccer_group})` : '';
  const reportText = [
    `## MATCHUP: ${homeTeam} vs ${awayTeam}`,
    `FIFA World Cup 2026 — ${stage}${group}. Venue: ${game.venue || 'TBD'}.`,
    standings.length ? `\n### GROUP STANDINGS\n${standings.filter(s => game.soccer_group ? s.group?.name === game.soccer_group : true).map(s => `${s.position}. ${s.team?.name} — ${s.points}pts (${s.won}-${s.drawn}-${s.lost}, GD ${s.goal_difference})`).join('\n')}` : '',
    form.length ? `\n### PRE-MATCH FORM\n${form.map(f => `team ${f.team_id}: avg rating ${f.avg_rating ?? 'n/a'}, recent pts ${f.value ?? 'n/a'}`).join('\n')}` : '',
    `\n### ODDS (3-way)\n${game.soccer_three_way_ml ? `Home ${game.soccer_three_way_ml.home} / Draw ${game.soccer_three_way_ml.draw} / Away ${game.soccer_three_way_ml.away}` : 'Odds pending'}`,
  ].filter(Boolean).join('\n');

  const verifiedTaleOfTape = buildVerifiedTaleOfTape('WC', {
    homeProfile: { teamName: homeTeam }, awayProfile: { teamName: awayTeam },
    homeStats: teamStats.find(s => s.is_home), awayStats: teamStats.find(s => !s.is_home),
    homeInjuries: '', awayInjuries: '',
  });

  return {
    text: reportText,
    verifiedTaleOfTape,
    injuries: { home: [], away: [] }, // World Cup injuries come from Flash grounding
    tokenMenu: null,
  };
}
```
NOTE: adjust the `buildVerifiedTaleOfTape` call to match its real signature (Step 2 reveals it). Keep the return keys (`text`, `verifiedTaleOfTape`, `injuries`, `tokenMenu`) exactly.

- [ ] **Step 2: Register in scoutReportBuilder.js**

Add `import { buildSoccerScoutReport } from './sports/soccer.js';` and add `'WC': buildSoccerScoutReport,` to `SPORT_BUILDERS` (after the MLB entry, line 33). (`normalizeSport('soccer_world_cup')` → `'WC'` from Task 1, so the dispatcher resolves it.)

- [ ] **Step 3: Add the soccer Tale-of-Tape rows block**

In `shared/taleOfTape.js`, before the generic fallback `else` (≈ line 350), add a `} else if (sport === 'WC') {` block producing ~13 rows using the same `{ label, arrow, home, away }` row format as the NCAAF block. Rows: `Group Pos`, `Pts`, `GF/Gm`, `GA/Gm`, `xG`, `xGA`, `Possession %`, `Shots`, `Shots on Target`, `Big Chances`, `Pass Acc %`, `Corners`, `Recent Form`, `Key Injuries` (arrow `''`). Pull from `homeStats`/`awayStats` (the per-team match-stats objects); use `formatStat` like the other blocks; default missing values to `'—'`.

- [ ] **Step 4: iOS token mapping + row count + ToT gate in run-agentic-picks.js**

- `:1320` ToT gate — add `|| config.key === 'soccer_world_cup'` to the verified-Tale-of-Tape conditional.
- `:1328-1398` `tokenToIosKey` — add: `POSSESSION_PCT: 'possession_pct'`, `SHOTS_ON_TARGET: 'shots_on_target'`, `XG: 'expected_goals'`, `XGA: 'expected_goals_against'`, `GOALS_FOR: 'goals_for'`, `GOALS_AGAINST: 'goals_against'`, `CORNERS: 'corners'`, `PASS_ACCURACY: 'pass_accuracy'`, `BIG_CHANCES: 'big_chances'`.
- `:1426` `expectedRowCount` — add `'WC': 13`.

- [ ] **Step 5: Smoke test the scout builder**

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import './src/loadEnv.js';
import { buildScoutReport } from './src/services/agentic/scoutReport/scoutReportBuilder.js';
const game = { id: 1, soccer_match_id: 1, home_team: 'Mexico', away_team: 'South Africa', venue: 'Estadio Azteca', soccer_stage: 'Group Stage', soccer_group: 'Group A', soccer_three_way_ml: { home: -115, draw: 250, away: 320 } };
const r = await buildScoutReport(game, 'soccer_world_cup', {});
console.log('scout text length:', r.text?.length, '| ToT rows:', r.verifiedTaleOfTape?.rows?.length);
"
```
Expected: non-zero text length and a Tale-of-Tape rows array (rows may have `'—'` placeholders before matches are played — acceptable).

- [ ] **Step 6: Commit**

```bash
git add gary2.0/src/services/agentic/scoutReport/sports/soccer.js gary2.0/src/services/agentic/scoutReport/scoutReportBuilder.js gary2.0/src/services/agentic/scoutReport/shared/taleOfTape.js gary2.0/scripts/run-agentic-picks.js
git commit -m "feat(wc): soccer scout report + Tale of Tape + iOS token mapping"
```

---

## Task 6: Soccer constitution (Layer-3 clean) + registration

**Files:**
- Create: `gary2.0/src/services/agentic/constitution/soccerConstitution.js`
- Modify: `gary2.0/src/services/agentic/constitution/index.js:10,87-101`

- [ ] **Step 1: Create soccerConstitution.js**

Mirror `mlbConstitution.js` shape. **Layer-3 rule: awareness/investigation only — never link a factor to a pick conclusion or assign point/goal values.**

```js
/**
 * Soccer (2026 FIFA World Cup) constitution — Layer 1 (awareness) + Layer 2
 * (investigation) ONLY. No Layer 3 (never "high xG => back them", never assign
 * goal/point values to factors). Gary investigates and concludes on his own.
 */
export const SOCCER_CONSTITUTION = {
  domainKnowledge: ``,
  pass1Context: `### SOCCER AWARENESS (2026 FIFA World Cup)

This is a 3-way market: Home win, Draw, and Away win are three separate priced outcomes. Each match has its own moneyline (Home/Draw/Away), and where the book offers them, total goals (Over/Under) and Asian handicaps. Draws are a structural part of soccer — evaluate all three outcomes, not two.

Goals are low-frequency: most matches finish with a small number of goals, and a single goal can decide a result. Expected goals (xG) describes the quality of chances a team created or conceded — it is a description of process over a sample, not a prediction of this match's scoreline.

Tournament structure matters and changes game to game. Group stage: each team plays three matches; standings, goal difference, and what result a team needs to advance can shape intensity and approach, and a team already through may rotate. Knockout stage: matches that are level after 90 minutes go to extra time and penalties (the 3-way moneyline still settles on the 90-minute result).

World Cup-specific context to be aware of: confirmed lineups and formation (squads rotate, late changes happen), injuries AND suspensions (yellow-card accumulation can rule a player out), travel and rest across a compressed schedule, host environment, altitude (e.g. Mexico City), and summer heat at some venues.

Investigation questions to work through for BOTH teams: recent results and form across this and prior editions; attacking output (goals, shots on target, xG, chance creation) and how it was generated; defensive record (goals/shots conceded, clean sheets); set-piece threat both ways; confirmed availability of key players; group situation and what each team needs; and any weather/altitude/travel factors that the data shows. Report findings with specific numbers. Do not state what any single factor means for the pick.

INJURY/AVAILABILITY LABELS: treat availability conservatively — "returned to training" is not "will start". Flag confirmed-out vs doubtful vs available, with the date of the latest update.`,
  pass25DecisionGuards: ``,
  guardrails: ``,
  bilateralCasePrompt: (homeTeam, awayTeam) => `Before outputting INVESTIGATION COMPLETE, include three short sections in your Pass 1 synthesis (2-3 sentences each), grounded only in the evidence you investigated:
Case for ${homeTeam} winning
Case for a Draw
Case for ${awayTeam} winning`,
};

export default SOCCER_CONSTITUTION;
```

- [ ] **Step 2: Register in constitution/index.js**

Add after the MLB import (line 10): `import { SOCCER_CONSTITUTION } from './soccerConstitution.js';`
In `GAME_CONSTITUTIONS` (87-101): add `WC: SOCCER_CONSTITUTION,` (with the short names) and `soccer_world_cup: SOCCER_CONSTITUTION,` (with the BDL-key aliases).

- [ ] **Step 3: Verify it resolves**

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import { getConstitution } from './src/services/agentic/constitution/index.js';
const c = getConstitution('soccer_world_cup');
console.log('has pass1Context:', !!c.pass1Context, '| bilateral is fn:', typeof c.bilateralCasePrompt);
"
```
Expected: `has pass1Context: true | bilateral is fn: function`.

- [ ] **Step 4: Layer-3 self-check**

Re-read `pass1Context`: confirm NO sentence links a factor to a pick (no "= edge", "= fade", "worth X goals", "back the…"). Fix any inline. Then commit.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/agentic/constitution/soccerConstitution.js gary2.0/src/services/agentic/constitution/index.js
git commit -m "feat(wc): soccer constitution (Layer-3 clean) + registration"
```

---

## Task 7: Flash investigation factors

**Files:**
- Modify: `gary2.0/src/services/agentic/flashInvestigationPrompts.js` (before `MLB_FACTORS`), + the per-sport getter.
- Modify: `gary2.0/src/services/agentic/orchestrator/investigationFactors.js` (INVESTIGATION_FACTORS).

- [ ] **Step 1: Add SOCCER_WC_FACTORS**

Before `const MLB_FACTORS`, add a `const SOCCER_WC_FACTORS = \`...\`` investigation checklist covering: Form & recent results, Attacking & xG, Defensive solidity, Set pieces, Lineups/injuries/suspensions, Tournament/group context, Fatigue/rest/travel, Weather/altitude, H2H. Each factor: 2-4 investigation questions for BOTH teams + "report findings with specific numbers." (Awareness/investigation only — no conclusions.) Wire it into the sport→prompt getter (the function that returns the per-sport checklist, where MLB is returned) keyed on `WC` / `soccer_world_cup`.

- [ ] **Step 2: Add INVESTIGATION_FACTORS entry**

In `investigationFactors.js`, add a `soccer_world_cup:` entry mapping factor categories to the tokens defined in Task 4 (`SOCCER_WC_TOKENS`): e.g. `FORM: ['TEAM_FORM','RECENT_FORM']`, `ATTACK: ['EXPECTED_GOALS','SHOTS_ON_TARGET','GOALS_PER_MATCH']`, `DEFENSE: ['GOALS_CONCEDED']`, `AVAILABILITY: ['INJURIES','SUSPENSIONS','LINEUP_FORMATION']`, `CONTEXT: ['GROUP_STANDINGS','GROUP_STAGE_CONTEXT']`. Keep every token string identical to the Task-4 token list (coverage validation matches on these).

- [ ] **Step 3: Verify**

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import { INVESTIGATION_FACTORS } from './src/services/agentic/orchestrator/investigationFactors.js';
console.log('soccer factors:', Object.keys(INVESTIGATION_FACTORS.soccer_world_cup || {}).length);
"
```
Expected: a non-zero factor count.

- [ ] **Step 4: Commit**

```bash
git add gary2.0/src/services/agentic/flashInvestigationPrompts.js gary2.0/src/services/agentic/orchestrator/investigationFactors.js
git commit -m "feat(wc): Flash soccer investigation checklist + factor->token map"
```

---

## Task 8: Pass builders (buildSoccerPass1 + Pass 2.5/3 bet types)

**Files:**
- Modify: `gary2.0/src/services/agentic/orchestrator/passBuilders.js` — dispatch (10-42), new `buildSoccerPass1` (after 871), Pass 2.5 (399-418), Pass 3 (589/619).

- [ ] **Step 1: Dispatch in buildPass1Message**

After the `isMLB` block (≈ line 40), add:
```js
  const isSoccer = sport === 'soccer_world_cup' || sport === 'WC';
  if (isSoccer) {
    return buildSoccerPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }
```

- [ ] **Step 2: Add buildSoccerPass1 (after buildMlbPass1, ≈ line 871)**

Mirror `buildMlbPass1`. Include `<scout_report>`, an `<investigation_rules>` block, and a `<bet_type_menu>` describing the three markets:
```js
function buildSoccerPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})
${scoutReport}
</scout_report>

<bet_type_menu>
This is a 3-way soccer match. You may pick from whichever markets the scout report shows odds for:
**Moneyline (3-way):** ${homeTeam} to win, Draw, or ${awayTeam} to win — three separately priced outcomes (settles on 90 minutes).
**Totals (O/U goals):** Over/Under total match goals, when a line is shown.
**Asian Handicap:** team ±0.5/1.0/1.5 goals, when a line is shown.
Use only markets present in the scout report odds. Transcribe the exact odds.
</bet_type_menu>

<instructions>
Investigate BOTH teams across the soccer factors (form, attack/xG, defense, set pieces, availability, group/tournament context, weather/altitude). When done, synthesize your three cases (Home / Draw / Away) and output INVESTIGATION COMPLETE.
</instructions>`;
}
```

- [ ] **Step 3: Pass 2.5 bet-type label (399-418)**

Add `const isSoccer = sport === 'soccer_world_cup' || sport === 'WC';` and extend the `lineLabel`, `betTypeNote`, and `lineContext` ternaries/branches with the soccer case (3-way ML / Totals / Asian handicap), per the mapping. Soccer `lineContext`: `Line context: ${homeTeam} (home) vs Draw vs ${awayTeam} (away). Pick the market (3-way ML, Totals, or Asian handicap) your investigation supports.`

- [ ] **Step 4: Pass 3 bet-type instruction (589/619)**

Add `const isSoccer = ...;` at ≈589 and extend the bet-type ternary at ≈619 with the soccer three-market option (3-way ML incl. Draw / Totals / Asian handicap).

- [ ] **Step 5: Smoke test (build prompts without throwing)**

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import { buildPass1Message } from './src/services/agentic/orchestrator/passBuilders.js';
const msg = buildPass1Message('', 'scout text', '2026-06-11', 'Mexico', 'South Africa', 0, 'soccer_world_cup');
console.log('soccer Pass1 includes 3-way:', /3-way/i.test(msg));
"
```
Expected: `soccer Pass1 includes 3-way: true` (adjust the call signature to match `buildPass1Message`'s real parameter order).

- [ ] **Step 6: Commit**

```bash
git add gary2.0/src/services/agentic/orchestrator/passBuilders.js
git commit -m "feat(wc): buildSoccerPass1 + 3-way/totals/AH bet-type prompts"
```

---

## Task 9: responseParser — 3-way/Draw + odds-cap bypass (TDD)

**Files:**
- Modify: `gary2.0/src/services/agentic/orchestrator/responseParser.js:305-390`
- Test: `gary2.0/tests/services/agentic/soccerParser.test.js` (new)

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { normalizePickFormat } from '../../../src/services/agentic/orchestrator/responseParser.js';

describe('soccer pick parsing (3-way + odds-cap bypass)', () => {
  it('accepts Draw as a valid selection (type=draw)', () => {
    const out = normalizePickFormat({ pick: 'Draw', odds: 250 }, 'soccer_world_cup', { /* gameOdds */ });
    expect(out.type).toBe('draw');
  });
  it('does NOT force a heavy favorite to spread (no -200 cap for soccer)', () => {
    const out = normalizePickFormat({ pick: 'Mexico ML', odds: -1250, type: 'moneyline' }, 'soccer_world_cup', { homeMLOdds: -1250 });
    expect(out.type).toBe('moneyline');
    expect(out.odds).toBe(-1250); // not coerced to a spread
  });
});
```
NOTE: align the `normalizePickFormat` argument shape with its real signature (inspect lines 305-390); adjust the test inputs to match before running. The two behaviors asserted (Draw→`type:'draw'`, no cap coercion) are the contract.

- [ ] **Step 2: Run to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/agentic/soccerParser.test.js`
Expected: FAIL — Draw not recognized / odds coerced by the -200 ceiling.

- [ ] **Step 3: Implement the soccer branch**

In `normalizePickFormat`, add `const isSoccer = sport === 'soccer_world_cup' || sport === 'WC';` near the existing `isNHL` detection (≈305). After the NHL pick-type block (≈328), add:
```js
  if (isSoccer && parsed.pick) {
    if (/\b(draw|tie)\b/i.test(parsed.pick)) {
      parsed.type = 'draw';
      console.log('[Orchestrator] ⚽ WC: Draw pick — bypassing ML caps');
    } else if (!parsed.type) {
      parsed.type = 'moneyline';
    }
  }
```
Then add `&& !isSoccer` to BOTH cap guards: the non-NHL `-200` ML ceiling (≈349-373) and the NHL `-149` cap (≈374-390). Soccer favorites (-1250) and dogs (+2200) must pass through untouched.

- [ ] **Step 4: Run to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/agentic/soccerParser.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/agentic/orchestrator/responseParser.js gary2.0/tests/services/agentic/soccerParser.test.js
git commit -m "feat(wc): parser accepts Draw + bypasses ML odds caps for soccer"
```

---

## Task 10: picksService — soccer fields + market-aware dedup (TDD)

**Files:**
- Modify: `gary2.0/src/services/picksService.js` (field mapping after 244 + after 301; gameKey 374-381)
- Test: `gary2.0/tests/services/soccerDedup.test.js` (new) — only if `gameKey` (or a wrapper) is exportable; otherwise verify via the storage smoke in Task 11.

- [ ] **Step 1: Write the failing test (if gameKey is exportable)**

If `gameKey` is not currently exported, export it (or a small pure `buildGameKey(pick)` helper extracted from it) so it can be unit-tested.
```js
import { describe, it, expect } from 'vitest';
import { buildGameKey } from '../../src/services/picksService.js';

describe('soccer dedup key (one pick per market per match)', () => {
  it('ML and Total on the same match get different keys', () => {
    const ml = { sport: 'WC', soccer_match_id: 1, type: 'moneyline' };
    const tot = { sport: 'WC', soccer_match_id: 1, type: 'total' };
    expect(buildGameKey(ml)).not.toBe(buildGameKey(tot));
  });
  it('two MLs on the same match collide (deduped)', () => {
    const a = { sport: 'WC', soccer_match_id: 1, type: 'moneyline' };
    const b = { sport: 'WC', soccer_match_id: 1, type: 'moneyline' };
    expect(buildGameKey(a)).toBe(buildGameKey(b));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/soccerDedup.test.js`
Expected: FAIL — `buildGameKey` not exported / no soccer branch.

- [ ] **Step 3: Implement**

Extract/add `buildGameKey(pick)` with a soccer branch:
```js
export function buildGameKey(pick) {
  if (pick.soccer_match_id) {
    const market = pick.type || 'moneyline';
    return `soccer|${pick.soccer_match_id}|${market}`;
  }
  // ... existing prop / homeTeam|awayTeam logic unchanged ...
}
```
Add the soccer fields to the `pickData` object in BOTH the Gemini path (after line 244) and the fallback path (after line 301): `soccer_three_way_ml`, `soccer_competition`, `soccer_stage`, `soccer_round`, `soccer_group`, `soccer_match_id`, `goal_line`, `handicap` (all `pick.X ?? null`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/soccerDedup.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/picksService.js gary2.0/tests/services/soccerDedup.test.js
git commit -m "feat(wc): persist soccer pick fields + market-aware dedup"
```

---

## Task 11: End-to-end integration smoke + full suite

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite (no regressions beyond the known pre-existing failures)**

Run: `cd gary2.0 && npx vitest run`
Expected: all NEW soccer tests pass; the only failures are the pre-existing `sharedUtils.test.js` / `orchestrator.test.js` ones present before Plan A (record the exact count to confirm it did not grow).

- [ ] **Step 2: End-to-end dry run against live data, writing to test table**

Run: `cd gary2.0 && node scripts/run-agentic-picks.js --wc --test 2>&1 | tail -40`
Expected (before June 11): clean run reporting 0 World Cup matches in today's window — no crashes, no "no builder/constitution/normalizer" errors. (When matches exist, it produces 3-way picks into `test_daily_picks`.)
If it errors, the message names the missing normalizer/registration — fix that specific spot and re-run.

- [ ] **Step 3: Commit (if any fixes were needed in Step 2)**

```bash
git add -A -- gary2.0/src gary2.0/scripts
git commit -m "fix(wc): resolve integration gaps found in --wc smoke run"
```

---

## Self-Review (completed)

- **Spec coverage:** Plan B covers spec Layers 2 (tokens/fetchers), 3 (scout/ToT), 4 (constitution), 5 (pass builders/parser), 7 (Flash), 6 (storage), and Layer-10 config. Grading (Layer 8) = Plan C; iOS render (Layer 9) = Plan D. ✓
- **Identifier contract:** one table; every task uses `soccer_world_cup`/`WC` verbatim; all five normalizers covered in Task 1. ✓
- **Placeholder scan:** content provided for constitution + pass builders + fetchers + scout. Tasks 5/7/8 contain explicit NOTES to align a call signature with the real function — these are verification instructions, not unfilled blanks; the behavior and content are fully specified. ✓
- **TDD where testable:** Tasks 1, 9, 10 are red→green unit tests; prompt/content tasks (6,7,8) verified by load + smoke; integration verified in Task 11. ✓

## Downstream

- **Plan C** (grading) imports Plan A's `getRegulationScore`/`getAdvanceResult` into `run-all-results.js`.
- **Plan D** (iOS) renders the `soccer_three_way_ml` + Draw pick shape produced here.
