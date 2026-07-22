# Sol Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gemini with GPT-5.6 Sol as Gary's game-pick brain inside the existing production runner, per `docs/superpowers/specs/2026-07-22-sol-cutover-design.md`.

**Architecture:** A new `pickEngine.js` (the July-rebuild analysis loop, promoted) implements the same result contract `scripts/run-agentic-picks.js` consumes from the old `analyzeGame`; the runner's single analysis call site swaps to it, hard-wired. Everything around the seam (lineup gate, tiers, dedup, storage, grading) is untouched. Props stay on the Gemini orchestrator, moving to `gemini-3.6-flash`.

**Tech Stack:** Node ESM, vitest, OpenAI Responses API via the existing hardened adapter (`openaiSession.js`), Supabase, BDL.

## Global Constraints

- Game-pick model: `gpt-5.6-sol`, `thinkingLevel: 'high'`. No env toggle back to Gemini for game picks.
- The 3-sentence system prompt is founder-approved VERBATIM — do not decorate, extend, or reword it.
- The board shown to Sol = ML + run line per book. NO totals (product cannot ship them), no -200 strip, no steering.
- Stored odds come from the board, never from Sol's prose (F-5). No `_oddsUnverified` ships.
- Scout report reaches Sol with production injury labels INTACT (FRESH/PRICED-IN — LOCKED domain; no `stripInterpretiveLabels`).
- Engine returns `null` for "no storable pick" — the runner's retry tiers own recovery. Never throw for quality problems.
- Props model change only after live verification that `gemini-3.6-flash` exists on our key; on 404 leave props untouched and tell the founder.
- Test stores go to `test_daily_picks` only (`--test`). Production store shape must not change.
- Run the full suite (`npx vitest run`) before every commit; never commit red.

---

### Task 1: costTracker learns the GPT-5.6 family

**Files:**
- Modify: `src/services/agentic/orchestrator/costTracker.js` (pricing table, ~line 19-23)
- Test: `tests/services/agentic/pickEngine.test.js` (new file, first describe block)

**Interfaces:**
- Produces: pricing entries `'gpt-5.6-sol': { input: 5.00, output: 30.00 }`, `'gpt-5.6-terra': { input: 2.50, output: 15.00 }`, `'gpt-5.6-luna': { input: 1.00, output: 6.00 }` in the existing `MODEL_PRICING`-style map consumed by `createCostTracker`.

- [ ] **Step 1: Write the failing test**

