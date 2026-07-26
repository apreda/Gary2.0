import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../../src/services/agentic/orchestrator/orchestratorMain.js';

// pickdesk brain runs the founder-curated survivors WITHOUT a constitution
// block (spec 2026-07-26). Props/other sports still pass constitutions.
describe('buildSystemPrompt without a constitution', () => {
  it('omits the constitution block entirely when passed an empty string', () => {
    const p = buildSystemPrompt('', 'MLB');
    expect(p).not.toContain('<constitution>');
    expect(p).toContain('FACT-CHECKING PROTOCOL');
    expect(p).toContain('JUDGMENT vs FABRICATION');
    expect(p).toContain('THINK LIKE A SHARP');
  });

  it('still renders the constitution block when one is provided', () => {
    const p = buildSystemPrompt('SOME RULES', 'MLB');
    expect(p).toContain('<constitution>');
    expect(p).toContain('SOME RULES');
  });
});
