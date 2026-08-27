// Prompt-surface pins that survive the Jul 26 2026 MLB rebuild.
//
// What remains here guards the SHARED system prompt (all sports) and the
// founder-kept MLB scaffolding. (The pickdesk game-lane pins died with the
// pickdesk game brain — deleted Aug 27, one pick system.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '../../../src/services/agentic', rel), 'utf8');

describe('J-series: judgment is licensed, numbers stay policed', () => {
  it('J-1: facts stay policed; the judgment essay is gone (founder, Aug 27 second ruling)', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).toContain('FACT-CHECKING PROTOCOL (ZERO TOLERANCE)');
    // The whole JUDGMENT vs FABRICATION section died with its steering
    // clauses; the fact-vs-judgment rail lives on inside rule 2.
    expect(main).not.toContain('JUDGMENT vs FABRICATION');
    expect(main).not.toContain('the ones the books love');
    expect(main).not.toContain('YOU decide which to trust tonight');
    // Rule 2 (data-profile verification + the judgment-voicing rider) removed
    // whole by the founder, Aug 27 afternoon: "i dont think its needed."
    expect(main).not.toContain('DATA PROFILE');
    expect(main).not.toContain('voiced as judgment');
  });

  it('identity: the 30-years line stands alone; storyteller + contrarian block gone (founder, Aug 27)', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).not.toContain('value bettor, not a market trader');
    expect(main).not.toContain('all of it is CLUES');
    expect(main).not.toContain('mirror, not a source');
    expect(main).not.toContain('quality of the decision, not the bounce of the ball');
    // The storyteller paragraph ("paint the picture... not here to say who is
    // better on paper") is gone — the 30-years sentence is the identity.
    expect(main).not.toContain('paint the picture of how tonight');
    expect(main).not.toContain('who is better on paper');
    expect(main).toContain('a sports bettor with over 30 years of experience');
    // THINK LIKE A SHARP removed Aug 27 (founder): "obvious narratives are
    // priced in / question your first instinct" is contrarian steering that
    // rode along unreviewed since the original Dec 2025 commit.
    expect(main).not.toContain('THINK LIKE A SHARP');
    expect(main).not.toContain('the public overreacts and underreacts');
    // The dog-flavored judgment example left with it — one neutral example
    // list for every sport.
    expect(main).not.toContain('ripe to be caught sleeping');
  });

  it("no team fandom in Gary's identity (Reds-fan injection removed Jul 9)", () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).not.toContain('lifelong Cincinnati Reds fan');
    expect(main).not.toContain('redsInGame');
  });

  // (pickdesk-surface test retired Aug 27 — the pickdesk game brain is
  // deleted; one pick system.)
});

describe('MLB game lane runs the restored June engine (Aug 18 restoration)', () => {
  it('the pass builders route MLB games again', () => {
    const pb = src('orchestrator/passBuilders.js');
    expect(pb).toContain('MLB GAME LANE RESTORED');
    expect(pb).toContain('return buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread)');
    expect(pb).not.toContain('this lane is deleted');
    // The bilateral ask and the symmetry rule ride Pass 1
    expect(pb).toContain('THE SYMMETRY RULE');
    expect(pb).toContain('CASE FOR BACKING ${homeTeam.toUpperCase()} TONIGHT:');
  });

  it('the ask-the-researcher protocol is wired (founder GO, Aug 18)', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain('extractResearcherQuestions(message.content');
    expect(loop).toContain('RESEARCHER_QUESTION_BUDGET');
    expect(loop).toContain('ASK RESEARCHER:');
    const advisor = src('orchestrator/researchBriefing.js');
    expect(advisor).toContain('export function extractResearcherQuestions');
    expect(advisor).toContain('export async function askResearcher');
    expect(advisor).toContain('Do NOT pick a side');
  });

  it('the house limit caps every game moneyline (founder, Aug 18)', () => {
    const pb = src('orchestrator/passBuilders.js');
    expect(pb).toContain('HOUSE LIMIT');
    expect(pb).toContain('export function buildMlCapRetryMessage');
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain('moneylinePastCap');
    expect(loop).toContain('_mlCapRetried');
    const cfg = src('orchestrator/orchestratorConfig.js');
    expect(cfg).toMatch(/GAME_ML_CAP = Number\(process\.env\.GARY_ML_CAP \|\| -179\)/);
  });

  it('the factor file exports the founder-kept MLB scaffolding', () => {
    const f = src('orchestrator/spreadEvaluationFactors.js');
    expect(f).toContain('export function getMlbSpreadFactors');
    expect(f).toContain('export function getMlbSeasonAwareness');
    // The Jul 22 anti-template law is the load-bearing sentence
    expect(f).toContain('reciting, not reading');
  });
});