```js
// tests/services/agentic/pickEngine.test.js
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const costSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/costTracker.js'), 'utf8');

describe('costTracker: GPT-5.6 family pricing', () => {
  it('prices Sol at $5/$30 and knows Terra + Luna', () => {
    expect(costSrc).toContain("'gpt-5.6-sol'");
    expect(costSrc).toMatch(/'gpt-5\.6-sol':\s*\{\s*input:\s*5\.00,\s*output:\s*30\.00/);
    expect(costSrc).toContain("'gpt-5.6-terra'");
    expect(costSrc).toContain("'gpt-5.6-luna'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: FAIL — `'gpt-5.6-sol'` not found in costTracker source.

- [ ] **Step 3: Add the pricing entries**

In `costTracker.js`, directly below the `'gpt-5.5'` entry:

```js
  // GPT-5.6 family (GA on our account Jul 22 2026). Sol = game-pick brain.
  'gpt-5.6-sol':              { input: 5.00, output: 30.00 },
  'gpt-5.6-terra':            { input: 2.50, output: 15.00 },
  'gpt-5.6-luna':             { input: 1.00, output: 6.00 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agentic/orchestrator/costTracker.js tests/services/agentic/pickEngine.test.js
git commit -m "feat: costTracker prices the GPT-5.6 family (Sol/Terra/Luna)"
```

---

### Task 2: pickEngine pure parts — prompt, menu board, parser, odds binding

**Files:**
- Create: `src/services/agentic/pickEngine.js`
- Test: `tests/services/agentic/pickEngine.test.js` (append)

**Interfaces:**
- Consumes: nothing from other tasks (pure functions only in this task).
- Produces (Task 3 + tests rely on these exact names):
  - `SOL_MODEL` — `'gpt-5.6-sol'`
  - `buildSolSystemPrompt(dateStr) → string`
  - `renderMenuBoard({ homeTeam, awayTeam, boardRows }) → string` — boardRows in `fetchSportsbookOdds` shape: `{ ml_home, ml_away, spread_home, spread_home_odds, spread_away, spread_away_odds, total, total_over_odds, total_under_odds, vendor, displayName }`
  - `parseSolFinal(text) → { final_pick, rationale, confidence_score } | null`
  - `bindPickToBoard(finalPick, { homeTeam, awayTeam, boardRows }) → { pick, type, odds, spread, spreadOdds, book, side } | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/services/agentic/pickEngine.test.js`:

```js
import {
  SOL_MODEL,
  buildSolSystemPrompt,
  renderMenuBoard,
  parseSolFinal,
  bindPickToBoard,
} from '../../../src/services/agentic/pickEngine.js';

const BOARD = [
  { vendor: 'DraftKings', displayName: 'DraftKings', ml_home: -150, ml_away: 130,
    spread_home: -1.5, spread_home_odds: 105, spread_away: 1.5, spread_away_odds: -125,
    total: 8.5, total_over_odds: -110, total_under_odds: -110 },
  { vendor: 'FanDuel', displayName: 'FanDuel', ml_home: -145, ml_away: 125,
    spread_home: -1.5, spread_home_odds: 100, spread_away: 1.5, spread_away_odds: -120,
    total: 8.5, total_over_odds: -108, total_under_odds: -112 },
];
const TEAMS = { homeTeam: 'Yankees', awayTeam: 'Pirates', boardRows: BOARD };

describe('pickEngine: model + prompt', () => {
  it('runs Sol', () => {
    expect(SOL_MODEL).toBe('gpt-5.6-sol');
  });
  it('system prompt is the founder-approved text, verbatim anchors intact', () => {
    const p = buildSolSystemPrompt('2026-07-22');
    expect(p).toContain('You are Gary, a professional sports bettor. Today is 2026-07-22.');
    expect(p).toContain('one job: make the bet on tonight\'s board that wins money');
    expect(p).toContain('Never cite a number that isn\'t in the report or a tool result');
    expect(p).toContain('"final_pick"');
  });
});

describe('pickEngine: renderMenuBoard is the product menu', () => {
  it('renders ML and run line per book', () => {
    const b = renderMenuBoard(TEAMS);
    expect(b).toContain('DraftKings: ML: Pirates +130 / Yankees -150');
    expect(b).toContain('Run line: Pirates +1.5 (-125) / Yankees -1.5 (+105)');
    expect(b).toContain('FanDuel:');
  });
  it('NEVER renders totals (runner filters them; a total pick = lost coverage)', () => {
    const b = renderMenuBoard(TEAMS);
    expect(b).not.toMatch(/total/i);
    expect(b).not.toContain('8.5');
  });
  it('handles empty board', () => {
    expect(renderMenuBoard({ homeTeam: 'A', awayTeam: 'B', boardRows: [] }))
      .toBe('No sportsbook rows available.');
  });
});

describe('pickEngine: parseSolFinal', () => {
  it('parses a fenced JSON block', () => {
    const t = 'thinking...\n```json\n{"final_pick":"Yankees ML -150","rationale":"Gary\'s Take\\n\\nX","confidence_score":0.7}\n```';
    expect(parseSolFinal(t)).toEqual({ final_pick: 'Yankees ML -150', rationale: "Gary's Take\n\nX", confidence_score: 0.7 });
  });
  it('parses a bare object and returns null on garbage', () => {
    expect(parseSolFinal('{"final_pick":"Pirates +1.5 -120","rationale":"r","confidence_score":0.61}').final_pick)
      .toBe('Pirates +1.5 -120');
    expect(parseSolFinal('no json here')).toBeNull();
    expect(parseSolFinal('')).toBeNull();
  });
});

describe('pickEngine: bindPickToBoard (F-5 — board price wins, best line elected)', () => {
  it('binds an ML pick to the best book price for that side', () => {
    const b = bindPickToBoard('Pirates ML +120', TEAMS);
    expect(b).toEqual({ pick: 'Pirates ML +130', type: 'moneyline', odds: 130, spread: null, spreadOdds: null, book: 'DraftKings', side: 'away' });
  });
  it('overrides a price Sol hallucinated with the real board price', () => {
    const b = bindPickToBoard('Yankees ML -190', TEAMS);
    expect(b.odds).toBe(-145); // FanDuel's better price, not Sol's -190
    expect(b.book).toBe('FanDuel');
  });
  it('binds a run-line pick with best spread odds', () => {
    const b = bindPickToBoard('Yankees -1.5 +100', TEAMS);
    expect(b).toEqual({ pick: 'Yankees -1.5 +105', type: 'spread', odds: 105, spread: -1.5, spreadOdds: 105, book: 'DraftKings', side: 'home' });
  });
  it('returns null when no team matches or board is empty', () => {
    expect(bindPickToBoard('Dodgers ML -120', TEAMS)).toBeNull();
    expect(bindPickToBoard('Yankees ML -150', { ...TEAMS, boardRows: [] })).toBeNull();
  });
  it('matches full team names by their last word (app team fields)', () => {
    const t = { homeTeam: 'New York Yankees', awayTeam: 'Pittsburgh Pirates', boardRows: BOARD };
    expect(bindPickToBoard('Yankees ML -150', t).side).toBe('home');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: FAIL — `pickEngine.js` does not exist.

- [ ] **Step 3: Create `src/services/agentic/pickEngine.js` (pure parts)**

```js
/**
 * PICK ENGINE — Gary's game-pick brain on GPT-5.6 Sol (Jul 22 2026 cutover).
 *
 * Born from the July rebuild: strong model + full data + hard rails + almost
 * no instruction. Promoted to production per
 * docs/superpowers/specs/2026-07-22-sol-cutover-design.md. Replaces the
 * Gemini orchestrator for GAME picks; props still run the Gemini orchestrator.
 *
 * analyzeGameSol(game, sportKey, options) honors the result contract
 * scripts/run-agentic-picks.js consumed from the old analyzeGame, returning
 * null when no storable pick was produced (retry tiers own recovery).
 */
import { buildScoutReport } from './scoutReport/scoutReportBuilder.js';
import { fetchStats } from './tools/statRouters/index.js';
import { summarizeStatForContext, normalizeSportToLeague } from './orchestrator/orchestratorHelpers.js';
import { geminiGroundingSearch } from './scoutReport/shared/grounding.js';
import { toolDefinitions } from './tools/toolDefinitions.js';
import { createOpenAISession, sendToOpenAISession } from './orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, buildStatAuditRetryMessage } from './orchestrator/statAudit.js';

export const SOL_MODEL = 'gpt-5.6-sol';
const MAX_ITERATIONS = 12;
const MAX_GROUNDING = 6;

const todayEST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** The founder-approved system prompt, verbatim. Do not decorate. */
export function buildSolSystemPrompt(dateStr) {
  return [
    `You are Gary, a professional sports bettor. Today is ${dateStr}.`,
    `You have a bankroll, and one job: make the bet on tonight's board that wins money.`,
    `You will get a scout report and the full sportsbook board for one game, and you have live stat tools if you want more.`,
    `Never cite a number that isn't in the report or a tool result; any news you use must carry a date.`,
    `When you've decided, return JSON: {"final_pick": "...", "rationale": "Gary's Take\\n\\n<announcer-style intro, the pick, and your real reasons>", "confidence_score": 0.0-1.0}.`,
  ].join(' ');
}

const fmtOdds = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '—');
  return n > 0 ? `+${n}` : `${n}`;
};

/**
 * The board Sol sees = the product menu: ML + run line per book. Totals are
 * NOT offered (the game-pick product can't ship them; rendering them invites
 * a pick the runner would filter — silent lost coverage). No -200 strip.
 */
export function renderMenuBoard({ homeTeam, awayTeam, boardRows = [] } = {}) {
  const lines = [];
  for (const b of boardRows) {
    const bits = [];
    if (b.ml_away != null || b.ml_home != null) {
      bits.push(`ML: ${awayTeam} ${fmtOdds(b.ml_away)} / ${homeTeam} ${fmtOdds(b.ml_home)}`);
    }
    if (b.spread_away != null || b.spread_home != null) {
      const away = `${awayTeam} ${Number(b.spread_away) > 0 ? '+' : ''}${b.spread_away} (${fmtOdds(b.spread_away_odds)})`;
      const home = `${homeTeam} ${Number(b.spread_home) > 0 ? '+' : ''}${b.spread_home} (${fmtOdds(b.spread_home_odds)})`;
      bits.push(`Run line: ${away} / ${home}`);
    }
    if (bits.length) lines.push(`${b.vendor || b.displayName || 'book'}: ${bits.join(' | ')}`);
  }
  return lines.join('\n') || 'No sportsbook rows available.';
}

/** Tolerant finalize-JSON extraction: fenced block first, then bare object. */
export function parseSolFinal(text) {
  if (typeof text !== 'string' || !text) return null;
  const candidates = [];
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) candidates.push(bare[0]);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj.final_pick === 'string' && obj.final_pick.trim()) {
        return {
          final_pick: obj.final_pick.trim(),
          rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
          confidence_score: Number.isFinite(Number(obj.confidence_score)) ? Number(obj.confidence_score) : null,
        };
      }
    } catch { /* try next candidate */ }
  }
  return null;
}

