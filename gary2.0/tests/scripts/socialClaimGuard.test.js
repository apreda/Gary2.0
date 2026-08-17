import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const composerSrc = readFileSync(
  new URL('../../supabase/functions/social-auto-post/index.ts', import.meta.url),
  'utf8',
);

// Aug 15 2026 KC overclaim (founder-authorized fix): the pick desk wrote
// "cleaner RECENT bullpen form"; the composer, which never sees the bullpen
// ledger, broadened it to a blanket "owns the cleaner bullpen for the late
// innings". The guard is a ground-truth contract clause: qualifiers are part
// of the fact and can never be dropped or strengthened.

describe('social composer claim guard', () => {
  it('carries the qualifier-preservation clause inside the ground-truth contract', () => {
    expect(composerSrc).toContain('QUALIFIERS ARE PART OF THE FACT');
    expect(composerSrc).toMatch(/never (?:drop|remove)[^.]*qualifier/i);
    expect(composerSrc).toMatch(/drop the claim/i);
  });
});
