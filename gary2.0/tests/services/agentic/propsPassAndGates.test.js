// F-3 / F-5 / F-8 / F-9 regression tests — July 5 2026 audit, structural batch.
//
//   F-3  props are no longer forced volume: Gary may pass — the desk brain's empty list
//   F-5  unverified odds are dropped, and internal _flags never reach the stored pick JSON
//   F-8b fact-checks key results by pick_text+matchup and re-sync when a grade flips
//   F-9  props run on the same brain as game picks (no cheap-model discount)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { isExplicitPropsPass, normalizePropBetDirection, stripInternalFields } from '../../../src/services/agentic/propsSharedUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

describe('ONE props system (Sep 2 2026): the orchestrator props mode is gone', () => {
  // The multi-pass orchestrator props brain — the system behind the
  // pre-Jul-27-2026 props ledger — was deleted on the founder's "the old
  // system is gone". Every props lane is the desk brain; the game lane
  // refuses a props ask instead of quietly running old parts.
  it('the orchestrator refuses props mode at its entry seam', () => {
    const main = src('src/services/agentic/orchestrator/orchestratorMain.js');
    expect(main).toContain("if (options.mode === 'props' || options.propContext) {");
    expect(main).toContain('The orchestrator props mode was retired Sep 2 2026');
  });
  it('agentLoop carries no props branches and passBuilders no props builders', () => {
    const loop = src('src/services/agentic/orchestrator/agentLoop.js');
    expect(loop).not.toMatch(/isPropsMode|finalize_props|buildPass3Props|propContext/);
    const builders = src('src/services/agentic/orchestrator/passBuilders.js');
    expect(builders).not.toMatch(/buildPass1PropsMessage|buildPass25PropsMessage|buildPass3Props|FINALIZE_PROPS_TOOL/);
  });
  it('the props CLI runs desk lanes only — no context builder, no orchestrator fallback', () => {
    const cli = src('scripts/run-agentic-props-cli.js');
    expect(cli).not.toMatch(/buildContext|analyzeGame|getPropsConstitution/);
    expect(cli).toContain("has no props desk lane (MLB, NFL, NCAAF only)");
  });
  it('isExplicitPropsPass detects a real pass and nothing else', () => {
    expect(isExplicitPropsPass({ picks: [], no_play: true })).toBe(true);
    expect(isExplicitPropsPass({ no_play: true })).toBe(true);
    expect(isExplicitPropsPass({ picks: [] })).toBe(false);
    expect(isExplicitPropsPass({ picks: [{ player: 'X' }], no_play: true })).toBe(false);
    expect(isExplicitPropsPass(undefined)).toBe(false);
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

describe('direction gate', () => {
  it('accepts only over, under, and yes without inventing a side', () => {
    expect(normalizePropBetDirection('OVER')).toBe('over');
    expect(normalizePropBetDirection('under')).toBe('under');
    expect(normalizePropBetDirection('yes')).toBe('over');
    expect(normalizePropBetDirection('no')).toBeNull();
    expect(normalizePropBetDirection('higher')).toBeNull();
    expect(normalizePropBetDirection(undefined)).toBeNull();
  });

  it('the CLI drops a null direction before odds reconciliation can ship it', () => {
    const cli = src('scripts/run-agentic-props-cli.js');
    expect(cli).toContain('normalizePropBetDirection(pick.bet ?? pick.direction)');
    expect(cli).toMatch(/Direction gate: dropped/);
  });
});

describe('no-stats gate: unvalidated players never reach a stored pick', () => {
  it('MLB validates only players whose stat fetch returned real rows', () => {
    const brain = src('src/services/pickdesk/propsBrain.js');
    expect(brain).toContain('const validatedPlayers = new Set(chronoByPlayer.keys())');
    expect(brain).toContain('validatedPlayers.has(norm(prop?.player))');
    expect(brain).toContain('validatedPlayers,');
    const cli = src('scripts/run-agentic-props-cli.js');
    expect(cli).toContain('validatedPlayerNames = deskRes.validatedPlayers');
    expect(cli).toMatch(/No-stats gate: dropped/);
  });

  it('the props board reuses the desk scout\'s BDL plus official-MLB resolved lineup', () => {
    const brain = src('src/services/pickdesk/propsBrain.js');
    const mlbScout = src('src/services/agentic/scoutReport/sports/mlb.js');
    expect(brain).toContain('resolvedConfirmedLineupNames(desk.scout)');
    expect(brain).not.toContain('getMlbLineups(gameId)');
    expect(mlbScout).toContain('confirmedLineups: { home: homeData, away: awayData }');
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
  // cheap tier (PROPS_DESK_MODEL since Jul 22 2026), never the big brain.
  it('props run the desk brain on PROPS_DESK_MODEL — the orchestrator never selects a props model', () => {
    const brain = src('src/services/pickdesk/propsBrain.js');
    expect(brain).toContain('const cascade = [...new Set([PROPS_DESK_MODEL, ...DESK_FALLBACK_MODELS, LEGACY_BRAIN_FALLBACK])];');
    expect(src('src/services/agentic/orchestrator/agentLoop.js')).not.toContain('PROPS_DESK_MODEL');
  });
});