/**
 * F-5 discipline: bind Sol's pick text to a REAL board row. The stored price
 * is the best book price for the picked side/bet type — never Sol's prose.
 * Returns null when the pick can't be bound (runner treats as no pick).
 */
export function bindPickToBoard(finalPick, { homeTeam, awayTeam, boardRows = [] } = {}) {
  if (!finalPick || !boardRows.length) return null;
  const text = String(finalPick).toLowerCase();
  const matches = (team) => {
    if (!team) return false;
    const t = String(team).toLowerCase();
    return text.includes(t) || text.includes(t.split(' ').pop());
  };
  const homeHit = matches(homeTeam);
  const awayHit = matches(awayTeam);
  if (homeHit === awayHit) return null; // neither, or ambiguous both
  const side = homeHit ? 'home' : 'away';
  const team = homeHit ? homeTeam : awayTeam;

  const isRunLine = /run\s*line|[+-]\d+\.5\b/i.test(finalPick) && !/\bml\b|moneyline/i.test(finalPick);

  if (isRunLine) {
    let best = null;
    for (const b of boardRows) {
      const spread = side === 'home' ? b.spread_home : b.spread_away;
      const odds = side === 'home' ? b.spread_home_odds : b.spread_away_odds;
      if (spread == null || odds == null) continue;
      if (!best || Number(odds) > best.odds) {
        best = { spread: Number(spread), odds: Number(odds), book: b.vendor || b.displayName || null };
      }
    }
    if (!best) return null;
    const s = best.spread > 0 ? `+${best.spread}` : `${best.spread}`;
    return { pick: `${team} ${s} ${fmtOdds(best.odds)}`, type: 'spread', odds: best.odds, spread: best.spread, spreadOdds: best.odds, book: best.book, side };
  }

  let best = null;
  for (const b of boardRows) {
    const odds = side === 'home' ? b.ml_home : b.ml_away;
    if (odds == null) continue;
    if (!best || Number(odds) > best.odds) best = { odds: Number(odds), book: b.vendor || b.displayName || null };
  }
  if (!best) return null;
  return { pick: `${team} ML ${fmtOdds(best.odds)}`, type: 'moneyline', odds: best.odds, spread: null, spreadOdds: null, book: best.book, side };
}
```

(`analyzeGameSol` and its imports land in Task 3 — the imports above are included now so the file is complete once; unused-import lint is acceptable between tasks.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: PASS (all Task 1 + Task 2 blocks)

- [ ] **Step 5: Commit**

```bash
git add src/services/agentic/pickEngine.js tests/services/agentic/pickEngine.test.js
git commit -m "feat: pickEngine pure parts — Sol prompt, menu board, parser, F-5 odds binding"
```

---

### Task 3: `analyzeGameSol` — the loop, hard rails, result contract

**Files:**
- Modify: `src/services/agentic/pickEngine.js` (append)
- Test: `tests/services/agentic/pickEngine.test.js` (append)

**Interfaces:**
- Consumes: Task 2 exports; `createOpenAISession({ modelName, systemPrompt, tools, thinkingLevel }) → session`; `sendToOpenAISession(session, message, { isFunctionResponse }) → { content, toolCalls, usage: { prompt_tokens, completion_tokens } }`; `buildScoutReport(game, sport, { sportsbookOdds }) → { garyText, text, injuries, venue, verifiedTaleOfTape }`; `fetchStats(sportKey, token, homeTeam, awayTeam, { game })`; `auditPickRationale({ rationale }, messages) → { unsupported, retryable, warnOnly, checked }` (messages = `[{ content }]`).
- Produces: `analyzeGameSol(game, sportKey, options) → result | null` where result = `{ pick, type, odds, confidence, homeTeam, awayTeam, league, sport, rationale, spread, spreadOdds, moneylineHome, moneylineAway, total, totalOdds, toolCallHistory, verifiedTaleOfTape, injuries, venue, _statAuditWarnings, agentic }` — the exact fields `run-agentic-picks.js` reads.

- [ ] **Step 1: Write the failing tests (mocked adapter + scout)**

Append to `tests/services/agentic/pickEngine.test.js` (module-level mocks must be hoisted above the existing static import — move all `vi.mock` calls to the very top of the file, before imports):

```js
vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({
  buildScoutReport: vi.fn(async () => ({
    garyText: 'SCOUT: Yankees pitching ERA 3.41. Pirates batting avg .262.',
    text: 'fallback',
    injuries: { Yankees: [], Pirates: [] },
    venue: 'Yankee Stadium',
    verifiedTaleOfTape: { text: 'tape', rows: [{ name: 'ERA', token: 'MLB_TEAM_ERA', home: { team: 'Yankees', value: '3.41' }, away: { team: 'Pirates', value: '4.29' } }] },
  })),
}));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js', () => ({
  createOpenAISession: vi.fn(async (opts) => ({ opts })),
  sendToOpenAISession: vi.fn(),
}));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({
  fetchStats: vi.fn(async () => ({ home: { era: '3.41' }, away: { era: '4.29' } })),
}));
vi.mock('../../../src/services/agentic/scoutReport/shared/grounding.js', () => ({
  geminiGroundingSearch: vi.fn(async () => ({ success: true, data: 'No fresh news. (Jul 22, 2026)' })),
}));

