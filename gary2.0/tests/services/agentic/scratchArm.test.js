// Jul 10 2026 — SCRATCH ARM "gary-vnext" on GPT-5.6 Sol (founder-approved).
//
// The thesis (his words): "everything i built was because the model itself was
// bad... if we build it smart then we shouldn't have to hand hold it and it
// should naturally know that -600 isn't a best bet." So this arm is stripped
// to the honest minimum:
//   KEEPS: anti-fabrication (statAudit + dated-news rule), the output
//          contract (same pick shape → test_daily_picks), the data layer
//          (scout report, live tools, FULL market board).
//   DROPS: passes, factor lists, bilateral cases, awareness bullets, injury
//          SEMANTICS (raw facts + dates only — the model derives staleness
//          itself or doesn't; production's locked FRESH/PRICED-IN system is
//          untouched), the -200 ML strip, all run-line rules.
// Old failure modes (favorite-confirmation, research anchoring, blind spots)
// are WATCHED in telemetry, not pre-patched — founder: context, not constraints.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SCRATCH_MODEL_DEFAULT,
  buildScratchSystemPrompt,
  buildScratchUserMessage,
  stripInterpretiveLabels,
  renderFullBoard,
  parseScratchFinal,
} from '../../../src/services/agentic/scratchArm/scratchArm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

describe('the prompt is the founder-approved text, verbatim, and nothing more', () => {
  it('system prompt: identity, date, anti-fabrication, output contract — no coaching', () => {
    const p = buildScratchSystemPrompt('2026-07-10');
    expect(p).toContain('You are Gary, a professional sports bettor.');
    expect(p).toContain('Today is 2026-07-10.');
    expect(p).toContain('You have a bankroll, and one job: make the bet on tonight\'s board that wins money.');
    expect(p).toContain('Never cite a number that isn\'t in the report or a tool result; any news you use must carry a date.');
    expect(p).toContain('"final_pick"');
    expect(p).toContain('"confidence_score"');
    // The scars must NOT be here: no passes, no factor lists, no line-coaching.
    for (const banned of ['Pass 1', 'INVESTIGATION', 'factor', 'undervalued', 'overvalued', 'edge', 'sharp', 'underdog', 'favorite', 'FRESH', 'PRICED IN']) {
      expect(p, `system prompt must not contain "${banned}"`).not.toContain(banned);
    }
  });

  it('user message = scout + board + the one ask', () => {
    const m = buildScratchUserMessage({ awayTeam: 'Braves', homeTeam: 'Pirates', scout: 'SCOUT_TEXT', board: 'BOARD_TEXT' });
    expect(m).toContain('SCOUT_TEXT');
    expect(m).toContain('BOARD_TEXT');
    expect(m).toContain('Braves @ Pirates');
    expect(m).toContain('What\'s your best bet on this board?');
  });

  it('default engine is GPT-5.6 Sol', () => {
    expect(SCRATCH_MODEL_DEFAULT).toBe('gpt-5.6-sol');
  });
});

describe('stripInterpretiveLabels: raw facts survive, interpretations die', () => {
  const mlbScout = [
    'INJURIES (BDL structured):',
    '  Ronald Acuna Jr. (OF) — Knee — FRESH (0-3 days) — flagged 2026-07-09, played last game: no',
    '  Spencer Strider (SP) — Elbow — PRICED IN (>3 days) — flagged 2026-06-20',
    'FRESH = the market may still be settling the news.',
    'PRICED IN = every book set tonight\'s line knowing it.',
  ].join('\n');

  it('keeps names, injuries, and dates; removes the semantic tags and legend', () => {
    const out = stripInterpretiveLabels(mlbScout);
    expect(out).toContain('Ronald Acuna Jr.');
    expect(out).toContain('2026-07-09');
    expect(out).toContain('Spencer Strider');
    expect(out).toContain('2026-06-20');
    expect(out).not.toContain('FRESH');
    expect(out).not.toContain('PRICED IN');
    expect(out).not.toContain('market may still be settling');
  });

  it('removes heavy-favorite strip language so the arm never inherits the old rule', () => {
    const scout = '3-way moneyline: Draw +270 / Morocco +500\n  (France ML not offered — priced heavier than -200, so the bare moneyline isn\'t on the menu for them. This is a structural constraint...)';
    const out = stripInterpretiveLabels(scout);
    expect(out).not.toContain('priced heavier than -200');
    expect(out).not.toContain('not offered');
  });
});

describe('renderFullBoard: the whole menu, ugly prices included', () => {
  it('MLB: renders per-book ml/run line/total rows from sportsbook odds', () => {
    const board = renderFullBoard({}, 'baseball_mlb', {
      homeTeam: 'Pirates', awayTeam: 'Braves',
      sportsbookOdds: [
        { book: 'fanduel', ml_home: 104, ml_away: -122, spread_home: 1.5, spread_away: -1.5, spread_odds: -108, total: '8.5', total_over_odds: -110, total_under_odds: -110 },
      ],
    });
    expect(board).toContain('fanduel');
    expect(board).toContain('-122');
    expect(board).toContain('8.5');
  });
});

describe('parseScratchFinal: tolerant JSON extraction', () => {
  it('parses a fenced json block', () => {
    const out = parseScratchFinal('thinking...\n```json\n{"final_pick":"Braves ML -122","rationale":"Gary\'s Take\\n\\nx","confidence_score":0.63}\n```');
    expect(out.final_pick).toBe('Braves ML -122');
    expect(out.confidence_score).toBe(0.63);
  });

  it('parses bare JSON and rejects garbage', () => {
    expect(parseScratchFinal('{"final_pick":"Under 8.5 -110","rationale":"r","confidence_score":0.5}').final_pick).toBe('Under 8.5 -110');
    expect(parseScratchFinal('no json here')).toBeNull();
    expect(parseScratchFinal('```json\n{"rationale":"missing pick"}\n```')).toBeNull();
  });
});

describe('runner safety: the scratch arm can only ever write to the test table', () => {
  it('run-scratch-arm.js stores via storeTestPicks and never touches production storage', () => {
    const runner = src('scripts/run-scratch-arm.js');
    expect(runner).toContain('storeTestPicks');
    expect(runner).not.toContain('storeDailyPicks');
    expect(runner).not.toMatch(/from\('daily_picks'\)/);
  });

  it('one corrective statAudit retry, then the game is SKIPPED — fabrication never stores', () => {
    const runner = src('scripts/run-scratch-arm.js');
    expect(runner).toContain('auditPickRationale');
    expect(runner).toContain('buildStatAuditRetryMessage');
    expect(runner).toMatch(/skip/i);
  });
});
