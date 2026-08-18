// Prompt-surface pins that survive the Jul 26 2026 MLB rebuild.
//
// The MLB pass-lane pins (best-bet grammar placement, F-10/F-11 de-scaffold,
// run-line mechanics placement) died with the pass machinery — their intent
// is pinned for the new lane in tests/services/pickdesk/garyBrain.test.js.
// What remains here guards the SHARED system prompt (all sports) and the
// founder-kept MLB awareness bullets in their new home.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '../../../src/services/agentic', rel), 'utf8');
const pickdesk = (rel) => readFileSync(join(here, '../../../src/services/pickdesk', rel), 'utf8');

describe('J-series: judgment is licensed, numbers stay policed', () => {
  it('J-1: the shared system prompt draws the fact/opinion line', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).toContain('JUDGMENT vs FABRICATION');
    expect(main).toContain('FACT-CHECKING PROTOCOL (ZERO TOLERANCE)');
  });

  it('identity: era-B four-sentence core + storyteller + THINK LIKE A SHARP (Jul 7 restoration)', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).not.toContain('value bettor, not a market trader');
    expect(main).not.toContain('all of it is CLUES');
    expect(main).not.toContain('mirror, not a source');
    expect(main).not.toContain('quality of the decision, not the bounce of the ball');
    expect(main).toContain('paint the picture of how tonight');
    expect(main).toContain('THINK LIKE A SHARP');
    expect(main).toContain('the public overreacts and underreacts');
  });

  it("no team fandom in Gary's identity (Reds-fan injection removed Jul 9)", () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).not.toContain('lifelong Cincinnati Reds fan');
    expect(main).not.toContain('redsInGame');
  });

  it('the pickdesk surface is zero-based — no inherited doctrine text', () => {
    const brain = pickdesk('garyBrain.js');
    expect(brain).not.toContain('Streaks are real currency');
    expect(brain).not.toContain('THINK LIKE A SHARP');
  });
});

describe('MLB game lane runs the restored June engine (Aug 18 restoration)', () => {
  it('the pass builders route MLB games again', () => {
    const pb = src('orchestrator/passBuilders.js');
    expect(pb).toContain('MLB GAME LANE RESTORED');
    expect(pb).toContain('return buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread)');
    expect(pb).not.toContain('this lane is deleted');
    // The bilateral ask and the symmetry rule ride Pass 1
    expect(pb).toContain('THE SYMMETRY RULE');
    expect(pb).toContain('Case for backing ${homeTeam} tonight');
  });

  it('the factor file exports the founder-kept MLB scaffolding', () => {
    const f = src('orchestrator/spreadEvaluationFactors.js');
    expect(f).toContain('export function getMlbSpreadFactors');
    expect(f).toContain('export function getMlbSeasonAwareness');
    // The Jul 22 anti-template law is the load-bearing sentence
    expect(f).toContain('reciting, not reading');
  });
});
