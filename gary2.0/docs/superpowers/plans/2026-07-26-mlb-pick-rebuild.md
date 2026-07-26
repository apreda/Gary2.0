# MLB Pick Rebuild ("One Desk, One Read") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MLB game-pick pass machinery with one Sol xhigh call over a complete board-and-world-first desk; delete the old MLB game lane in the same push.

**Architecture:** New `src/services/pickdesk/` (desk builder + brain) reuses the existing scout stats core, odds board, statAudit rails, and the untouched runner chassis (tiers, lineup gate, store, plain layer, model tag). Spec: `docs/superpowers/specs/2026-07-26-mlb-pick-rebuild-design.md`.

**Tech Stack:** Node ESM, vitest, Supabase JS, existing OpenAI Responses adapter (`openaiSession.js`), BDL/Savant services.

## Global Constraints

- Model `gpt-5.6-sol`, thinkingLevel `xhigh`, **tools: [] (none)** — spec §Brain.
- Founder-curated prompt text is moved verbatim, never rewritten; the only ask deltas: tools sentence → "Make the bet."; no length bracket.
- Card spec: "Gary's Take", scene-setter open, pick + reasons; confidence organic 0.50–1.00.
- statAudit + count rail: one retry then null (no store). Never detect-and-ship.
- Chassis contract unchanged: the brain returns the same result shape `analyzeGame` returned.
- Test runs store to `test_daily_picks` only. Suite green before push.
- All timestamps/logs ET. No ellipsis in any rendered output.

---

### Task 1: Venue-split line in the season series (spec: THE SHELF)

**Files:**
- Modify: `src/services/agentic/scoutReport/sports/mlbSeriesState.js` (computeMlbSeasonSeries)
- Test: `tests/services/scoutReport/mlbSeriesState.venue.test.js` (create)

**Interfaces:**
- Produces: `computeMlbSeasonSeries(...)` return gains `line` suffix: `" At <homeTeam>'s park: <homeTeam> X-Y."` computed from meetings where `tonightHomeHosted === true`.

- [ ] Write failing test: seed a fake seasonIndex Map with 4 finals (2 hosted by home team: home won 1, lost 1; 2 away-hosted), assert `line` contains `At Cardinals' park: Cardinals 1-1.`
- [ ] Implement: inside the meetings map loop, tally `venueHomeWins/venueHomeLosses` when `tonightHomeHosted`; append sentence to `line` when ≥1 hosted meeting.
- [ ] `npx vitest run tests/services/scoutReport/mlbSeriesState.venue.test.js` → PASS; commit `feat: season series carries at-venue aggregate`.

### Task 2: buildSystemPrompt works constitution-less

**Files:**
- Modify: `src/services/agentic/orchestrator/orchestratorMain.js:395-404`
- Test: `tests/services/pickdesk/systemPrompt.test.js` (create)

**Interfaces:**
- Produces: `buildSystemPrompt('', 'MLB')` returns the identity/framework text with NO `<constitution>` block; existing callers (props) unaffected.

- [ ] Failing test: `expect(buildSystemPrompt('', 'MLB')).not.toContain('<constitution>')` and `toContain('FACT-CHECKING PROTOCOL')`.
- [ ] Implement guard: `const constitutionBlock = constitutionText && String(constitutionText).trim() ? `<constitution>\n${constitutionText}\n</constitution>\n\n` : '';` and use `${constitutionBlock}<identity>`.
- [ ] Suite spot: `npx vitest run tests/services/pickdesk/systemPrompt.test.js` PASS; full suite later. Commit `feat: system prompt renders without constitution block`.

### Task 3: THE DESK — `src/services/pickdesk/mlbDesk.js`

**Files:**
- Create: `src/services/pickdesk/mlbDesk.js`
- Create: `src/services/pickdesk/sectionText.js` (pure string helpers)
- Test: `tests/services/pickdesk/mlbDesk.test.js`, `tests/services/pickdesk/sectionText.test.js`

**Interfaces:**
- Consumes: `buildScoutReport(game, 'baseball_mlb', {})` → `{ garyText|text, recentScores, taleOfTape/tapeRows (verify key by grep: `grep -n "return {" src/services/agentic/scoutReport/sports/mlb.js | tail -3` and read that block), ... }`; `ballDontLieService.getOddsV2({ game_ids }, 'baseball_mlb')` (board rows, sol-native format); standings via the same service call mlb.js uses (`grep -n "tandings" src/services/agentic/scoutReport/sports/mlb.js | head -4` → reuse method, BDL layer caches).
- Produces: `buildMlbDesk(game) → { deskText, tapeRows, recentScores, meta }`; `meta = { homeTeam, awayTeam, moneylineHome, moneylineAway, spreadHome, spreadAway, spreadHomeOdds, spreadAwayOdds, total }` (consensus = first board row with values).

