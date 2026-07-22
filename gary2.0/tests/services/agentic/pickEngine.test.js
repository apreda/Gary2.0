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
    expect(p).toContain('never use undated news');        // rev Jul 22 PM: traceability without card citations
    expect(p).toContain('4-6 full paragraphs');           // rev Jul 22 PM: founder length cue
    expect(p).not.toContain('must carry a date');         // the phrasing that printed "per reporting dated..."
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

const runnerSrc = readFileSync(path.join(__dirname, '../../../scripts/run-agentic-picks.js'), 'utf8');

describe('cutover: the runner is hard-wired to Sol for game picks', () => {
  it('calls analyzeGameSol at the analysis seam', () => {
    expect(runnerSrc).toContain('analyzeGameSol(game, config.key, runnerOptions)');
  });
  it('has no Gemini game-pick dispatch and no engine toggle', () => {
    expect(runnerSrc).not.toMatch(/\banalyzeGame\(/);
    expect(runnerSrc).not.toContain('GARY_ENGINE');
    expect(runnerSrc).not.toContain('buildSystemPrompt');
    expect(runnerSrc).not.toContain('getConstitution');
  });
});

describe('pickEngine: per-game error containment', () => {
  it('a scout-builder throw (e.g. lineup gate) returns { error }, never propagates', async () => {
    const { buildScoutReport } = await import('../../../src/services/agentic/scoutReport/scoutReportBuilder.js');
    buildScoutReport.mockRejectedValueOnce(new Error('[Scout Report] HARD FAIL — MLB requires lineups'));
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r).toEqual({ error: expect.stringContaining('HARD FAIL — MLB requires lineups') });
  });
});

describe('pickEngine: bug-hunt fixes (Jul 22 afternoon)', () => {
  it('bindPickToBoard: when BOTH teams appear, the earlier mention wins', () => {
    const b = bindPickToBoard('Yankees ML -150 over the Pirates', TEAMS);
    expect(b).not.toBeNull();
    expect(b.side).toBe('home');
    const b2 = bindPickToBoard('Pirates +1.5 against the Yankees', TEAMS);
    expect(b2.side).toBe('away');
    expect(b2.type).toBe('spread');
  });

  it('normalizes a percent-style confidence (66 -> 0.66) and nulls garbage', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce({ content: '{"final_pick":"Yankees ML -150","rationale":"Gary\'s Take\\n\\nERA 3.41 vs 4.29.","confidence_score":66}', toolCalls: null, usage: {} });
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r.confidence).toBe(0.66);
    sendToOpenAISession.mockReset().mockResolvedValueOnce({ content: '{"final_pick":"Yankees ML -150","rationale":"Gary\'s Take\\n\\nERA 3.41 vs 4.29.","confidence_score":-3}', toolCalls: null, usage: {} });
    const r2 = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r2.confidence).toBeNull();
  });

  it('sends ONE finalize nudge when the iteration cap is hit mid-tool-loop', async () => {
    const toolTurn = { content: null, toolCalls: [{ function: { name: 'fetch_stats', arguments: '{"token":"MLB_BULLPEN"}' } }], usage: {} };
    sendToOpenAISession.mockReset();
    for (let i = 0; i < 12; i++) sendToOpenAISession.mockResolvedValueOnce(toolTurn);
    sendToOpenAISession.mockResolvedValueOnce(FINAL); // the nudge answer
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r).not.toBeNull();
    expect(r.pick).toBe('Yankees ML -145');
    expect(sendToOpenAISession).toHaveBeenCalledTimes(13);
  });

  it('only advertises the tools the engine actually implements', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce(FINAL);
    await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    const tools = createOpenAISession.mock.calls.at(-1)[0].tools;
    const names = tools.map(t => t.function?.name);
    expect(names.sort()).toEqual(['fetch_narrative_context', 'fetch_stats']);
  });
});

describe('pickEngine: coverage fallback (locked every-game policy)', () => {
  it('falls back to game-level flat odds when no per-book rows exist', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce(FINAL);
    const flatGame = { ...GAME, moneyline_home: -160, moneyline_away: 140, spread_home: -1.5, spread_home_odds: 110, spread_away: 1.5, spread_away_odds: -130, total: 8.5 };
    const r = await analyzeGameSol(flatGame, 'baseball_mlb', { sportsbookOdds: [] });
    expect(r).not.toBeNull();
    expect(r.pick).toBe('Yankees ML -160');
    expect(r.moneylineAway).toBe(140);
  });
  it('still refuses when the game has no odds at all (F-5)', async () => {
    sendToOpenAISession.mockReset().mockResolvedValueOnce(FINAL);
    expect(await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: [] })).toBeNull();
  });
});

