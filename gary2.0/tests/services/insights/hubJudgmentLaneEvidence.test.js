import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/insights/solText.js', () => ({ generateSolText: model }));
import { attachLaneReads, detailFact } from '../../../src/services/insights/laneReads.js';
afterEach(() => vi.useRealTimers());
beforeEach(() => model.mockReset());

describe('collector evidence survives the optional prose layer', () => {
  it('captures the observation before model latency and never re-dates an older cached source', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-08T16:00:00Z'));
    const fresh = { headline: 'Fresh observation', detail: 'A measured observation.', relevance_score: 80, value: '1' };
    const cached = { ...fresh, id: 'cached', created_at: '2026-09-08T12:00:00Z' };
    model.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2026-09-08T16:05:00Z'));
      return JSON.stringify({ reads: [{ i: 0, read: 'A longer model explanation that arrives after the measured source was already collected and recorded.' }] });
    });
    await attachLaneReads('fixture', [fresh, cached], detailFact);
    expect(fresh.meta.computed_as_of).toBe('2026-09-08T16:00:00.000Z');
    expect(cached.meta.computed_as_of).toBe('2026-09-08T12:00:00Z');
    expect(fresh.detail).toContain('longer model explanation');
  });
  it('preserves every original source sentence before a failed or capped model pass', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ headline: `Measured source ${i}`, detail: `Observed measurement ${i}.`,
      relevance_score: 100 - i, value: String(i), meta: { measured: i } }));
    model.mockRejectedValueOnce(new Error('content service failed'));
    await attachLaneReads('fixture', rows, detailFact, { limit: 1 });
    expect(rows.map(row => row.meta.computed_detail)).toEqual(rows.map(row => row.detail));
    expect(rows[9].meta.computed_detail_kind).toBe('collector_context');
    expect(model).toHaveBeenCalledTimes(1);
  });
  it('does not launder an existing model read into a newly labeled collector observation', async () => {
    const row = { headline: 'Original label', detail: 'Existing model prose', value: '1', relevance_score: 10,
      meta: { read: 'Existing model prose' } };
    model.mockResolvedValueOnce('{"reads":[]}');
    await attachLaneReads('fixture', [row], detailFact);
    expect(row.meta.computed_detail).toBeUndefined();
  });
});
