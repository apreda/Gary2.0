// Model tiering regression guard (Jul 8 2026 cost audit).
//
// The documented design (Jul-era tier names): game picks = the Tier 1 brain,
// props = the cheaper Tier 2. F-9 (Jul 5) silently put
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

describe('model tiering: props on their own desk tier (game brain = Sol through the full orchestrator)', () => {
  it('primaryModel branches on props mode', () => {
    expect(agentLoopSrc).toContain('isPropsMode ? PROPS_DESK_MODEL : GAME_PICK_MODEL');
  });

  it('props default to the codex bridge — the brain the plists actually set — overridable only via the env seam (Gemini retired Aug 24 2026)', () => {
    const configSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/orchestratorConfig.js'), 'utf8');
    expect(configSrc).toMatch(/PROPS_DESK_MODEL = process\.env\.GARY_PROPS_MODEL_OVERRIDE \|\| 'codex-gpt-5\.6-sol'/);
    expect(configSrc).toMatch(/GAME_PICK_MODEL = process\.env\.GARY_MODEL_OVERRIDE \|\| 'gpt-5\.6-sol'/);
    // The founder's Aug 24 vendor ban, encoded: no Gemini model may be a
    // primary, a fallback, or a default anywhere in the desk config.
    expect(configSrc).not.toMatch(/'gemini-[^']*'/);
  });

  // (The Haiku-researcher tier test died with researchBriefing.js — the
  // researcher was killed Aug 27 2026 and its files were deleted Sep 1.
  // GAME_RESEARCH_MODEL survives in config only as validateSessionModel's
  // reroute target for refused model names.)
});
