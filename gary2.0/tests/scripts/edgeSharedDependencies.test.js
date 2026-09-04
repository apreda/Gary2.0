import { describe, expect, it } from 'vitest';
import { edgeSharedDependencies } from '../../scripts/lib/edgeSharedDependencies.js';

const files = {
  '/f/social/index.ts': 'import { pair } from "../_shared/verbatim.js"; import "./local.ts";',
  '/f/social/local.ts': 'export { x } from "../_shared/nested.js";',
  '/f/_shared/verbatim.js': 'export const pair = 1;',
  '/f/_shared/nested.js': 'import "./cycle.js";',
  '/f/_shared/cycle.js': 'import "./nested.js";',
  '/f/scores/index.ts': 'import { live } from "../_shared/scores.js";',
  '/f/_shared/scores.js': 'export const live = 1;',
};
const io = { existsSync: (path) => Object.hasOwn(files, path), readFileSync: (path) => {
  if (!Object.hasOwn(files, path)) throw new Error('unreadable'); return files[path];
} };

describe('edge shared dependency parity', () => {
  it('tracks only actual direct and transitive imports, including cycles', () => {
    expect(edgeSharedDependencies('/f', 'social', io)).toEqual(['_shared/cycle.js', '_shared/nested.js', '_shared/verbatim.js']);
    expect(edgeSharedDependencies('/f', 'scores', io)).toEqual(['_shared/scores.js']);
  });
  it('fails when dependency evidence cannot be read', () => {
    expect(() => edgeSharedDependencies('/f', 'missing', io)).toThrow('unreadable');
    expect(() => edgeSharedDependencies('/f', 'social', { ...io, existsSync: () => false })).toThrow('Missing local edge dependency');
  });
});
