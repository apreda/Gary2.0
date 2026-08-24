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

  it('props default to the codex bridge — the brain the plists actually set — overridable only via the env seam (Gemini retired Aug 24 2026)', () => {
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/GEMINI_PROPS_MODEL = process\.env\.GARY_PROPS_MODEL_OVERRIDE \|\| 'codex-gpt-5\.6-sol'/);
    expect(configSrc).toMatch(/GAME_PICK_MODEL = process\.env\.GARY_MODEL_OVERRIDE \|\| 'gpt-5\.6-sol'/);
    // The founder's Aug 24 vendor ban, encoded: no Gemini model may be a
    // primary, a fallback, or a default anywhere in the desk config.
    expect(configSrc).not.toMatch(/'gemini-[^']*'/);
  });

  it('the research briefing runs the Haiku tier for every game sport', () => {
    const flashSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/flashAdvisor.js'), 'utf8');
    // One system (founder, Aug 18): the researcher is Haiku for ALL game
    // sports — no Gemini in any pick lane (it survives only as the OpenAI
    // search layer's internal quota fallback).
    expect(flashSrc).toContain('modelName: GAME_RESEARCH_MODEL');
    expect(flashSrc).not.toContain("modelName: 'gemini-3-flash-preview'");
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/GAME_RESEARCH_MODEL = process\.env\.GARY_RESEARCH_MODEL \|\| 'anthropic-claude-haiku-4-5'/);
    // The scout report rides the cached prefix, not the per-factor seeds.
    expect(flashSrc).toContain('## SCOUT REPORT (this game');
  });
});
