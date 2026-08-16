import { describe, expect, it } from 'vitest';
import {
  BDL_LOCAL_REQUEST_INTERVAL_MS,
  BDL_LOCAL_REQUESTS_PER_MINUTE,
  reserveBdlSlot,
  waitForBdlRequestSlot,
} from '../../src/services/bdlRequestGate.js';

describe('shared BDL request gate', () => {
  it('reserves three evenly spaced local starts per minute', () => {
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
});
