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
  "agentLoop.js": "c3c4a5a70c3fb4ad", // Sep 24 2026 founder GO (bug fixes): the Pass 1 reminder queues its text, not the message object
  "flashAdvisor.js": "a616505d0f90c707", // Sep 24 2026 founder GO: a repeat stat call points back instead of resending the full result; a failed search says it failed instead of "No results"
  "passBuilders.js": "3a8aeb902dd29537",
  "responseParser.js": "5c6b4dac52c221e4", // Sep 24 2026 founder GO: the ML ODDS CEILING swap is gone; a heavy moneyline is never rewritten onto the run line (mlbHouseLimit.js names the tickets on the desk and fails a moneyline past -200)
  "statAudit.js": "5914b68bb0a05830",
  "orchestratorHelpers.js": "87388c9badc16642", // Sep 24 2026 founder GO (desk cleanup): MLB game logs keep every valued field, bio and team once, no nulls
  "investigationFactors.js": "dcfef838858ebb70",
  "spreadEvaluationFactors.js": "830c8ece5ec102b2",
  "flashInvestigationPrompts.js": "af19286717d598c9", // Sep 24 2026 founder GO (evening): the one asymmetric run-line line ("for heavy favorites (-200+): evaluate whether the run line offers better structure") deleted, so -1.5 and +1.5 read alike. Sep 24 2026 founder GO: the pen line no longer asks for movement/release; the pen checklist asks who pitched recently and how the manager uses each arm after similar work, instead of saying UNKNOWN (June constitution: availability is a daily investigation)
  "constitution/mlbConstitution.js": "66d0d18318b90440", // Sep 25 2026 founder GO: one awareness line, "What a team is playing for is a fact about the calendar; what it changes on the field shows up in the game itself"
  "scoutReport/sports/mlb.js": "bc9d5bdc4e9ce666", // Sep 25 2026 founder GO: each club's hitting with runners in scoring position (one import, one marked call, one desk section). Sep 24 2026 founder GO: a favorite's moneyline past the -200 MLB limit is not on the board (one ADAPTED line; nothing explained to Gary). Sep 24 2026 founder GO (bug fixes): injury ages in ET calendar days; the team-stats tape rows past 100 games; accented starters match their stats; the lineup join reads whole names (the two Sox). Sep 22 2026 founder GOs: a starter's missing stat classes are one line, not three; THE GAMES, AS WRITTEN restored (one import, one call). Sep 23 founder GO (bug fixes, not redesign): starter role line; doubles/triples spelled out; xStats read tonight's lineup; in-season team-state search
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
