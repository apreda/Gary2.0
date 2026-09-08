import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { countRealStats } from '../../src/services/agentic/statsSubstance.js';
import { MLB_DECISION_POLICY } from '../../src/services/agentic/orchestrator/mlbCaseMenu.js';
import { shouldRetryPickWithModel } from '../../src/services/marketTruth.js';
import { originalGameEvidence } from '../../src/services/pickdesk/originalGameEvidence.js';

const runner = readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');

describe('MLB decision-policy provenance', () => {
  const game = { id: 1, home_team: 'Braves', away_team: 'Rockies', commence_time: '2026-09-08T23:00:00Z' };
  const loadLane = (analyzeGame, extra = {}) => {
    // Execute the actual lane function with local doubles. Importing the
    // runner itself would start provider initialization and live generation.
    const start = runner.indexOf('async function runMlbJuneEngine(');
    const end = runner.indexOf('\n}\n', start) + 2;
    return vm.runInNewContext(`(${runner.slice(start, end)})`, {
      shouldStore: false, useTestTable: false, args: [], isProductionWinnersRun: ({shouldStore}) => shouldStore,
      winnersAdmin: {}, readMlbExpectationMemory: vi.fn().mockResolvedValue({rows:[],text:''}),
      createMlbJudgmentJournal: vi.fn(() => ({fail: vi.fn().mockResolvedValue(null)})),
      analyzeGame, shouldRetryPickWithModel, MLB_JUNE_BRAIN_MODEL: 'test-brain', DESK_FALLBACK_MODELS: [],
      MLB_DECISION_POLICY, extractJuneBilateralPaths: () => ({ path_home: 'home case', path_away: 'away case' }),
      mlbCaseHeadings: () => ({ lastSide: 'away' }), junePromptSha: async () => 'test-era',
      console: { warn: vi.fn(), error: vi.fn() }, ...extra,
    });
  };

  it('stamps a newly completed MLB decision with the policy loaded alongside its prompts', async () => {
    const decision = await loadLane(vi.fn().mockResolvedValue({ pick: 'Braves ML -150' }))(game, {});
    expect(decision).toMatchObject({ decision_policy: 'mlb-judgment-v1', _promptSha: 'test-era' });
    expect(runner).toContain("judgment_run_id: result.judgment_run_id, price_endorsement: result.price_endorsement");
    const pick = { pick: decision.pick, decision_policy: decision.decision_policy, homeTeam: 'Braves', awayTeam: 'Rockies' };
    expect(originalGameEvidence({ result: decision, pick, deskText: 'original desk' }).pickSnapshot.decision_policy).toBe(MLB_DECISION_POLICY);
  });

  it('requires all durable stages in production and gives each whole-brain retry its own journal', async () => {
    const analyze = vi.fn().mockResolvedValue({pick:'Braves ML -150'});
    const create = vi.fn(() => ({fail:vi.fn().mockResolvedValue(null)}));
    const result = await loadLane(analyze, {shouldStore:true,createMlbJudgmentJournal:create})(game,{});
    expect(result.error).toContain('durable judgment stages');
    expect(create).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[0][2].mlbJudgmentJournal).not.toBe(analyze.mock.calls[1][2].mlbJudgmentJournal);
  });

  it('retains the completed v2 policy and memory at the production seam', async () => {
    const analyze = vi.fn().mockResolvedValue({pick:'Braves ML -150',decision_policy:'mlb-judgment-v2',_mlbJudgment:{receipts:{price_assessment:{ok:true}}}});
    const result = await loadLane(analyze,{shouldStore:true})(game,{});
    expect(result.decision_policy).toBe('mlb-judgment-v2');
    expect(result._mlbJudgmentJournal).toBeTruthy();
    expect(analyze.mock.calls[0][2].mlbExpectationMemory.rows).toEqual([]);
  });

  it('does not assign a policy to a failed analysis or an old recovered publication', async () => {
    const failure = await loadLane(vi.fn().mockResolvedValue({ error: 'unavailable' }))(game, {});
    expect(failure.decision_policy).toBeUndefined();
    const oldPick = { pick: 'Braves ML -150', homeTeam: 'Braves', awayTeam: 'Rockies' };
    const evidence = originalGameEvidence({ result: { decision_policy: MLB_DECISION_POLICY }, pick: oldPick, deskText: 'original desk' });
    expect(evidence.pickSnapshot.decision_policy).toBeUndefined();
  });

  it('does not start a cancelled MLB lane or retry a cancelled analysis on another brain', async () => {
    const controller = new AbortController();
    const analyze = vi.fn(async () => { controller.abort(new Error('game decision cancelled')); throw controller.signal.reason; });
    const lane = loadLane(analyze, { DESK_FALLBACK_MODELS: ['fallback-brain'] });
    await expect(lane(game, { signal: controller.signal })).rejects.toThrow('game decision cancelled');
    expect(analyze).toHaveBeenCalledTimes(1);
    analyze.mockClear();
    await expect(lane(game, { signal: controller.signal })).rejects.toThrow('game decision cancelled');
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each(['journal', 'final'])('checks cancellation after the %s era read', async stage => {
    const controller = new AbortController();
    let reads = 0;
    const junePromptSha = vi.fn(async () => {
      if (++reads === (stage === 'journal' ? 1 : 2)) controller.abort(new Error('game decision cancelled'));
      return 'test-era';
    });
    const analyze = vi.fn().mockResolvedValue({ pick: 'Braves ML -150', decision_policy: 'mlb-judgment-v2',
      _mlbJudgment: { receipts: { price_assessment: { ok: true } } } });
    await expect(loadLane(analyze, { shouldStore: true, junePromptSha })(game, { signal: controller.signal })).rejects.toThrow('game decision cancelled');
    expect(analyze).toHaveBeenCalledTimes(stage === 'journal' ? 0 : 1);
  });
});

describe('NFL verified Tale of the Tape storage mapping', () => {
  const nflMap = {
    POINTS_GM: 'points_per_game',
    OPP_PTS_GM: 'opp_points_per_game',
    RUSH_YDS_GM: 'rushing_yards_per_game',
    PASS_YDS_GM: 'passing_ypg'
  };

  it('maps every NFL tape token to the backend key consumed by iOS', () => {
    for (const [token, key] of Object.entries(nflMap)) {
      expect(runner).toContain(`'${token}': '${key}'`);
    }
    expect(runner).toContain('{ statProvenance: row.statProvenance }');
  });

  it('counts the mapped NFL rows as substantive with the production key shape', () => {
    const stats = Object.entries(nflMap).map(([token, key], index) => ({
      token,
      home: { team: 'Home', [key]: String(20 + index) },
      away: { team: 'Away', [key]: String(18 + index) }
    }));

    expect(countRealStats(stats, nflMap)).toBe(4);
  });
});

describe('NCAAF verified Tale of the Tape storage mapping', () => {
  const ncaafMap = {
    TOTAL_YPG: 'total_ypg',
    OPP_PASSING_YARDS: 'opp_passing_yards',
    OPP_RUSHING_YARDS: 'opp_rushing_yards',
  };

  it('uses canonical tokens whose lowercase storage keys are decoded by iOS', () => {
    expect(runner).toContain('tokenToIosKey[row.token] || row.token.toLowerCase()');
    for (const [token, key] of Object.entries(ncaafMap)) {
      expect(token.toLowerCase()).toBe(key);
    }
  });

  it('counts all three canonical NCAAF rows as substantive after storage shaping', () => {
    const stats = Object.entries(ncaafMap).map(([token, key], index) => ({
      token,
      home: { team: 'Home College', [key]: String(440 + index) },
      away: { team: 'Away College', [key]: String(420 + index) },
    }));
    expect(countRealStats(stats)).toBe(3);
  });
});

describe('NCAAF game-runner FBS policy wiring', () => {
  it('persists exact provider abbreviations for college pick-card labels', () => {
    expect(runner).toContain('season_type: game?.season_type ?? null');
    // Sep 3 2026: the odds-feed game carries its teams as STRINGS, so the
    // object read never fired for college and cards printed whole school
    // names. attachNcaafGameMetadata now stamps the provider's own short form
    // by exact identity, and the payload falls back to it. Still exact — the
    // resolver matches the BDL team directory, it never invents a short form.
    expect(runner).toContain('homeTeamAbbreviation: game?.home_team?.abbreviation ?? game?.homeAbbreviation ?? null');
    expect(runner).toContain('awayTeamAbbreviation: (game?.away_team ?? game?.visitor_team)?.abbreviation ?? game?.awayAbbreviation ?? null');
  });

  it('uses provider ids and canonical conference shapes instead of exact team-name matching', () => {
    expect(runner).toContain('classifyNcaafFbsGames,');
    expect(runner).toContain("from '../src/services/ncaafGamePolicy.js'");
    expect(runner).toContain('const classified = classifyNcaafFbsGames(');
    expect(runner).toContain('games.filter((game) => !isVerifiedNcaafSlateFallback(game))');
    expect(runner).toContain('NCAAF FBS identity unresolved');
    expect(runner).not.toContain('fbsTeamNames');
  });

  it('carries FBS provenance only from authoritative slate or exact-provider fallbacks', () => {
    expect(runner).toContain("ncaaf_fbs_verification_source: 'daily_slate'");
    expect(runner).toContain('const verifiedSlateFallbacks = games.filter(isVerifiedNcaafSlateFallback)');
    expect(runner).toContain('const ncaafTeams = providerGames.length > 0');
    expect(runner).toContain("['daily_slate', 'provider_exact'].includes(game?.ncaaf_fbs_verification_source)");
  });
});
