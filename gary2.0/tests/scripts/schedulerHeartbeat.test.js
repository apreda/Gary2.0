import { afterEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSchedulerHeartbeat } from '../../scripts/lib/schedulerHeartbeat.js';
import { schedulerObservations } from '../../scripts/lib/operationalAlerts.js';

const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture(instant, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-heartbeat-'));
  directories.push(directory);
  let now = Date.parse(instant);
  const heartbeatFile = join(directory, 'heartbeat');
  const beat = createSchedulerHeartbeat({ logDirectory: directory, heartbeatFile, pid: 123,
    now: () => now, ...overrides });
  return { directory, heartbeatFile, beat, setTime: value => { now = Date.parse(value); } };
}

describe('scheduler daily log heartbeat', () => {
  it('opens the new Eastern day during quiet time and preserves yesterday\'s failures', () => {
    const f = fixture('2026-09-17T03:59:55Z');
    const previous = join(f.directory, 'scheduler-2026-09-16.log');
    const failure = '[9/16/2026, 11:30:00 PM] ⚠️ MISSED PROPS: MLB A @ B — no outcome (id 1)\n';
    writeFileSync(previous, failure);
    f.beat();
    const yesterday = readFileSync(previous, 'utf8');
    f.setTime('2026-09-17T04:00:25Z');
    f.beat();
    const today = readFileSync(join(f.directory, 'scheduler-2026-09-17.log'), 'utf8');
    expect(today).toContain('[9/17/2026, 12:00:25 AM] Scheduler heartbeat: daily log opened.');
    expect(readFileSync(previous, 'utf8')).toBe(yesterday);
    expect(schedulerObservations(yesterday, '2026-09-16').active.has('2026-09-16:props:1')).toBe(true);
    expect(schedulerObservations(today, '2026-09-17').active.size).toBe(0);
    expect(readFileSync(f.heartbeatFile, 'utf8')).toBe(`${Date.parse('2026-09-17T04:00:25Z')} pid=123\n`);
    f.setTime('2026-09-17T04:00:55Z');
    f.beat();
    expect(readFileSync(join(f.directory, 'scheduler-2026-09-17.log'), 'utf8')).toBe(today);
  });

  it('does not rotate at UTC midnight and handles winter Eastern midnight', () => {
    const f = fixture('2026-09-17T00:00:00Z');
    f.beat();
    expect(readdirSync(f.directory)).toContain('scheduler-2026-09-16.log');
    expect(readdirSync(f.directory)).not.toContain('scheduler-2026-09-17.log');
    f.setTime('2027-01-17T04:59:55Z'); f.beat();
    f.setTime('2027-01-17T05:00:25Z'); f.beat();
    expect(readdirSync(f.directory)).toEqual(expect.arrayContaining(['scheduler-2027-01-16.log', 'scheduler-2027-01-17.log']));
  });

  it('opens the log before publishing a new-day heartbeat and retries failed log writes', () => {
    let failed = true;
    const operations = [];
    const f = fixture('2026-09-17T04:00:25Z', {
      append: (...args) => { operations.push('log'); if (failed) throw Object.assign(new Error('denied'), { code: 'EACCES' }); appendFileSync(...args); },
      write: (...args) => { operations.push('heartbeat'); writeFileSync(...args); },
    });
    expect(() => f.beat()).toThrow('denied');
    expect(operations).toEqual(['log', 'heartbeat']);
    expect(readFileSync(f.heartbeatFile, 'utf8')).toContain('pid=123');
    failed = false;
    f.beat();
    expect(operations).toEqual(['log', 'heartbeat', 'log', 'heartbeat']);
    expect(readFileSync(join(f.directory, 'scheduler-2026-09-17.log'), 'utf8')).toContain('daily log opened');
  });
});
