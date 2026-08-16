import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SchedulerSourceSchemaError,
  requireNonFootballStart,
} from '../../scripts/lib/schedulerSourcePolicy.js';

const schedulerSource = readFileSync(new URL('../../scripts/scheduler.js', import.meta.url), 'utf8');

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

  it('queues malformed decoded non-football rows through the isolated sport retry path', () => {
    expect(schedulerSource).toContain('const start = requireNonFootballStart(g, sportKey, startIso);');
    expect(schedulerSource).toContain('malformed schedule snapshot — isolated sport retry queued');
    expect(schedulerSource).toContain('return null;');
    expect(schedulerSource).not.toContain('missing start time field — skipping');
    expect(schedulerSource).not.toContain('unparseable start time "${startIso}" — skipping');
  });
});
