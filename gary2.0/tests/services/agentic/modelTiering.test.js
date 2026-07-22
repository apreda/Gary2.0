// Model tiering regression guard (Jul 8 2026 cost audit).
//
// The documented design: game picks = Tier 1 brain (GEMINI_PRO_MODEL), props =
// Tier 2 (GEMINI_FLASH_MODEL, "cheaper, sufficient"). F-9 (Jul 5) silently put
// props on Tier 1 estimating ~$0.04/game; measured reality was ~$0.35-0.45/game
// (≈ half the monthly bill) with no quality gain (36.6% on Tier 1 vs 43.1% on
// Tier 2 with the same debiased prompts). This pin makes the tier split
// explicit so it can never drift silently again — changing it must break a test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentLoopSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/agentLoop.js'), 'utf8');

describe('model tiering: props on their own Gemini tier (games are Sol via pickEngine)', () => {
  it('primaryModel branches on props mode', () => {
    expect(agentLoopSrc).toContain('isPropsMode ? GEMINI_PROPS_MODEL : GEMINI_PRO_MODEL');
  });

  it('props run gemini-3.6-flash (founder call, Jul 22 2026 — verified live on our key)', () => {
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/GEMINI_PROPS_MODEL = 'gemini-3\.6-flash'/);
  });

  it('the research briefing stays on the Tier 2 model', () => {
    const flashSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/flashAdvisor.js'), 'utf8');
    expect(flashSrc).toContain("modelName: 'gemini-3-flash-preview'");
    // The scout report rides the cached prefix, not the per-factor seeds.
    expect(flashSrc).toContain('## SCOUT REPORT (this game');
  });
});
