import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../../src/services/agentic/orchestrator/orchestratorMain.js';

// MLB passes an empty constitution block (spec 2026-07-26 survivors live in
// pass context, not here). Props/other sports still pass constitutions.
describe('buildSystemPrompt without a constitution', () => {
  it('omits the constitution block entirely when passed an empty string', () => {
    const p = buildSystemPrompt('', 'MLB');
    expect(p).not.toContain('<constitution>');
    expect(p).toContain('FACT-CHECKING PROTOCOL');
    expect(p).not.toContain('JUDGMENT vs FABRICATION');
    // THINK LIKE A SHARP removed (founder, Aug 27): contrarian steering —
    // "obvious narratives are priced in, question your first instinct" —
    // that survived from the original Dec 2025 commit without review.
    expect(p).not.toContain('THINK LIKE A SHARP');
  });

  it('still renders the constitution block when one is provided', () => {
    const p = buildSystemPrompt('SOME RULES', 'MLB');
    expect(p).toContain('<constitution>');
    expect(p).toContain('SOME RULES');
  });
});
