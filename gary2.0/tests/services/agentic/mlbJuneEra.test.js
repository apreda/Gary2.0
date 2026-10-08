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
  "orchestratorMain.js": "8ee5bcdbf47cf870", // Oct 7 2026 founder GO: postseason flag to the Pass 1 message; the stored pick names its round
  "agentLoop.js": "e819d4c321c4c203", // Oct 4 2026 founder GO: Gary reads the web on game picks; the postseason flag reaches the decision step
  "flashAdvisor.js": "2f0e3de410e9c99a", // Oct 7 2026 founder GO: situation first with its own searches; postseason skips regular-season factors and the season awareness; no day/night splits; no xERA in the Savant note (Oct 7 2026)
  "passBuilders.js": "140bf10856a7bb2e", // Oct 7 2026 founder GO: postseason Pass 1 without June's regular-season text; decision = format + "Which team do you think wins?" (moneyline); announcer opener back in playoffs; postseason: no price, the moneyline attached at storage; then (Oct 7 2026 founder GO) "Which team do you bet to win, at its posted price, and why?" with the moneyline price, no xERA; Oct 7 night: the Guardians-run checkpoint back (synthesis, decision freedom, four tickets, records line), no postseason injury rule
  "responseParser.js": "fd9807b9232ee990", // Sep 24 2026 founder GO: the ML ODDS CEILING swap is gone; a heavy moneyline is never rewritten onto the run line. Oct 3 2026: no MLB moneyline limit; Oct 7 2026: a postseason pick naming only its team gets the board moneyline; Oct 7 2026: the attached moneyline is a fallback, Gary writes the price again
  "statAudit.js": "5914b68bb0a05830",
  "orchestratorHelpers.js": "87388c9badc16642", // Sep 24 2026 founder GO (desk cleanup): MLB game logs keep every valued field, bio and team once, no nulls
  "investigationFactors.js": "09441676cc40b530", // Oct 7 2026 founder GO: THE_SITUATION_AND_THE_STORY asked first
  "spreadEvaluationFactors.js": "f5b0e38c712597de", // Oct 7 2026 founder: no 'biggest single lever', no Coors 20-30%; no xERA/expected-stats price bullet (Oct 7 2026); Oct 7 night: the postseason awareness for the research assistant (five June lines)
  "flashInvestigationPrompts.js": "2e04476a26f55583", // Oct 7 2026 founder GO: postseason factors without regular-season, luck and market sections; no spring training; no day/night splits; no xERA questions (Oct 7 2026); Oct 7 night: the luck and sustainability sections back in the postseason
  "constitution/mlbConstitution.js": "4020208ce9ecbbba", // Oct 7 2026 founder GO: postseason awareness: record line, moneyline line, no 'Each game is its own event'; Oct 7 2026: the postseason pick is a team's moneyline; Oct 7 night: four tickets and "Each game is its own event" back, no "already account for this absence"; "Each game is its own event" stays out
  "scoutReport/sports/mlb.js": "3d9fd4dece8f9618", // Oct 7 2026 founder GO: postseason press as written, season-to-now table, starters' postseason, no summaries; postseason: no price, the moneyline attached at storage; Oct 7 2026 later: THE PRICE back (postseason: the two moneylines), no xERA; Oct 7 night: the run line back in THE PRICE
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
  it('the research assistant reads June\'s MLB checklist, regrouped into six subjects with the situation first (Oct 5 2026)', () => {
    const p = getFlashInvestigationPrompt('baseball_mlb');
    const headings = [...p.matchAll(/^### (\d+)\. (.+)$/gm)].map((m) => m[2]);
    expect(headings).toEqual(['THE SITUATION AND THE STORY', 'THE STARTING PITCHERS', 'THE LINEUPS AND HITTERS', 'THE BULLPENS', 'THE GAME, THE PARK AND THE PRICE', 'AVAILABILITY']);
    for (const june of ['STARTING PITCHER MATCHUP', 'MOTIVATION & STAKES', 'BULLPEN DEPTH & WORKLOAD', 'INJURIES & ROSTER UPDATES']) expect(p).toContain(`#### ${june}`);
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