// ...existing imports...
import { analyzeGameSol } from '../../../src/services/agentic/pickEngine.js';
import { sendToOpenAISession, createOpenAISession } from '../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';

const GAME = { home_team: 'Yankees', away_team: 'Pirates', bdl_game_id: 5059300, commence_time: '2026-07-22T17:05:00Z' };
const FINAL = { content: '```json\n{"final_pick":"Yankees ML -150","rationale":"Gary\'s Take\\n\\nERA 3.41 vs 4.29 says the Yankees arm wins this.","confidence_score":0.66}\n```', toolCalls: null, usage: { prompt_tokens: 1000, completion_tokens: 200 } };

describe('pickEngine: analyzeGameSol', () => {
  it('produces the production result contract from a clean final answer', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce(FINAL);
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r.pick).toBe('Yankees ML -145');       // board-elected best price, not Sol's -150
    expect(r.type).toBe('moneyline');
    expect(r.odds).toBe(-145);
    expect(r.confidence).toBe(0.66);
    expect(r.homeTeam).toBe('Yankees');
    expect(r.awayTeam).toBe('Pirates');
    expect(r.league).toBe('MLB');
    expect(r.moneylineHome).toBe(-145);           // best across books
    expect(r.moneylineAway).toBe(130);
    expect(r.total).toBe(8.5);                    // stored for the app, never shown to Sol
    expect(r.verifiedTaleOfTape.rows).toHaveLength(1);
    expect(r.injuries).toBeTruthy();
    expect(r.venue).toBe('Yankee Stadium');
    expect(r.agentic).toBe(true);
    expect(createOpenAISession).toHaveBeenCalledWith(expect.objectContaining({ modelName: 'gpt-5.6-sol', thinkingLevel: 'high' }));
  });

  it('executes tool calls and records toolCallHistory in runner shape', async () => {
    sendToOpenAISession.mockReset()
      .mockResolvedValueOnce({ content: null, toolCalls: [{ function: { name: 'fetch_stats', arguments: '{"token":"MLB_BULLPEN"}' } }], usage: { prompt_tokens: 500, completion_tokens: 50 } })
      .mockResolvedValueOnce(FINAL);
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r.toolCallHistory).toEqual([{ token: 'MLB_BULLPEN', quality: 'ok' }]);
  });

  it('returns null with no board rows (odds discipline) and null on unparseable final', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce(FINAL);
    expect(await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: [] })).toBeNull();
    sendToOpenAISession.mockReset().mockResolvedValueOnce({ content: 'no json', toolCalls: null, usage: {} });
    expect(await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD })).toBeNull();
  });

  it('statAudit: retries once on untraceable numbers, then gives up (null)', async () => {
    // Bare season-stat claim (NOT windowed phrasing like "since June" — that
    // classifies warnOnly and would ship with warnings instead of retrying).
    // If this fixture lands in warnOnly on the real classifier, adjust the
    // claim until audit.retryable is non-empty — the behavior under test is
    // retry-then-null, not the classifier taxonomy.
    const dirty = { content: '{"final_pick":"Yankees ML -150","rationale":"His 1.87 ERA is elite.","confidence_score":0.7}', toolCalls: null, usage: {} };
    sendToOpenAISession.mockReset()
      .mockResolvedValueOnce(dirty)   // first final — 1.87 untraceable
      .mockResolvedValueOnce(dirty);  // retry — still dirty
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r).toBeNull();
    expect(sendToOpenAISession).toHaveBeenCalledTimes(2);
  });

  it('returns null when the pick cannot bind to the board (e.g., a totals pick)', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce({ content: '{"final_pick":"Under 8.5 -110","rationale":"r","confidence_score":0.6}', toolCalls: null, usage: {} });
    expect(await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: FAIL — `analyzeGameSol` is not exported.

- [ ] **Step 3: Append `analyzeGameSol` to `pickEngine.js`**

```js
async function executeToolCall(tc, sportKey, homeTeam, awayTeam, game, state) {
  const name = tc.function?.name;
  let toolArgs = {};
  try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { /* leave empty */ }

  if (name === 'fetch_stats') {
    const token = toolArgs.token || toolArgs.stat_type;
    if (!token) return { name, content: 'fetch_stats needs a "token" argument.' };
    try {
      const result = await fetchStats(sportKey, token, homeTeam, awayTeam, { game });
      const summary = summarizeStatForContext(result, token, homeTeam, awayTeam);
      state.corpus.push({ content: summary });
      state.toolCallHistory.push({ token, quality: 'ok' });
      return { name, content: summary };
    } catch (e) {
      state.toolCallHistory.push({ token, quality: 'unavailable' });
      return { name, content: `Error fetching ${token}: ${e.message}` };
    }
  }
  if (name === 'fetch_narrative_context') {
    if (state.grounding >= MAX_GROUNDING) return { name, content: `Search limit reached (${MAX_GROUNDING}).` };
    state.grounding++;
    try {
      const r = await geminiGroundingSearch(toolArgs.query || '', { maxTokens: 1500 });
      const text = r?.data || 'No results.';
      state.corpus.push({ content: text });
      return { name, content: text };
    } catch (e) {
      return { name, content: `Search error: ${e.message}` };
    }
  }
  return { name: name || 'unknown', content: 'Tool not available.' };
}

const bestAcrossBooks = (values) => {
  let best = null;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (best === null || n > best) best = n; // American odds: numerically larger = better payout
  }
  return best;
};

/**
 * Analyze one game with Sol. Returns the production result contract, or null
 * when no storable pick was produced (lineup-gate throw from the scout
 * builder propagates — the runner logs it and the next tier retries).
 */
export async function analyzeGameSol(game, sportKey, options = {}) {
  const homeTeam = game.home_team?.full_name || game.home_team?.name || game.home_team;
  const awayTeam = game.away_team?.full_name || game.away_team?.name || game.away_team;
  const boardRows = Array.isArray(options.sportsbookOdds) ? options.sportsbookOdds : [];
  if (!boardRows.length) {
    console.warn(`[PickEngine] ${awayTeam} @ ${homeTeam}: no sportsbook rows — no pick this tier (odds discipline).`);
    return null;
  }

  const scout = await buildScoutReport(game, sportKey, { sportsbookOdds: options.sportsbookOdds });
  const scoutText = scout.garyText || scout.text || '';
  const board = renderMenuBoard({ homeTeam, awayTeam, boardRows });

  const session = await createOpenAISession({
    modelName: SOL_MODEL,
    systemPrompt: buildSolSystemPrompt(todayEST()),
    tools: toolDefinitions,
    thinkingLevel: 'high',
  });

  const state = { corpus: [{ content: scoutText }, { content: board }], toolCallHistory: [], grounding: 0 };
  let message = [
    `## SCOUT REPORT — ${awayTeam} @ ${homeTeam}`,
    scoutText,
    '',
    "## TONIGHT'S BOARD",
    board,
    '',
    `${awayTeam} @ ${homeTeam}. What's your best bet on this board?`,
  ].join('\n');
  let isFunctionResponse = false;
  const usage = { in: 0, out: 0 };
  let finalText = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await sendToOpenAISession(session, message, { isFunctionResponse });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    if (res.toolCalls?.length) {
      const responses = [];
      for (const tc of res.toolCalls) responses.push(await executeToolCall(tc, sportKey, homeTeam, awayTeam, game, state));
      message = responses;
      isFunctionResponse = true;
      continue;
    }
    finalText = res.content;
    break;
  }

  let parsed = parseSolFinal(finalText);
  if (!parsed) {
    console.warn(`[PickEngine] ${awayTeam} @ ${homeTeam}: no valid final JSON — no pick this tier.`);
    return null;
  }

  // Hard rail: anti-fabrication. One corrective retry, then no pick this tier.
  let audit = auditPickRationale({ rationale: parsed.rationale }, state.corpus);
  if (audit.retryable.length > 0) {
    console.warn(`[PickEngine] statAudit: ${audit.retryable.length} untraceable claim(s) — one corrective retry`);
    const res = await sendToOpenAISession(session, buildStatAuditRetryMessage(audit.retryable), { isFunctionResponse: false });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    const reparsed = parseSolFinal(res.content);
    const reaudit = reparsed ? auditPickRationale({ rationale: reparsed.rationale }, state.corpus) : null;
    if (!reparsed || reaudit.retryable.length > 0) {
      console.warn(`[PickEngine] still untraceable after retry — no pick this tier.`);
      return null;
    }
    parsed = reparsed;
    audit = reaudit;
  }

  const bound = bindPickToBoard(parsed.final_pick, { homeTeam, awayTeam, boardRows });
  if (!bound) {
    console.warn(`[PickEngine] "${parsed.final_pick}" did not bind to the board (off-menu or ambiguous) — no pick this tier.`);
    return null;
  }

  const cost = (usage.in * 5 + usage.out * 30) / 1e6;
  console.log(`[PickEngine/Sol] ✅ ${bound.pick} (conf ${parsed.confidence_score}) — ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(2)} @ ${bound.book}`);

  return {
    pick: bound.pick,
    type: bound.type,
    odds: bound.odds,
    confidence: parsed.confidence_score,
    homeTeam,
    awayTeam,
    league: normalizeSportToLeague(sportKey),
    sport: sportKey,
    rationale: parsed.rationale,
    spread: bound.spread ?? bestAcrossBooks(boardRows.map(b => b.spread_home)),
    spreadOdds: bound.spreadOdds,
    moneylineHome: bestAcrossBooks(boardRows.map(b => b.ml_home)),
    moneylineAway: bestAcrossBooks(boardRows.map(b => b.ml_away)),
    total: boardRows.find(b => b.total != null && b.total !== '')?.total ?? null,
    totalOdds: null,
    toolCallHistory: state.toolCallHistory,
    verifiedTaleOfTape: scout.verifiedTaleOfTape ?? null,
    injuries: scout.injuries ?? null,
    venue: scout.venue ?? null,
    _statAuditWarnings: audit.warnOnly.length ? audit.warnOnly : null,
    agentic: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: PASS. If the contract test fails on `moneylineHome`, check `bestAcrossBooks` null handling — board rows with missing books must not produce `NaN`.

- [ ] **Step 5: Run the whole suite (mocks must not leak)**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/services/agentic/pickEngine.js tests/services/agentic/pickEngine.test.js
git commit -m "feat: analyzeGameSol — Sol loop with statAudit rail and production result contract"
```

---

### Task 4: The seam — run-agentic-picks.js calls Sol

**Files:**
- Modify: `scripts/run-agentic-picks.js:21` (import) and `:963` (call site); delete the now-dead game system-prompt build at `:897` if it becomes unused.
- Test: `tests/services/agentic/pickEngine.test.js` (append source-pin block)

**Interfaces:**
- Consumes: `analyzeGameSol` from Task 3.
- Produces: production game picks generated by Sol; no behavioral change anywhere else in the runner.

- [ ] **Step 1: Write the failing source-pin test**

```js
const runnerSrc = readFileSync(path.join(__dirname, '../../../scripts/run-agentic-picks.js'), 'utf8');

describe('cutover: the runner is hard-wired to Sol for game picks', () => {
  it('calls analyzeGameSol at the analysis seam', () => {
    expect(runnerSrc).toContain('analyzeGameSol(game, config.key, runnerOptions)');
  });
  it('has no Gemini game-pick dispatch and no engine toggle', () => {
    expect(runnerSrc).not.toMatch(/\banalyzeGame\(/);
    expect(runnerSrc).not.toContain('GARY_ENGINE');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/services/agentic/pickEngine.test.js`
Expected: FAIL — runner still calls `analyzeGame(`.

- [ ] **Step 3: Swap the seam**

At line 21, replace:

```js
const { analyzeGame, buildSystemPrompt } = await import('../src/services/agentic/orchestrator/index.js');
```

with:

```js
const { analyzeGameSol } = await import('../src/services/agentic/pickEngine.js');
```

At the call site (~line 963), replace `result = await analyzeGame(game, config.key, runnerOptions);` with:

```js
          result = await analyzeGameSol(game, config.key, runnerOptions);
```

Then find every other use of `buildSystemPrompt` / `constitution` in this script (line ~897 `const systemPrompt = buildSystemPrompt(constitution, config.key);` and whatever consumes `systemPrompt`): if nothing consumes them after the swap, delete those lines and any constitution import that fed them (Clean Up After Yourself). If something still consumes them, STOP and re-read — the seam map missed a consumer; do not leave dead wiring.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all green (some old orchestrator tests pin prompt files, not the runner — they must still pass since orchestrator files are untouched).

- [ ] **Step 5: Commit**

```bash
git add scripts/run-agentic-picks.js tests/services/agentic/pickEngine.test.js
git commit -m "feat!: game picks are made by GPT-5.6 Sol — Gemini game-pick dispatch removed"
```

---

### Task 5: Props → gemini-3.6-flash (verify first)

**Files:**
- Modify: `src/services/agentic/orchestrator/orchestratorConfig.js` (~line 25-29), `src/services/agentic/orchestrator/agentLoop.js:144`
- Test: `tests/services/agentic/modelTiering.test.js`

**Interfaces:**
- Produces: `export const GEMINI_PROPS_MODEL = 'gemini-3.6-flash';` in orchestratorConfig; agentLoop's split becomes `isPropsMode ? GEMINI_PROPS_MODEL : GEMINI_PRO_MODEL`.

- [ ] **Step 1: Verify the model exists on our key (GATE — do not proceed on failure)**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/gary2.0 && node -e "
require('dotenv').config();
fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + process.env.GEMINI_API_KEY + '&pageSize=200')
  .then(r => r.json())
  .then(j => { const hits = (j.models||[]).map(m=>m.name).filter(n=>n.includes('3.6')); console.log(JSON.stringify(hits, null, 1)); });"
```

Expected: a `models/gemini-3.6-flash` entry. **If absent: STOP this task, leave props untouched, and report to the founder** (the spec's no-silent-fallback rule). Use the exact returned id (e.g. if only `gemini-3.6-flash-preview` exists, that exact string is what ships, and say so in the commit message).

- [ ] **Step 2: Update the failing tiering test first**

In `tests/services/agentic/modelTiering.test.js`, replace the pin:

```js
  it('primaryModel branches on props mode', () => {
    expect(agentLoopSrc).toContain('isPropsMode ? GEMINI_PROPS_MODEL : GEMINI_PRO_MODEL');
  });

  it('props run gemini-3.6-flash (founder call, Jul 22 2026)', () => {
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/GEMINI_PROPS_MODEL = 'gemini-3\.6-flash'/);
  });
```

Run: `npx vitest run tests/services/agentic/modelTiering.test.js` — expected FAIL.

- [ ] **Step 3: Make the change**

orchestratorConfig.js, next to the existing model consts:

```js
// Props lane (Jul 22 2026, founder call): 3.6 Flash released today.
export const GEMINI_PROPS_MODEL = 'gemini-3.6-flash';
```

agentLoop.js line 144: change `isPropsMode ? GEMINI_FLASH_MODEL : GEMINI_PRO_MODEL` to `isPropsMode ? GEMINI_PROPS_MODEL : GEMINI_PRO_MODEL` and add `GEMINI_PROPS_MODEL` to the orchestratorConfig import in that file. Add costTracker pricing for `'gemini-3.6-flash'` only if pricing is published; otherwise reuse the flash-preview rates with a `// verify` comment.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/services/agentic/orchestrator/orchestratorConfig.js src/services/agentic/orchestrator/agentLoop.js src/services/agentic/orchestrator/costTracker.js tests/services/agentic/modelTiering.test.js
git commit -m "feat: props lane moves to gemini-3.6-flash (verified live on our key)"
```

---

### Task 6: Deletions — the scratch arm is superseded

**Files:**
- Delete: `scripts/run-scratch-arm.js`, `src/services/agentic/scratchArm/` (whole dir), `tests/services/agentic/scratchArm.test.js`

- [ ] **Step 1: Sweep for references before deleting**

```bash
grep -rn "scratchArm\|run-scratch-arm\|SCRATCH_MODEL" src scripts tests package.json | grep -v node_modules
```

Expected: only the three files being deleted (docs/memory references are fine and stay). If anything else imports them, fix that consumer first.

- [ ] **Step 2: Delete and verify**

```bash
git rm scripts/run-scratch-arm.js tests/services/agentic/scratchArm.test.js
git rm -r src/services/agentic/scratchArm
npx vitest run
```

Expected: suite green, nothing imports the deleted files.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete the scratch arm — superseded by pickEngine (production Sol brain)"
```

---

### Task 7: Launch review — Sol's first picks, founder gate

- [ ] **Step 1: Full-suite sanity** — `npx vitest run`, all green.
- [ ] **Step 2: Real-game test through the PRODUCTION runner** (test table only):

```bash
node scripts/run-agentic-picks.js --mlb --test --test-name "sol-launch-review" --game-id <earliest-available-game-id>
```

Repeat for 2-3 games with posted lineups. Watch for: lineup gate behavior, tool-call pattern, statAudit output, cost line, stored row shape.

- [ ] **Step 3: Shape parity check** — pull one stored test pick and one recent production pick from Supabase; diff their JSON keys. Expected: same keys (minus `test_arm`-era fields).
- [ ] **Step 4: Show the founder the FULL cards (verbatim rationales, no summaries) + logs.** **HARD GATE: founder says GO before Task 8.**

---

### Task 8: Deploy — Railway cutover, laptop retired

- [ ] **Step 1: Confirm `OPENAI_API_KEY` is set on the Railway service** (founder checks dashboard, or `railway variables` if CLI is linked). Without it, tonight's tiers fail — do not push until confirmed.
- [ ] **Step 2: Push** — `git push origin main`; watch Railway redeploy logs for scheduler startup + slate publish lines.
- [ ] **Step 3: Retire the laptop scheduler** (AFTER Railway confirms healthy):

```bash
launchctl bootout gui/$(id -u)/com.gary.scheduler
launchctl bootout gui/$(id -u)/com.gary.scheduler-watchdog
```

- [ ] **Step 4: Babysit the first Railway tier** — verify a Sol pick lands in `daily_picks`, notification fires, app renders the card. Report cards + cost to the founder.
