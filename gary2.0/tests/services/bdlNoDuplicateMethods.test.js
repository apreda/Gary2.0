import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Aug 19 2026: a second `getMlbPlayersByIds` was added to the
// ballDontLieService object literal. JavaScript keeps the LAST duplicate key,
// so the new array-returning method silently shadowed the original
// map-returning one — and the props board's player-name resolution returned
// "Player 4839085" placeholders for a whole night (no lineup match → every
// props run exited 1). Duplicate keys throw no error anywhere, so this test
// is the tripwire: every method name in the service literal must be unique.
const SERVICE_LITERALS = [
  '../../src/services/ballDontLieService.js',
  '../../src/services/propOddsService.js',
  '../../src/services/ballDontLie/bdlPlayers.js',
  '../../src/services/ballDontLie/bdlInjuries.js',
];

describe('service object literals', () => {
  for (const rel of SERVICE_LITERALS) {
    it(`${rel.split('/').pop()} defines every method name exactly once`, () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(join(here, rel), 'utf8');
      const names = [...src.matchAll(/^  (?:async )?([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1])
        .filter((n) => !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'function', 'return'].includes(n));
      const seen = new Map();
      const dupes = [];
      for (const n of names) {
        if (seen.has(n)) dupes.push(n);
        seen.set(n, true);
      }
      expect(dupes, `duplicate method names shadow their earlier definition: ${dupes.join(', ')}`).toEqual([]);
    });
  }
});
