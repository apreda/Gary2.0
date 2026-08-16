import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync(
  new URL('../../run-insight-connections.js', import.meta.url),
  'utf8',
);

describe('League Pulse persistence contract', () => {
  it('targets the exact composite conflict key while retaining merge-duplicates', () => {
    expect(runner).toContain("url: `${PULSE_REST_URL}?on_conflict=date,league,tab`");
    expect(runner).toContain("Prefer: 'resolution=merge-duplicates,return=minimal'");
  });
});