describe('facts-only data layer (founder law, Jul 22): the desk never interprets', () => {
  const mlbScoutSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/scoutReport/sports/mlb.js'), 'utf8');
  const toolDefsSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/tools/toolDefinitions.js'), 'utf8');

  it('scout report carries no interpretive legends, computed verdict-deltas, or alarm dressing', () => {
    expect(mlbScoutSrc).not.toContain('leans fly-ball');       // GO/AO legend taught the frame
    expect(mlbScoutSrc).not.toContain('ERA minus xERA');       // pre-computed delta = conclusion-shaped number
    expect(mlbScoutSrc).not.toContain('EXPECTED VS ACTUAL');   // header named the regression frame
    expect(mlbScoutSrc).not.toContain('availability tonight follows'); // told him what to conclude
    expect(mlbScoutSrc).not.toContain('⚠️');                   // alarm labels are judgments
    expect(mlbScoutSrc).not.toContain('small-sample concerns');
    expect(mlbScoutSrc).not.toContain('expected vs actual');   // frame survived in sub-headers
    expect(mlbScoutSrc).not.toContain('minus wOBA');           // hitter-side computed delta
  });

  it('tool descriptions are plain function statements — no example stories, no process quotas', () => {
    expect(toolDefsSrc).not.toContain('Revenge spot');
    expect(toolDefsSrc).not.toContain('birthday performance');
    expect(toolDefsSrc).not.toContain('narrative momentum');
    expect(toolDefsSrc).not.toContain('2-5 stat categories');
  });
});

import { computeMlbSeasonSeries } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('season head-to-head (fan-parity data, Jul 22)', () => {
  const idx = new Map([
    [1, { date: '2026-05-05T23:00:00Z', status: 'STATUS_FINAL', homeId: 19, awayId: 22, homeRuns: 7, awayRuns: 2 }],
    [2, { date: '2026-05-06T23:00:00Z', status: 'STATUS_FINAL', homeId: 19, awayId: 22, homeRuns: 1, awayRuns: 4 }],
    [3, { date: '2026-07-20T23:00:00Z', status: 'STATUS_FINAL', homeId: 22, awayId: 19, homeRuns: 3, awayRuns: 9 }],
    [4, { date: '2026-07-22T23:00:00Z', status: 'STATUS_SCHEDULED', homeId: 19, awayId: 22, homeRuns: null, awayRuns: null }],
    [5, { date: '2026-06-01T23:00:00Z', status: 'STATUS_FINAL', homeId: 19, awayId: 14, homeRuns: 2, awayRuns: 1 }],
  ]);

  it('tallies only FINAL meetings between the two teams, oriented to tonight\'s home team', () => {
    const r = computeMlbSeasonSeries(idx, 19, 22, 'Yankees', 'Pirates');
    expect(r.line).toBe('Yankees lead the season series 2-1 (3 meetings).');
    expect(r.results).toHaveLength(3);
    expect(r.results[0]).toBe('2026-05-05: Yankees 7-2 vs Pirates');
    expect(r.results[2]).toBe('2026-07-20: Yankees 9-3 @ Pirates');
  });

  it('handles away-team lead and no meetings', () => {
    const r = computeMlbSeasonSeries(idx, 22, 19, 'Pirates', 'Yankees');
    expect(r.line).toBe('Yankees lead the season series 2-1 (3 meetings).');
    expect(computeMlbSeasonSeries(idx, 19, 6, 'Yankees', 'White Sox')).toBeNull();
    expect(computeMlbSeasonSeries(null, 19, 22, 'A', 'B')).toBeNull();
  });
});

import { toEtDate } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('ET dates for BDL UTC instants (west-coast night games)', () => {
  it('rolls a post-midnight-UTC game back to its ET calendar day', () => {
    expect(toEtDate('2026-07-22T02:10:00.000Z')).toBe('2026-07-21');
    expect(toEtDate('2026-07-21T23:05:00.000Z')).toBe('2026-07-21');
  });
});

import { computeMlbH2hBySeason } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('historic head-to-head by season (facts only, never "owns")', () => {
  const row = (season, hId, aId, hr, ar, st = 'regular', status = 'STATUS_FINAL') =>
    ({ season, season_type: st, status, home_team: { id: hId }, away_team: { id: aId }, home_team_data: { runs: hr }, away_team_data: { runs: ar } });
  const rows = [
    row(2025, 16, 7, 5, 2), row(2025, 16, 7, 3, 4), row(2025, 7, 16, 1, 6),   // MIL 2-1... oriented to home
    row(2024, 7, 16, 2, 8), row(2024, 7, 16, 0, 3),
    row(2025, 16, 7, 9, 1, 'spring_training'),   // excluded: spring
    row(2025, 16, 7, 4, 4),                       // excluded: tie/suspended artifact
    row(2025, 16, 12, 5, 2),                      // excluded: different opponent
  ];

  it('tallies per season, regular-season finals only, oriented to tonight\'s home team', () => {
    const r = computeMlbH2hBySeason(rows, 16, 7, 'Brewers');
    expect(r.line).toBe('Head-to-head, prior seasons (regular season): 2025: Brewers 2-1 | 2024: Brewers 2-0');
  });

  it('null when the pair never met', () => {
    expect(computeMlbH2hBySeason(rows, 16, 99, 'Brewers')).toBeNull();
    expect(computeMlbH2hBySeason([], 16, 7, 'Brewers')).toBeNull();
  });
});

