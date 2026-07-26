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

  it('sport physics: MLB streaks license survives in its pickdesk home (founder-kept, Jul 22 curation)', () => {
    const brain = pickdesk('garyBrain.js');
    expect(brain).toContain('Streaks are real currency');
    expect(brain).toContain('Baseball runs on heavy game-to-game variance');
  });
});

describe('MLB game lane is dead (Jul 26 rebuild)', () => {
  it('the pass builders refuse MLB games', () => {
    const pb = src('orchestrator/passBuilders.js');
    expect(pb).toContain('MLB game picks moved to pickdesk');
    expect(pb).not.toContain('buildMlbPass1(');
  });

  it('the factor file no longer exports MLB scaffolding', () => {
    const f = src('orchestrator/spreadEvaluationFactors.js');
    expect(f).not.toContain('export function getMlbSpreadFactors');
    expect(f).not.toContain('export function getMlbSeasonAwareness');
  });
});
