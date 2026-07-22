// F-3 / F-5 / F-8 / F-9 regression tests — July 5 2026 audit, structural batch.
//
//   F-3  props are no longer forced volume: Gary may pass (no_play) and picks are "up to 2"
//   F-5  unverified odds are dropped, and internal _flags never reach the stored pick JSON
//   F-8b fact-checks key results by pick_text+matchup and re-sync when a grade flips
//   F-9  props run on the same brain as game picks (no cheap-model discount)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildPass3Props, getFinalizePropsToolForSport } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { isExplicitPropsPass, stripInternalFields } from '../../../src/services/agentic/propsSharedUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

describe('F-3 (amended Jul 7): 2 props is the standard, no_play is structural-only', () => {
  // Founder resolved the quota-vs-pass contradiction toward the requirement:
  // "we still need 2 per game, that shouldn't be difficult." no_play survives
  // as plumbing for empty boards (no lines / no stats), never as a nightly
  // judgment escape hatch.
  it('Pass 3 asks for 2 picks and keeps no_play as a structural fallback', () => {
    const p = buildPass3Props('Braves', 'Mets', {});
    expect(p).toContain('Select 2 props from DIFFERENT players');
    expect(p).not.toContain('passing is the sharp play');
    expect(p).toContain('no_play');
  });

  it('finalize_props schema carries no_play + pass_reason', () => {
    const tool = getFinalizePropsToolForSport('baseball_mlb');
    const props = tool.function.parameters.properties;
    expect(props.no_play).toBeDefined();
    expect(props.pass_reason).toBeDefined();
  });

  it('isExplicitPropsPass detects a real pass and nothing else', () => {
    expect(isExplicitPropsPass({ picks: [], no_play: true })).toBe(true);
    expect(isExplicitPropsPass({ no_play: true })).toBe(true);
    expect(isExplicitPropsPass({ picks: [] })).toBe(false);
    expect(isExplicitPropsPass({ picks: [{ player: 'X' }], no_play: true })).toBe(false);
    expect(isExplicitPropsPass(undefined)).toBe(false);
  });

  it('agentLoop accepts an explicit pass instead of error-retrying', () => {
    expect(src('src/services/agentic/orchestrator/agentLoop.js')).toContain('isExplicitPropsPass');
  });
});

describe('F-5: odds gate + no internal flags in stored picks', () => {
  it('stripInternalFields removes underscore-prefixed keys only', () => {
    const out = stripInternalFields({ player: 'X', odds: '-110', _oddsUnverified: true, _statAuditWarnings: ['w'] });
    expect(out).toEqual({ player: 'X', odds: '-110' });
  });

  it('props CLI hard-drops unverified odds and strips flags before store', () => {
    const cli = src('scripts/run-agentic-props-cli.js');
    expect(cli).toContain('stripInternalFields');
    expect(cli).not.toContain('flagged _oddsUnverified for review');
    expect(cli).toMatch(/Odds gate: dropped .*no BDL line matched/);
  });
});

describe('no-stats gate: lines without stats never reach Gary', () => {
  it('MLB props context drops candidates that have neither season stats nor game logs', () => {
    expect(src('src/services/agentic/mlbPropsAgenticContext.js')).toContain('No-stats gate');
  });
});

describe('F-8b: fact-check joins and re-syncs correctly', () => {
  it('graded results are keyed by pick_text + matchup, not pick_text alone', () => {
    expect(src('scripts/run-fact-checks.js')).toContain('|${r.matchup}');
  });

  it('a stale fact-check row is regenerated when the graded result flipped', () => {
    expect(src('scripts/run-fact-checks.js')).toContain('result drift');
  });

  it('fact-check idempotency includes pick_text (multi-pick rows must not overwrite each other)', () => {
    expect(src('scripts/run-fact-checks.js')).toContain(".eq('pick_text', pick.pick)");
  });
});

describe('F-9 REVERSED (Jul 8 cost audit): props run on Tier 2', () => {
  // F-9 (Jul 5) put props on the 3.5 brain estimating ~$0.04/game; measured
  // reality was ~$0.35-0.45/game (≈ half the monthly bill) with NO quality
  // gain (36.6% on Tier 1 vs 43.1% on Tier 2 under the same debiased
  // prompts). Founder reverted Jul 8; modelTiering.test.js carries the
  // canonical pin — this one just documents that props stay on their own
  // cheap tier (GEMINI_PROPS_MODEL since Jul 22 2026), never the big brain.
  it('props mode selects the props-tier model, not the big brain', () => {
    const loop = src('src/services/agentic/orchestrator/agentLoop.js');
    expect(loop).toContain('isPropsMode ? GEMINI_PROPS_MODEL : GAME_PICK_MODEL');
  });
});
