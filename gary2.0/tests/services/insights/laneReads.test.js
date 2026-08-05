/**
 * THE GARY LAYER pins (Aug 5 2026 — the founder's "there's a lot of things in
 * the hub that could use some real rationale" pass). Every hub lane now hands
 * its shipped rows to one batched Gary read; these pin the contract that pass
 * runs under: fenced to the lane's own facts, only what ships gets written,
 * and a failure never costs the page its computed detail.
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
    i, read: `Gary read ${i} — ${'x'.repeat(70)}`,
  })),
});

beforeEach(() => generateSolText.mockReset());

describe('detailFact', () => {
  it('builds the sheet from the row the computer already wrote', () => {
    expect(detailFact(row(1))).toBe(
      'Row 1 headline (.311). Row 1 computed detail with a number, .312. Tonight: Reds at Cubs.',
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
    expect(rows[0].detail).toMatch(/^Gary read 0/);
    expect(rows[0].meta.computed_detail).toBe('Row 1 computed detail with a number, .312.');
    expect(rows[0].meta.read).toBe(rows[0].detail);
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
    expect(prompt).toContain('they are ALL you may use');
    expect(prompt).toContain('no emojis');
    expect(prompt).toContain('never mention data feeds, tools, or missing data');
  });

  it('a model failure costs nothing — the computed detail still ships', async () => {
    // Unparseable text takes the same catch as a dead model, without vitest
    // flagging a deliberately-thrown error as an unhandled one.
    generateSolText.mockResolvedValue('the model wandered off and wrote prose');
    const rows = [row(1)];
    await expect(attachLaneReads('testLane', rows, detailFact, { ask: 'x' })).resolves.toBeUndefined();
    expect(rows[0].detail).toBe('Row 1 computed detail with a number, .312.');
  });

  it('drops a stub read rather than shipping it', async () => {
    generateSolText.mockResolvedValue(JSON.stringify({ reads: [{ i: 0, read: 'too short' }] }));
    const rows = [row(1)];
    await attachLaneReads('testLane', rows, detailFact, { ask: 'x' });
    expect(rows[0].detail).toBe('Row 1 computed detail with a number, .312.');
  });

  it('no rows, no call', async () => {
    await attachLaneReads('testLane', [], detailFact, { ask: 'x' });
    await attachLaneReads('testLane', [{ headline: 'no detail' }], detailFact, { ask: 'x' });
    expect(generateSolText).not.toHaveBeenCalled();
  });
});
