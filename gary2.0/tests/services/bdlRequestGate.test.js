import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BDL_LOCAL_REQUEST_INTERVAL_MS,
  BDL_LOCAL_REQUESTS_PER_MINUTE,
  reserveBdlSlot,
  waitForBdlRequestSlot,
  bdlLocalRequestsPerMinute,
  bdlLocalRequestIntervalMs,
} from '../../src/services/bdlRequestGate.js';

afterEach(() => vi.unstubAllEnvs());

describe('shared BDL request gate', () => {
  it('reserves three evenly spaced local starts per minute', () => {
    vi.stubEnv('GARY_BDL_LOCAL_REQUESTS_PER_MINUTE', '');
    expect(BDL_LOCAL_REQUESTS_PER_MINUTE).toBe(3);
    expect(BDL_LOCAL_REQUEST_INTERVAL_MS).toBeGreaterThan(20_000);

    const now = 1_000_000;
    const first = reserveBdlSlot({}, now);
    const second = reserveBdlSlot(first.state, now);
    const third = reserveBdlSlot(second.state, now);

    expect(first.slotAt).toBe(now);
    expect(second.slotAt - first.slotAt).toBe(BDL_LOCAL_REQUEST_INTERVAL_MS);
    expect(third.slotAt - second.slotAt).toBe(BDL_LOCAL_REQUEST_INTERVAL_MS);
  });

  it('does not carry a stale or corrupt backlog into a new scheduler day', () => {
    const now = 2_000_000;
    expect(reserveBdlSlot({ nextAt: now - BDL_LOCAL_REQUEST_INTERVAL_MS * 2 }, now).slotAt).toBe(now);
    expect(reserveBdlSlot({ nextAt: now + 10 * 60_000 }, now).slotAt).toBe(now);
    expect(reserveBdlSlot({ nextAt: 'nope' }, now).slotAt).toBe(now);
  });

  it('is bypassed under Vitest so unit suites never sleep', async () => {
    await expect(waitForBdlRequestSlot('unit-test')).resolves.toBe(0);
  });

  it('reads configuration after module import and bounds explicit paid-tier values', () => {
    for (const value of ['', 'bad', '0', '-1', '1.5', 'Infinity']) {
      expect(bdlLocalRequestsPerMinute({ GARY_BDL_LOCAL_REQUESTS_PER_MINUTE: value })).toBe(3);
    }
    vi.stubEnv('GARY_BDL_LOCAL_REQUESTS_PER_MINUTE', '120');
    expect(bdlLocalRequestsPerMinute()).toBe(120);
    expect(bdlLocalRequestIntervalMs()).toBe(600);
    expect(bdlLocalRequestsPerMinute({ GARY_BDL_LOCAL_REQUESTS_PER_MINUTE: '600' })).toBe(120);
    vi.stubEnv('GARY_BDL_LOCAL_REQUESTS_PER_MINUTE', '30');
    expect(bdlLocalRequestIntervalMs()).toBe(2100);
  });

  it('serializes real independent processes using the same configured gate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gary-bdl-gate-test-'));
    try {
      const moduleUrl = new URL('../../src/services/bdlRequestGate.js', import.meta.url).href;
      const source = `import { waitForBdlRequestSlot } from ${JSON.stringify(moduleUrl)};
        await waitForBdlRequestSlot('fixture'); console.log(JSON.stringify({at:Date.now()}));`;
      const env = { PATH: process.env.PATH, NODE_ENV: 'production', GARY_BDL_RATE_GATE_DIR: dir, GARY_BDL_LOCAL_REQUESTS_PER_MINUTE: '120' };
      const outputs = await Promise.all([0, 1, 2].map(() => promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], { env })));
      const times = outputs.map(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)).at).sort((a, b) => a - b);
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(500);
      expect(times[2] - times[1]).toBeGreaterThanOrEqual(500);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 10_000);

  it('honors an older slower next-slot reservation and cancellation leaves it unclaimed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gary-bdl-gate-test-'));
    try {
      const existing = { version: 2, nextAt: Date.now() + 20_000, updatedAt: Date.now() };
      await writeFile(join(dir, 'state.json'), JSON.stringify(existing));
      const moduleUrl = new URL('../../src/services/bdlRequestGate.js', import.meta.url).href;
      const source = `import { waitForBdlRequestSlot } from ${JSON.stringify(moduleUrl)};
        const signal=AbortSignal.timeout(100);
        try { await waitForBdlRequestSlot('fixture', {signal}); console.log('claimed'); }
        catch(error) { console.log(error.name); }`;
      const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], {
        env: { PATH: process.env.PATH, NODE_ENV: 'production', GARY_BDL_RATE_GATE_DIR: dir, GARY_BDL_LOCAL_REQUESTS_PER_MINUTE: '120' },
      });
      expect(stdout).toContain('AbortError');
      expect(stdout).not.toContain('claimed');
      expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'))).toEqual(existing);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 10_000);
});
