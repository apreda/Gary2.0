import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THE_PROPS_ASK } from '../../../src/services/pickdesk/propsBrain.js';
import { RATIONALE_WRITING_RULE } from '../../../src/services/copy/writingRules.js';

// Gary's own words carry the writing rules as an ask, never a guard: there is
// no fallback for a pick's rationale (Adam, Sep 21 2026: "I hate those dashes").
describe('pick rationale asks carry the writing rules', () => {
  it('the football and NBA decision ask names the punctuation rule', () => {
    const src = readFileSync(new URL('../../../src/services/agentic/orchestrator/passBuilders.js', import.meta.url), 'utf8');
    expect(src).toContain('${RATIONALE_WRITING_RULE}');
    expect(RATIONALE_WRITING_RULE).toContain('No dashes as punctuation');
  });
  it('the props ask names the punctuation rule', () => {
    expect(THE_PROPS_ASK).toContain('No dashes as punctuation');
  });
});
