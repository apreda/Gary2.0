// Sol game-brain guard tests (Jul 22 2026, final architecture).
//
// Founder's law: the pick PROCESS is the full Gemini-era orchestrator stack,
// unchanged — only the brain is GPT-5.6 Sol (routed via the OpenAI adapter
// seam, same as the July 5.5 bake-off). These tests pin that wiring, the
// GPT-5.6 pricing, the facts-only data layer, the fan-parity derivations,
// and the count-claim/stale-injury rails.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

describe('architecture: full orchestrator process, Sol brain', () => {
  it('the runner calls analyzeGame (the full pass stack) — no side-door engine', () => {
    const runner = src('scripts/run-agentic-picks.js');
    expect(runner).toContain('analyzeGame(game, config.key, runnerOptions)');
    expect(runner).not.toContain('analyzeGameSol');
    expect(runner).not.toContain('pickEngine');
  });
  it('game picks run gpt-5.6-sol; props run gemini-3.6-flash', () => {
    const cfg = src('src/services/agentic/orchestrator/orchestratorConfig.js');
    expect(cfg).toMatch(/GAME_PICK_MODEL = 'gpt-5\.6-sol'/);
    const loop = src('src/services/agentic/orchestrator/agentLoop.js');
    expect(loop).toContain('isPropsMode ? GEMINI_PROPS_MODEL : GAME_PICK_MODEL');
  });
  it('both game-pick audit exits run the merged audit (numeric corpus + count claims)', () => {
    const loop = src('src/services/agentic/orchestrator/agentLoop.js');
    expect(loop).toContain('auditGamePick(earlyPick, messages)');
    expect(loop).toContain('auditGamePick(pick, messages)');
    expect(loop).toContain('auditCountClaims');
  });
});

