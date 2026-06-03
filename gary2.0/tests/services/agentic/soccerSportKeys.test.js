import { describe, it, expect } from 'vitest';
import { normalizeSport } from '../../../src/services/agentic/scoutReport/shared/utilities.js';
import { normalizeSportToLeague } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

describe('soccer sport-key normalization', () => {
  it('normalizeSport maps soccer key + short to WC', () => {
    expect(normalizeSport('soccer_world_cup')).toBe('WC');
    expect(normalizeSport('WC')).toBe('WC');
  });
  it('normalizeSportToLeague maps soccer key + short to WC', () => {
    expect(normalizeSportToLeague('soccer_world_cup')).toBe('WC');
    expect(normalizeSportToLeague('WC')).toBe('WC');
  });
});
