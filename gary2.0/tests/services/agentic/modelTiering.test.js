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

describe('model tiering: props on their own Gemini tier (game brain = Sol through the full orchestrator)', () => {
  it('primaryModel branches on props mode', () => {
    expect(agentLoopSrc).toContain('isPropsMode ? GEMINI_PROPS_MODEL : GAME_PICK_MODEL');
  });

  it('props default to gemini-3.6-flash, overridable only via the subscription-bridge env seam (Jul 29 2026)', () => {
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/GEMINI_PROPS_MODEL = process\.env\.GARY_PROPS_MODEL_OVERRIDE \|\| 'gemini-3\.6-flash'/);
    expect(configSrc).toMatch(/GAME_PICK_MODEL = process\.env\.GARY_MODEL_OVERRIDE \|\| 'gpt-5\.6-sol'/);
  });

  it('the research briefing runs the cheap dedicated tier per sport', () => {
    const flashSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/flashAdvisor.js'), 'utf8');
    // MLB research = Anthropic Haiku (June engine restoration, no-Gemini law
    // for the MLB pick lane); every other sport stays on Gemini Tier 2.
    expect(flashSrc).toContain("modelName: isMLBSport ? MLB_RESEARCH_MODEL : 'gemini-3-flash-preview'");
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/MLB_RESEARCH_MODEL = process\.env\.GARY_MLB_RESEARCH_MODEL \|\| 'anthropic-claude-haiku-4-5'/);
    // The scout report rides the cached prefix, not the per-factor seeds.
    expect(flashSrc).toContain('## SCOUT REPORT (this game');
  });
});