describe('costTracker: GPT-5.6 family pricing', () => {
  const costSrc = src('src/services/agentic/orchestrator/costTracker.js');
  it('prices Sol at $5/$30 and knows Terra + Luna', () => {
    expect(costSrc).toMatch(/'gpt-5\.6-sol':\s*\{\s*input:\s*5\.00,\s*output:\s*30\.00/);
    expect(costSrc).toContain("'gpt-5.6-terra'");
    expect(costSrc).toContain("'gpt-5.6-luna'");
  });
});

describe('facts-only data layer (founder law, Jul 22): the desk never interprets', () => {
  const mlbScoutSrc = src('src/services/agentic/scoutReport/sports/mlb.js');
  const toolDefsSrc = src('src/services/agentic/tools/toolDefinitions.js');
  it('scout report carries no interpretive legends, computed verdict-deltas, or alarm dressing', () => {
    expect(mlbScoutSrc).not.toContain('leans fly-ball');
    expect(mlbScoutSrc).not.toContain('ERA minus xERA');
    expect(mlbScoutSrc).not.toContain('EXPECTED VS ACTUAL');
    expect(mlbScoutSrc).not.toContain('availability tonight follows');
    expect(mlbScoutSrc).not.toContain('⚠️');
    expect(mlbScoutSrc).not.toContain('small-sample concerns');
    expect(mlbScoutSrc).not.toContain('expected vs actual');
    expect(mlbScoutSrc).not.toContain('minus wOBA');
  });
  it('tool descriptions are plain function statements — no example stories, no process quotas', () => {
    expect(toolDefsSrc).not.toContain('Revenge spot');
    expect(toolDefsSrc).not.toContain('birthday performance');
    expect(toolDefsSrc).not.toContain('narrative momentum');
    expect(toolDefsSrc).not.toContain('2-5 stat categories');
  });
});

import { computeMlbSeasonSeries, computeMlbH2hBySeason, computeMlbScheduleShape, toEtDate } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('season head-to-head (fan-parity data)', () => {
  const idx = new Map([
    [1, { date: '2026-05-05T23:00:00Z', status: 'STATUS_FINAL', homeId: 19, awayId: 22, homeRuns: 7, awayRuns: 2 }],
    [2, { date: '2026-05-06T23:00:00Z', status: 'STATUS_FINAL', homeId: 19, awayId: 22, homeRuns: 1, awayRuns: 4 }],
    [3, { date: '2026-07-20T23:00:00Z', status: 'STATUS_FINAL', homeId: 22, awayId: 19, homeRuns: 3, awayRuns: 9 }],
    [4, { date: '2026-07-22T23:00:00Z', status: 'STATUS_SCHEDULED', homeId: 19, awayId: 22, homeRuns: null, awayRuns: null }],
    [5, { date: '2026-06-01T23:00:00Z', status: 'STATUS_FINAL', homeId: 19, awayId: 14, homeRuns: 2, awayRuns: 1 }],
  ]);
  it('tallies only FINAL meetings, oriented to tonight\'s home team', () => {
    const r = computeMlbSeasonSeries(idx, 19, 22, 'Yankees', 'Pirates');
    expect(r.line).toBe('Yankees lead the season series 2-1 (3 meetings).');
    expect(r.results[0]).toBe('2026-05-05: Yankees 7-2 vs Pirates');
    expect(r.results[2]).toBe('2026-07-20: Yankees 9-3 @ Pirates');
  });
  it('null when the pair never met', () => {
    expect(computeMlbSeasonSeries(idx, 19, 6, 'Yankees', 'White Sox')).toBeNull();
  });
});

describe('historic head-to-head by season (facts only, never "owns")', () => {
  const row = (season, hId, aId, hr, ar, st = 'regular', status = 'STATUS_FINAL') =>
    ({ season, season_type: st, status, home_team: { id: hId }, away_team: { id: aId }, home_team_data: { runs: hr }, away_team_data: { runs: ar } });
  const rows = [
    row(2025, 16, 7, 5, 2), row(2025, 16, 7, 3, 4), row(2025, 7, 16, 1, 6),
    row(2024, 7, 16, 2, 8), row(2024, 7, 16, 0, 3),
    row(2025, 16, 7, 9, 1, 'spring_training'),
    row(2025, 16, 7, 4, 4),
    row(2025, 16, 12, 5, 2),
  ];
  it('tallies per season, regular-season finals only', () => {
    const r = computeMlbH2hBySeason(rows, 16, 7, 'Brewers');
    expect(r.line).toBe('Head-to-head, prior seasons (regular season): 2025: Brewers 2-1 | 2024: Brewers 2-0');
  });
  it('null when the pair never met', () => {
    expect(computeMlbH2hBySeason(rows, 16, 99, 'Brewers')).toBeNull();
  });
});

describe('ET dates for BDL UTC instants (west-coast night games)', () => {
  it('rolls a post-midnight-UTC game back to its ET calendar day', () => {
    expect(toEtDate('2026-07-22T02:10:00.000Z')).toBe('2026-07-21');
    expect(toEtDate('2026-07-21T23:05:00.000Z')).toBe('2026-07-21');
  });
});

describe('schedule shape (pure derivation)', () => {
  const g = (date, homeId, status = 'STATUS_FINAL') => [{ date, status, homeId, awayId: homeId === 5 ? 9 : 5 }];
  it('reports run position, 7-day load, and the night-then-day turnaround', () => {
    const idx = new Map([
      [1, { date: '2026-07-19T23:00:00Z', status: 'STATUS_FINAL', homeId: 5, awayId: 9 }],
      [2, { date: '2026-07-20T23:00:00Z', status: 'STATUS_FINAL', homeId: 5, awayId: 9 }],
      [3, { date: '2026-07-21T23:30:00Z', status: 'STATUS_FINAL', homeId: 5, awayId: 9 }],
      [4, { date: '2026-07-22T17:00:00Z', status: 'STATUS_SCHEDULED', homeId: 5, awayId: 9 }],
    ]);
    const r = computeMlbScheduleShape(idx, 5, '2026-07-22', '2026-07-22T17:00:00Z');
    expect(r.line).toContain('Game 4 of a 4-game homestand');
    expect(r.line).toContain('3 games in the last 7 days');
    expect(r.line).toContain('night game yesterday, day game today');
  });
});

import { auditCountClaims, findStaleInjuryMentions } from '../../../src/services/agentic/orchestrator/statAudit.js';

describe('statAudit: count-claim verifier ("N of last M games" must be true to the scores)', () => {
  const scores = { homeTeam: 'Rockies', awayTeam: 'Nationals', homeScores: [4, 2, 10, 6, 3, 8], awayScores: [3, 6, 1, 2, 7, 7] };
  it('flags an overcount with the actual data in the message', () => {
    const bad = auditCountClaims('scoring at least six runs in four of their past five games', scores);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('2, 10, 6, 3, 8');
    expect(bad[0]).toContain('3 of the last 5');
  });
  it('passes correct counts, understatements, and either-team truths', () => {
    expect(auditCountClaims('six runs in three of their past five games', scores)).toHaveLength(0);
    expect(auditCountClaims('at least 6 runs in two of the last 5 games', scores)).toHaveLength(0);
    expect(auditCountClaims('seven runs in two of the last four games', scores)).toHaveLength(0);
  });
  it('ignores unverifiable shapes', () => {
    expect(auditCountClaims('allowed six runs in four of the last five games', scores)).toHaveLength(0);
    expect(auditCountClaims('six runs in four of the past five games', {})).toHaveLength(0);
  });
});

describe('stale-injury telemetry (log-only monitor)', () => {
  const injuries = [
    '[NEW] Aaron Judge (RF) — Ribs (Right): not ready to resume activities. (Jul 18 — 3d ago)',
    '[KNOWN] Evan Sisk (RP) — Elbow (Left): placed on the 15-day IL. (Jul 4 — 18d ago)',
  ].join('\n');
  it('flags only OLD injuries actually mentioned in the rationale', () => {
    expect(findStaleInjuryMentions('With Sisk still sidelined the bullpen thins out late.', injuries)).toEqual(['Evan Sisk (18d old)']);
    expect(findStaleInjuryMentions('Judge remains out.', injuries)).toEqual([]);
  });
});

describe('prompt dedup audit (founder-approved, Jul 22): removed duplicates stay removed', () => {
  const passSrc = src('src/services/agentic/orchestrator/passBuilders.js');
  const mainSrc = src('src/services/agentic/orchestrator/orchestratorMain.js');
  const constSrc = src('src/services/agentic/constitution/index.js');
  const loopSrc = src('src/services/agentic/orchestrator/agentLoop.js');
  it('stale pointers are gone (RAW ODDS VALUES / 2025-2026 label / duplicate roster+margin lines)', () => {
    expect(passSrc).not.toContain('RAW ODDS VALUES');
    expect(passSrc).not.toContain('2025-2026 season');
    expect(passSrc).not.toContain('PLAYER NAME RULES');
    expect(mainSrc).not.toContain('TRAINING DATA IS OUTDATED');
    expect(constSrc).not.toContain('If a player is NOT listed in the scout report roster section');
  });
  it('the briefing wrapper no longer duplicates the bilateral ask or the completion marker', () => {
    const wrapper = loopSrc.slice(loopSrc.indexOf('const briefingBlock'), loopSrc.indexOf('const briefingBlock') + 900);
    expect(wrapper).not.toContain('caseReminder');
    expect(wrapper).not.toContain('INVESTIGATION COMPLETE');
  });
  it('bilateral case prompts are price-free (Pass 1 design — price enters at 2.5)', () => {
    expect(src('src/services/agentic/constitution/mlbConstitution.js')).not.toContain("why its price is one you'd take");
    expect(src('src/services/agentic/constitution/nhlConstitution.js')).not.toContain("why its price is one you'd take");
  });
});