import { auditCountClaims } from '../../../src/services/agentic/orchestrator/statAudit.js';

describe('statAudit: count-claim verifier ("N of last M games" must be true to the scores)', () => {
  // Rockies last 5 (chronological): 2, 10, 6, 3, 8 -> three games with 6+
  const scores = { homeTeam: 'Rockies', awayTeam: 'Nationals', homeScores: [4, 2, 10, 6, 3, 8], awayScores: [3, 6, 1, 2, 7, 7] };

  it('flags an overcount with the actual data in the message', () => {
    const bad = auditCountClaims('scoring at least six runs in four of their past five games', scores);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('2, 10, 6, 3, 8');
    expect(bad[0]).toContain('3 of the last 5');
  });

  it('passes a correct count and an understatement, for either team', () => {
    expect(auditCountClaims('six runs in three of their past five games', scores)).toHaveLength(0);
    expect(auditCountClaims('at least 6 runs in two of the last 5 games', scores)).toHaveLength(0); // understatement = lower bound, true
    expect(auditCountClaims('seven runs in two of the last four games', scores)).toHaveLength(0); // true for Nationals
  });

  it('ignores claims it cannot verify (runs allowed, no scores provided)', () => {
    expect(auditCountClaims('allowed six runs in four of the last five games', scores)).toHaveLength(0);
    expect(auditCountClaims('six runs in four of the past five games', {})).toHaveLength(0);
  });
});

describe('pickEngine: count-claim retry flow', () => {
  it('retries a miscounted rationale once, then gives up (null)', async () => {
    const { buildScoutReport } = await import('../../../src/services/agentic/scoutReport/scoutReportBuilder.js');
    buildScoutReport.mockResolvedValueOnce({
      garyText: 'SCOUT: ERA 3.41 vs 4.29.', text: 'x', injuries: {}, venue: 'Yankee Stadium',
      verifiedTaleOfTape: { rows: [] },
      recentScores: { homeTeam: 'Yankees', awayTeam: 'Pirates', homeScores: [2, 10, 6, 3, 8], awayScores: [1, 2, 3, 4, 5] },
    });
    const dirty = { content: '{"final_pick":"Yankees ML -150","rationale":"Gary\'s Take\\n\\nERA 3.41 vs 4.29. Scoring at least six runs in four of their past five games.","confidence_score":0.7}', toolCalls: null, usage: {} };
    sendToOpenAISession.mockReset().mockResolvedValueOnce(dirty).mockResolvedValueOnce(dirty);
    const r = await analyzeGameSol(GAME, 'baseball_mlb', { sportsbookOdds: BOARD });
    expect(r).toBeNull();
    expect(sendToOpenAISession).toHaveBeenCalledTimes(2);
    const retryMsg = sendToOpenAISession.mock.calls[1][1];
    expect(retryMsg).toContain('2, 10, 6, 3, 8');
  });
});

import { findStaleInjuryMentions } from '../../../src/services/agentic/pickEngine.js';

describe('stale-injury telemetry (log-only monitor)', () => {
  const injuries = [
    '[NEW] Aaron Judge (RF) — Ribs (Right): not ready to resume activities. (Jul 18 — 3d ago)',
    '[KNOWN] Evan Sisk (RP) — Elbow (Left): placed on the 15-day IL. (Jul 4 — 18d ago)',
    '[KNOWN] Endy Rodriguez (C) — Lower Body (Left): out of the lineup. (Jul 8 — 13d ago)',
  ].join('\n');

  it('flags only OLD injuries actually mentioned in the rationale', () => {
    const r = findStaleInjuryMentions('With Sisk still sidelined the bullpen thins out late.', injuries);
    expect(r).toEqual(['Evan Sisk (18d old)']);
  });
  it('ignores fresh injuries and unmentioned names', () => {
    expect(findStaleInjuryMentions('Judge remains out, which reshapes the lineup.', injuries)).toEqual([]);
    expect(findStaleInjuryMentions('A clean pitching duel decides this one.', injuries)).toEqual([]);
  });
});
