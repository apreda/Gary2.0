import { describe, expect, it } from 'vitest';
import {
  decodeBdlRows,
  decodeBdlSdkItem,
  decodeBdlSdkRows,
} from '../../src/services/bdlResponse.js';

describe('BDL collection response contract', () => {
  it('accepts an explicitly decoded 2xx empty board', () => {
    expect(decodeBdlRows({ data: [] }, 'odds')).toEqual([]);
    expect(decodeBdlSdkRows({ data: [] }, 'games')).toEqual([]);
  });

  it('rejects a malformed 2xx payload instead of converting it to []', () => {
    expect(() => decodeBdlRows({ message: 'upstream proxy page' }, 'odds'))
      .toThrow(/invalid response shape/);
    expect(() => decodeBdlSdkRows({ data: { meta: {} } }, 'games'))
      .toThrow(/invalid response shape/);
  });

  it('distinguishes an explicit empty item from a missing or malformed SDK payload', () => {
    expect(decodeBdlSdkItem({ data: null }, 'game')).toBeNull();
    expect(decodeBdlSdkItem({ data: { data: { id: 7 } } }, 'game')).toEqual({ id: 7 });
    expect(() => decodeBdlSdkItem({}, 'game')).toThrow(/invalid response shape/);
    expect(() => decodeBdlSdkItem({ data: [] }, 'game')).toThrow(/invalid response shape/);
  });
});