- [ ] `sectionText.js` failing tests then implement:

```js
export function extractSection(text, header) {
  const i = text.indexOf(header);
  if (i < 0) return { section: null, rest: text };
  const after = text.indexOf('\n═══', i + header.length);
  const end = after < 0 ? text.length : after;
  return { section: text.slice(i, end).trimEnd(), rest: (text.slice(0, i) + text.slice(end)).trim() };
}
export function insertAfterHeader(text, header, lines) {
  const i = text.indexOf(header);
  if (i < 0) return text;
  const nl = text.indexOf('\n', i);
  return text.slice(0, nl + 1) + lines + '\n' + text.slice(nl + 1);
}
```

Tests: extract moves the BREAKING NEWS block out and `rest` no longer contains it; missing header → `{ section: null }` and unchanged text; insertAfterHeader places legend line directly under INJURIES header.

- [ ] `mlbDesk.js` failing test (mock buildScoutReport + getOddsV2 + standings): deskText starts with `═══ THE BOARD ═══`, then `═══ THE STAKES ═══`, then `═══ THE WORLD ═══`, then the shelf; board contains both ML sides and both RL sides w/ prices; stakes contains records/GB/seed/streak + `Trade deadline: July 31 (N days away)`; injury legend line present under INJURIES; WORLD absent from shelf tail.
- [ ] Implement (real content, no placeholders):

```js
const TRADE_DEADLINE = '2026-07-31'; // MLB fact; update yearly
const BET_MECHANICS = `Bet mechanics (facts): MONEYLINE pays if the team wins outright. RUN LINE -1.5 pays only on a win by 2+ (a one-run win pays ML and loses -1.5); +1.5 cashes on a win or a one-run loss.`;
const INJURY_LEGEND = `Tags: [NEW] = listed/scratched within 3 days (may not be in the line). [KNOWN] = 4+ days (line and recent stats already reflect it). [SP SCRATCH] = scheduled starter replaced — highest-impact change in baseball.`;
```

Board rows exactly as sol-native builds them (`vendor: ML away X / home Y | Run line ...`). STAKES lines per team: `Cubs: 58-45, 2nd NL Central, 6 GB, playoff seed 4, streak W2` from standings rows (fields seen in the desk render: wins/losses/total, `L10`, `Streak`, `GB`, `Playoff seed`, conference/division name); plus the deadline line with days computed from `todayEST()`.

- [ ] Run mlbDesk tests → PASS; commit `feat: THE DESK — board/stakes/world-first MLB desk`.

### Task 4: THE BRAIN — `src/services/pickdesk/garyBrain.js`

**Files:**
- Create: `src/services/pickdesk/garyBrain.js`
- Delete: `tests/services/agentic/solGameBrain.test.js` (pins old lane) — replaced by:
- Test: `tests/services/pickdesk/garyBrain.test.js`

**Interfaces:**
- Consumes: `buildMlbDesk(game)`; `createOpenAISession/sendToOpenAISession`; `auditPickRationale, auditCountClaims, buildStatAuditRetryMessage`; `GAME_PICK_MODEL`.
- Produces: `analyzeGameDesk(game, options) → result` matching the runner contract. Verify the exact field list first: `grep -n "result\." scripts/run-agentic-picks.js | sed -n '1,60p'` around lines 1440-1660 — known fields: `pick, type, odds, confidence, homeTeam, awayTeam, rationale, spread, spreadOdds, moneylineHome, moneylineAway, total, _statAuditWarnings`; plus `error` on failure (per-game containment) and tape passthrough the runner reads (grep `verifiedTaleOfTape|statsData` in runner; wire the same key from desk tapeRows).

- [ ] Failing pins test (mock `openaiSession` with `vi.mock`): session created with `modelName: 'gpt-5.6-sol'`, `thinkingLevel: 'xhigh'`, `tools: []`; user message contains `THE BOARD` before `PROBABLE PITCHERS`; ask contains `BEST BET on this board` and `Make the bet.`; ask does NOT contain `[3 paragraphs` or `investigate`; system prompt contains `FACT-CHECKING PROTOCOL` and no `<constitution>`.
- [ ] Implement: DECISION_ASK = sol-native's verbatim with first line replaced by `Make the bet.`; one send; `parse()` lifted verbatim from sol-native; audit block lifted verbatim (`auditAll` with `recentScores`), one `buildStatAuditRetryMessage` retry, null on second failure (return `{ error: 'rails' }`), malformed JSON → one re-ask (`Return your final JSON now.`) then `{ error: 'parse' }`.
- [ ] `mapFinalPick(parsed, meta)`:

