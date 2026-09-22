import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mlbJuneEraSha, mlbJuneEraFiles } from '../../../src/services/agentic/mlbJuneEra/eraSha.js';
import { getConstitution } from '../../../src/services/agentic/mlbJuneEra/constitution/index.js';
import { getFlashInvestigationPrompt } from '../../../src/services/agentic/mlbJuneEra/flashInvestigationPrompts.js';
import { junePromptSha } from '../../../src/services/agentic/orchestrator/junePromptSha.js';

// THE JUNE ENGINE (founder, Sep 11 2026): "the only difference between June
// and now for MLB should be the models… the prompts, the system, all that
// should be verbatim back to June." These pins are the June 15 2026 tree
// (commit c27db5f0) with import lines removed — an edit to any prompt, pass,
// checklist, constitution, scout-report builder, parser or audit line in the
// era folder fails here.
// Sep 19 founder-approved ticket-integrity repair: responseParser binds the
// selected spread and price to the written ticket, not the home-team default.
// Sep 16 founder-approved exception: orchestratorMain adds required-data checks
// before analysis/cache writes and preserves non-retryable data failures. Its
// pins also include Sep 16 authorized data plumbing: real box-score joins,
// pitcher-start inputs and cache invalidation. The full Sep 16 audit also repairs
// exact identity, complete evidence delivery and terminal source-failure propagation.
// Sep 16 model-order authorization also adapts the effort/account options and
// their log line in agentLoop; those lines are explicitly marked ADAPTED.
// Sep 16 explicit founder request to fix every audited bullpen issue authorizes
// the bullpen checklist/rules, complete data preload, delivery, evidence retention
// and cache changes. The constitution, pass decisions and model order stay June.
// Sep 19 requested failure/bloat repair: both player-log callers honor the
// tool's existing num_games contract. Every field of each requested game stays.
const here = path.dirname(fileURLToPath(import.meta.url));
const ERA = path.resolve(here, '../../../src/services/agentic/mlbJuneEra');
const JUNE_PINS = {
  "orchestratorMain.js": "bc77a6aeb78c4d6f",
  "agentLoop.js": "966a6501a90259e1",
  "flashAdvisor.js": "7f1269ece53e0e09",
  "passBuilders.js": "3a8aeb902dd29537",
  "responseParser.js": "5ab734d0527f9cfa",
  "statAudit.js": "5914b68bb0a05830",
  "orchestratorHelpers.js": "45399b9082d37447",
  "investigationFactors.js": "dcfef838858ebb70",
  "spreadEvaluationFactors.js": "830c8ece5ec102b2",
  "flashInvestigationPrompts.js": "8d653d5d33fde455",
  "constitution/mlbConstitution.js": "486b51bbb7ede953",
  "scoutReport/sports/mlb.js": "306fc13b3a8891d5", // Sep 22 2026 founder GOs: a starter's missing stat classes are one line, not three; THE GAMES, AS WRITTEN restored (one import, one call)
  "scoutReport/shared/taleOfTape.js": "9d5102cc88b0c900",
  "scoutReport/shared/flashReportAssembler.js": "011767d7dc3b234d",
  "tools/toolDefinitions.js": "5edcac332c4b67f8"
};
// Import lines and any line carrying "// ADAPTED" are the only lines allowed to differ.
// One code line was adapted in agentLoop.js (the brain override from the runner's cascade); June's original of that line is left out of its pin.
const strip = (s) => s.split('\n').filter((l) => !/^\s*(import |\} from |export \{[^}]*\} from |const \{[^}]*\} = await import\()/.test(l) && !/\/\/ ADAPTED/.test(l)).join('\n');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

describe('the MLB lane is the June 15 2026 engine, with the explicitly authorized models and data/bullpen corrections', () => {
  for (const [file, pin] of Object.entries(JUNE_PINS)) {
    it(`${file} matches the frozen text including the approved readiness boundary`, () => {
      expect(sha(strip(readFileSync(path.join(ERA, file), 'utf8')))).toBe(pin);
    });
  }
  it('the adapted files carry only models, import paths and the other sports', () => {
    for (const f of ['orchestratorConfig.js', 'sessionManager.js', 'modelConfig.js', 'constitution/index.js', 'scoutReport/scoutReportBuilder.js', 'scoutReport/shared/grounding.js']) {
      expect(readFileSync(path.join(ERA, f), 'utf8')).toMatch(/ADAPTED \((models only|models \+ import paths|other sports|other sports \+ import paths|import paths)\)/);
    }
  });
  it('Gary reads June\'s constitution, not September\'s desk rules', () => {
    const c = getConstitution('baseball_mlb');
    const text = typeof c === 'string' ? c : c.full;
    expect(text).not.toContain('THE DESK IS THE EVIDENCE');
    expect(text).not.toContain('THE EVIDENCE IS WHAT THIS CONVERSATION HOLDS');
    expect(text).toContain('fetch_stats');
  });
  it('the research assistant reads June\'s MLB checklist in June\'s order', () => {
    const p = getFlashInvestigationPrompt('baseball_mlb');
    const headings = [...p.matchAll(/^### (\d+)\. (.+)$/gm)].map((m) => m[2]);
    expect(headings[0]).toBe('STARTING PITCHER MATCHUP');
    expect(p).not.toContain('Gary weighs them');
    expect(p).not.toContain('(founder, Aug 19)');
  });
  it('the era stamp includes the shared bullpen dependency and the ledger reads it', () => {
    expect(mlbJuneEraSha()).toMatch(/^[0-9a-f]{12}$/);
    expect(junePromptSha()).toBe(mlbJuneEraSha());
    expect(mlbJuneEraFiles()).toContain('scoutReport/sports/mlb.js');
    expect(mlbJuneEraFiles()).toContain('../../bullpen/snapshot.js');
    expect(mlbJuneEraFiles()).toContain('../../bullpen/evidence.js');
  });
  it('the runner sends MLB games to the June engine and nothing else', () => {
    const runner = readFileSync(path.resolve(here, '../../../scripts/run-agentic-picks.js'), 'utf8');
    const adapter = readFileSync(path.resolve(here, '../../../scripts/lib/picks/mlbJuneLane.js'), 'utf8');
    expect(runner).toContain('createMlbJuneLane({ analyzeGameJune, runGameBrainCascade,');
    expect(adapter).toContain("analyzeGameJune(game, 'baseball_mlb'");
    expect(runner).not.toContain("analyzeGame(game, 'baseball_mlb'");
  });
});
