// Sol cutover guard tests (Jul 22 2026).
//
// Gary's game-pick brain is GPT-5.6 Sol via src/services/agentic/pickEngine.js
// (spec: docs/superpowers/specs/2026-07-22-sol-cutover-design.md). These tests
// pin the pieces the cutover depends on: model pricing, the founder-approved
// system prompt, the menu board (no totals), F-5 odds binding, and the
// production result contract.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// analyzeGameSol dependency mocks (hoisted by vitest above all imports).
vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({
  buildScoutReport: vi.fn(async () => ({
    garyText: 'SCOUT: Yankees pitching ERA 3.41. Pirates batting avg .262. Opposing ERA 4.29.',
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
    expect(p).toContain("one job: make the bet on tonight's board that wins money");
    expect(p).toContain("Never cite a number that isn't in the report or a tool result");
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
    // Rate-style claim (.390) — a kind extractNumericClaims provably flags as
    // retryable when absent from the corpus (verified against the real
    // classifier). The behavior under test is retry-then-null.
    const dirty = { content: '{"final_pick":"Yankees ML -150","rationale":"He has a 1.87 ERA and is hitting .390 this season.","confidence_score":0.7}', toolCalls: null, usage: {} };
    sendToOpenAISession.mockReset()
      .mockResolvedValueOnce(dirty)   // first final — untraceable numbers
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
