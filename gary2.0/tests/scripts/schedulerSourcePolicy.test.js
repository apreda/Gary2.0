import { describe, expect, it } from 'vitest';
import { createScheduleLookup } from '../../scripts/lib/schedulerGames.js';
import {
  SchedulerSourceSchemaError,
  requireNonFootballStart,
} from '../../scripts/lib/schedulerSourcePolicy.js';


describe('scheduler non-football source health', () => {
  it('parses an authoritative provider instant', () => {
    expect(requireNonFootballStart(
      { id: 101 },
      'baseball_mlb',
      '2099-10-03T23:05:00.000Z',
    ).toISOString()).toBe('2099-10-03T23:05:00.000Z');
  });

  it.each([null, '', '2099-10-03', 'not-a-clock'])(
    'fails the sport snapshot for a malformed required start value %j',
    (value) => {
      expect(() => requireNonFootballStart({ id: 102 }, 'baseball_mlb', value))
        .toThrow(SchedulerSourceSchemaError);
    },
  );

  it.each([null, '', '2099-10-03', 'not-a-clock'])('retries the whole sport snapshot when one required clock is malformed: %j', async (date) => {
    const lookup = createScheduleLookup({ loadProvider: async () => ({ ballDontLieService: {
      getGames: async () => [{ id: 101, date: '2099-10-03T23:05:00Z' }, { id: 102, date }],
    } }) });
    expect(await lookup('baseball_mlb', '2099-10-03')).toBeNull();
  });
});
