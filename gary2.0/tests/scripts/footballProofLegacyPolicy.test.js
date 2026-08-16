import { describe, expect, it } from 'vitest';
import {
  assertAfterGaryPickCoverage,
  footballProofLegacyPolicy,
  partitionFootballProofPicks,
} from '../../scripts/lib/footballProofLegacyPolicy.js';

function pick(overrides = {}) {
  return {
    pick_id: 'agentic-americanfootball_nfl-2000000',
    game_id: '2000000',
    published_at: '2026-08-16T17:00:00.000Z',
    ...overrides,
  };
}

describe('football proof legacy policy', () => {
  it('excludes only the two explicit pre-contract picks from AFTER GARY', () => {
    const legacyIds = footballProofLegacyPolicy.legacyAfterGaryPickIds;
    const raw = [
      pick(),
      pick({ pick_id: legacyIds[0], game_id: '1393562', published_at: null }),
      pick({ pick_id: legacyIds[1], game_id: '1393563', published_at: null }),
    ];

    const result = partitionFootballProofPicks(raw);
    expect(result.proofRecords).toHaveLength(3);
    expect([...result.afterGaryGameIds]).toEqual(['2000000']);
    expect([...result.afterGaryPickIds]).toEqual(['agentic-americanfootball_nfl-2000000']);
    expect(result.legacyAfterGarySkipped).toEqual(legacyIds);
  });

  it('keeps the immutable timestamp contract strict for every other pick', () => {
    expect(() => partitionFootballProofPicks([
      pick({ pick_id: 'agentic-americanfootball_nfl-2000001', published_at: null }),
    ])).toThrow('requires an immutable pick.published_at timestamp');
  });

  it('requires exact identity and exact published-record coverage', () => {
    expect(() => partitionFootballProofPicks([pick({ pick_id: '' })]))
      .toThrow('lacks exact proof identity');

    const expected = new Set(['pick-1']);
    expect(() => assertAfterGaryPickCoverage(expected, [{ pick: { pick_id: 'pick-1' } }]))
      .not.toThrow();
    expect(() => assertAfterGaryPickCoverage(expected, []))
      .toThrow('1 missing');
    expect(() => assertAfterGaryPickCoverage(expected, [
      { pick: { pick_id: 'pick-1' } },
      { pick: { pick_id: 'pick-1' } },
    ])).toThrow('proof identity mismatch');
  });
});
