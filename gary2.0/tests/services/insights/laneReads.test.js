/**
 * Optional Hub research rewrites retain the lane's evidence and sample;
 * recommendations, new numbers and ambiguous response slots keep the source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateSolText = vi.fn();
vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: (...a) => generateSolText(...a),
  contentModel: () => 'test-model',
}));

const { attachLaneReads, detailFact } = await import('../../../src/services/insights/laneReads.js');

const row = (i, over = {}) => ({
  headline: `Row ${i} headline`,
  detail: `Row ${i} computed detail with a number, .312.`,
  game: 'Reds at Cubs',
  value: `.31${i}`,
  relevance_score: 100 - i,
  ...over,
});

const readsFor = (n) => JSON.stringify({
  reads: Array.from({ length: n }, (_, i) => ({
    i, read: 'The measured batting average is .312; the stated matchup is Reds at Cubs.',
  })),
});

beforeEach(() => generateSolText.mockReset());

describe('detailFact', () => {
  it('builds the sheet from the row the computer already wrote', () => {
    expect(detailFact(row(1))).toBe(
      'Row 1 headline (.311). Row 1 computed detail with a number, .312. Matchup: Reds at Cubs.',
    );
  });

  it('skips a row with no computed detail — nothing to be fenced to', () => {
    expect(detailFact({ headline: 'bare' })).toBeNull();
    expect(detailFact(null)).toBeNull();
  });
});

describe('attachLaneReads', () => {
  it('replaces detail with the read and keeps the computed line at meta', async () => {
    generateSolText.mockResolvedValue(readsFor(1));
    const rows = [row(1)];
    await attachLaneReads('testLane', rows, detailFact, { ask: 'what it means' });
    expect(rows[0].detail).toMatch(/^The measured batting average is .312/);
    expect(rows[0].meta.computed_detail).toBe('Row 1 computed detail with a number, .312.');
    expect(rows[0].meta.read).toBe(rows[0].detail);
    expect(rows[0].meta.research_copy_version).toBe('observed-research-v1');
  });

  it('writes reads only for the rows that ship — top 8 by relevance', async () => {
    generateSolText.mockResolvedValue(readsFor(8));
    const rows = Array.from({ length: 20 }, (_, i) => row(i));
    await attachLaneReads('testLane', rows, detailFact, { ask: 'what it means' });
    const prompt = generateSolText.mock.calls[0][0];
    expect(prompt).toContain('Row 0 headline');
    expect(prompt).toContain('Row 7 headline');
    expect(prompt).not.toContain('Row 8 headline');
    // The rows themselves are untouched in order and count.
    expect(rows).toHaveLength(20);
    expect(rows[19].detail).toBe('Row 19 computed detail with a number, .312.');
  });

  it('honours a lane that opts out of the ship cap', async () => {
    generateSolText.mockResolvedValue(readsFor(20));
    const rows = Array.from({ length: 20 }, (_, i) => row(i));
    await attachLaneReads('testLane', rows, detailFact, { ask: 'x', limit: Infinity });
    expect(generateSolText.mock.calls[0][0]).toContain('Row 19 headline');
  });

  it('fences the model to the listed facts and forbids the AI register', async () => {
    generateSolText.mockResolvedValue(readsFor(1));
    await attachLaneReads('testLane', [row(1)], detailFact, { ask: 'what it means' });
    const prompt = generateSolText.mock.calls[0][0];
    expect(prompt).toContain('never as an AI');
    expect(prompt).toContain('facts are ALL you may use');
    expect(prompt).toContain('no emojis');
    expect(prompt).toContain('Never mention data feeds or tools');
    expect(prompt).toContain('missing comparison or uncertain status materially limits');
    expect(prompt).toContain('No betting recommendation, first-person preference');
    expect(prompt).not.toContain('Never restate the item back');
  });

  it('a model failure costs nothing — the computed detail still ships', async () => {
    // Unparseable text takes the same catch as a dead model, without vitest
    // flagging a deliberately-thrown error as an unhandled one.
    generateSolText.mockResolvedValue('the model wandered off and wrote prose');
    const rows = [row(1)];
    await expect(attachLaneReads('testLane', rows, detailFact, { ask: 'x' })).resolves.toBeUndefined();
    expect(rows[0].detail).toBe('Row 1 computed detail with a number, .312.');
    expect(rows[0].meta.research_copy_version).toBeUndefined();
  });

  it('drops a stub read rather than shipping it', async () => {
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [{ i: 0, read: 'too short' }] }));
    const rows = [row(1)];
    await attachLaneReads('testLane', rows, detailFact, { ask: 'x' });
    expect(rows[0].detail).toBe('Row 1 computed detail with a number, .312.');
  });

  it.each([
    'I want the Mariners bats against this bullpen after the reported workload; that is the side I prefer.',
    'The remaining relievers have a 6.20 ERA, which is higher than their recorded season performance.',
    'The pitcher has an xERA of .312; that expected measurement supplies another comparison with the season.',
  ])('keeps the actual source when the model adds advice or unsupported analysis: %s', async read => {
    const rows = [row(1)];
    const original = rows[0].detail;
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [{ i: 0, read }] }));
    await attachLaneReads('testLane', rows, detailFact);
    expect(rows[0].detail).toBe(original);
    expect(rows[0].meta.computed_detail).toBe(original);
    expect(rows[0].meta.read).toBeUndefined();
    expect(rows[0].meta.research_copy_version).toBeUndefined();
  });

  it('does not borrow another row’s number or the response index as evidence', async () => {
    const rows = [row(7), row(8, { detail: 'The second source reports a 6.20 ERA over the measured sample.' })];
    const original = rows[0].detail;
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [{ i: 0,
      read: 'The reported ERA is 6.20 across the measured sample; the recorded matchup is Reds at Cubs.' }] }));
    await attachLaneReads('testLane', rows, detailFact);
    expect(rows[0].detail).toBe(original);
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [{ i: 0,
      read: 'The pitcher allowed 0 earned runs in the measured sample; the recorded matchup is Reds at Cubs.' }] }));
    await attachLaneReads('testLane', rows, detailFact);
    expect(rows[0].detail).toBe(original);
  });

  it('accepts a measured comparison with its sample and a material missingness limit', async () => {
    const rows = [row(1, {
      headline: 'A reliever threw 18 pitches', value: '18 P',
      detail: 'The reliever threw 18 pitches in his last appearance. No availability report is supplied.',
    })];
    const read = 'The reliever threw 18.0 pitches in his last appearance. His availability is not reported.';
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [{ i: 0, read }] }));
    await attachLaneReads('testLane', rows, detailFact);
    expect(rows[0].detail).toBe(read);
  });

  it('rejects duplicate, string, negative and unknown slots while retaining an unambiguous valid row', async () => {
    const rows = [row(1), row(2)], original = rows[0].detail;
    const read = 'The measured batting average is .312; the stated matchup is Reds at Cubs.';
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [
      { i: 0, read }, { i: 0, read }, { i: '1', read }, { i: -1, read }, { i: 12, read }, { i: 1, read },
    ] }));
    await attachLaneReads('testLane', rows, detailFact);
    expect(rows[0].detail).toBe(original);
    expect(rows[1].detail).toBe(read);
  });

  it('no rows, no call', async () => {
    await attachLaneReads('testLane', [], detailFact, { ask: 'x' });
    await attachLaneReads('testLane', [{ headline: 'no detail' }], detailFact, { ask: 'x' });
    expect(generateSolText).not.toHaveBeenCalled();
  });
});
