import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Aug 19 2026: a second `getMlbPlayersByIds` was added to the
// ballDontLieService object literal. JavaScript keeps the LAST duplicate key,
// so the new array-returning method silently shadowed the original
// map-returning one — and the props board's player-name resolution returned
// "Player 4839085" placeholders for a whole night (no lineup match → every
// props run exited 1). Duplicate keys throw no error anywhere, so this test
// is the tripwire: every method name in the service literal must be unique.
const here = dirname(fileURLToPath(import.meta.url));
const endpointFiles = readdirSync(join(here, '../../src/services/bdl')).filter(name => name.endsWith('.js'));
const SERVICE_LITERALS = [
  ...endpointFiles.map(name => `../../src/services/bdl/${name}`),
  '../../src/services/ballDontLieService.js',
  '../../src/services/propOddsService.js',
];

describe('service object literals', () => {
  for (const rel of SERVICE_LITERALS) {
    it(`${rel.split('/').pop()} defines every method name exactly once`, () => {
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

// Object spreads can shadow a method just as silently as duplicate literal keys.
// Check the combined public implementation, including the retained locked methods.
it('defines each public provider method in exactly one active module', () => {
  const files = ['../../src/services/ballDontLieService.js', ...endpointFiles.map(name => `../../src/services/bdl/${name}`)];
  const names = files.flatMap(file => [...readFileSync(join(here, file), 'utf8')
    .matchAll(/^  (?:async )?([A-Za-z_$][\w$]*)\s*\(/gm)].map(match => match[1]))
    .filter(name => !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'function', 'return'].includes(name));
  expect(names.length).toBeGreaterThan(100);
  expect(names.length).toBe(new Set(names).size);
});
