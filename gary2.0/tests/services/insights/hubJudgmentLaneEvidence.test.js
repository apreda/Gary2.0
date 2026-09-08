import { describe, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/insights/solText.js', () => ({ generateSolText: model }));
import { attachLaneReads, detailFact } from '../../../src/services/insights/laneReads.js';

describe('collector evidence survives the optional prose layer', () => {
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
