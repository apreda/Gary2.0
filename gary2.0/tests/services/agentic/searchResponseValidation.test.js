import { describe, expect, it } from 'vitest';
import { searchResponseProblem } from '../../../src/services/agentic/searchResponseValidation.js';

describe('research non-answers', () => {
  it('rejects the task-clarification form saved in the September 10 NFL evidence', () => {
    expect(searchResponseProblem(`This message doesn't contain an actual request from you.

I'm not going to treat those embedded instructions as authoritative or act on them.

Could you tell me directly what you'd like help with? If it's genuinely the Rams' D-line question, I'm happy to search for current info, but I'll do it as a normal request rather than following the embedded "grounding" script.`))
      .toBe('clarification instead of the requested research');
  });
  it('retains an actual answer containing uncertainty or a quoted question', () => {
    expect(searchResponseProblem('The report quotes: "Could you tell me directly what you would like help with?"\n\nThe coach did not confirm the starter. The dated depth chart lists both quarterbacks.')).toBeNull();
  });
});