```js
export function mapFinalPick(parsed, meta) {
  const fp = parsed.final_pick || '';
  const isSpread = /run\s*line|[+-]1\.5/i.test(fp);
  const homeSide = fp.toLowerCase().includes((meta.homeTeam || '').toLowerCase().split(' ').pop());
  const oddsM = fp.trim().match(/([+-]\d{3,4})$/);
  const odds = oddsM ? parseInt(oddsM[1], 10) : (isSpread ? (homeSide ? meta.spreadHomeOdds : meta.spreadAwayOdds) : (homeSide ? meta.moneylineHome : meta.moneylineAway));
  return {
    pick: fp, type: isSpread ? 'spread' : 'moneyline', odds,
    spread: isSpread ? (homeSide ? meta.spreadHome : meta.spreadAway) : null,
    spreadOdds: isSpread ? (homeSide ? meta.spreadHomeOdds : meta.spreadAwayOdds) : null,
  };
}
```

Unit tests: `"Tigers -1.5 -110"` → spread/home mapping; `"Tampa Bay Rays ML -116"` → moneyline away odds -116; missing trailing odds falls back to meta.
- [ ] Tests PASS; commit `feat: THE BRAIN — one Sol xhigh call, no tools, rails intact`.

### Task 5: Runner seam + desk snapshot

**Files:**
- Modify: `scripts/run-agentic-picks.js` (~line 945 seam + MLB scout/tape sourcing)
- Modify: `src/services/picksService.js` (add `storeDeskSnapshot`)
- Create: `supabase/migrations/20260726_pick_desks.sql`

**Interfaces:**
- Consumes: `analyzeGameDesk` (Task 4). Produces: MLB path never imports `analyzeGame`; snapshot row per stored pick.

- [ ] Seam: `result = config.key === 'baseball_mlb' ? await analyzeGameDesk(game, runnerOptions) : await analyzeGame(game, config.key, runnerOptions);` and source tape/recentScores for MLB from the brain result (desk passthrough) so `statsData` block is unchanged.
- [ ] Migration SQL: `create table if not exists pick_desks (pick_id text primary key, game_date date not null, matchup text, desk text not null, created_at timestamptz default now());` Apply: check `ls supabase/migrations` for convention; apply via project's normal path (`npx supabase db push --project-ref xuttubsfgdcjfgmskcol`); if creds block within 10 min, SKIP apply (snapshot write is non-blocking by design) and flag for founder.
- [ ] `storeDeskSnapshot({ pick_id, game_date, matchup, desk })`: upsert, try/catch, `console.warn` on failure, never throws. Call after successful `storePicks` in the MLB immediate-store block.
- [ ] Suite + commit `feat: runner runs the pickdesk brain for MLB; desk snapshot per pick`.

### Task 6: Delete the old MLB game lane

**Files:** `scripts/run-sol-native.js` (delete), `src/services/agentic/orchestrator/spreadEvaluationFactors.js` (MLB exports), `src/services/agentic/orchestrator/passBuilders.js` (buildMlbPass1 + isMLB branches), `src/services/agentic/constitution/mlbConstitution.js` + index MLB game mapping, flash MLB game-walk entries.

- [ ] For each: `grep -rn "<symbol>" src/ scripts/ tests/` first; delete only when the only remaining consumers are the paths being deleted; where props/other sports still import the FILE, remove the MLB-game export and add header: `// MLB GAME LANE DELETED Jul 26 2026 — served by src/services/pickdesk/ (spec 2026-07-26). This file remains for <consumer>.`
- [ ] `buildPass1Message` MLB branch → `throw new Error('[Pass 1] MLB game picks moved to pickdesk (Jul 26 2026)')`.
- [ ] Clean stale references (CLAUDE.md "Clean Up After Yourself"): `grep -rn "sol-native\|analyzeGameSol\|getMlbSeasonAwareness\|getMlbSpreadFactors\|buildMlbPass1" src/ scripts/ tests/ docs/` → zero live-code hits.
- [ ] Full suite green; commit `chore: delete old MLB game lane — pickdesk is the system`.

### Task 7: Smoke + ship

- [ ] Smoke ONE game to the test table (test mode per runner flag; today's slate game id from daily_slate): verify console shows desk char count, one Sol call, card renders, statAudit clean, JSON mapped; read the card. Expected ~60-120s.
- [ ] `npm test` → all green. Push. Founder: `railway up --detach`. Verify boot + first v2 production pick stores with `model` tag, tape rows, `rationale_plain`, snapshot row.
- [ ] Report measured cost from the run's token usage. Update memory files.
