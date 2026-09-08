import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessions = vi.hoisted(() => ({
  create: vi.fn(),
  send: vi.fn(),
}));

vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: sessions.create,
  sendToSessionWithRetry: sessions.send,
}));

vi.mock('../../../src/services/insights/solText.js', () => ({
  contentModel: () => 'test-model',
  contentModelCascade: () => ['test-model'],
}));

const { applyGaryVoice } = await import('../../../src/services/insights/garyInsightVoice.js');

beforeEach(() => vi.clearAllMocks());

describe('football Hub copy integrity', () => {
  it.each(['NFL', 'ncaaf'])('keeps %s evidence deterministic and makes no prose-model call', async (league) => {
    const rows = [{
      category: 'trenches',
      headline: 'BUF is +18 rush yards per game',
      detail: 'BUF is at 128.0 rushing yards per game; MIA is at 110.0.',
      game: 'BUF @ MIA',
      value: '18 RUSH YPG',
      tone: 'good',
      relevance_score: 70,
    }];

    const result = await applyGaryVoice(rows, { league });

    expect(result).toBe(rows);
    expect(result[0].detail).toContain('128.0 rushing yards per game');
    expect(result[0].meta).toBeUndefined();
    expect(sessions.create).not.toHaveBeenCalled();
    expect(sessions.send).not.toHaveBeenCalled();
  });
});

describe('MLB Hub research copy integrity', () => {
  const row = () => ({ category: 'heat_check', headline: 'Fixture Hitter: .312 AVG',
    detail: 'Fixture Hitter is 10-for-32 over the last 8 games, with a .312 AVG.',
    game: 'FIX @ OPP', value: '.312', meta: {} });

  it('never sends deterministic bullpen evidence through the generic model', async () => {
    const rows = [{ ...row(), category: 'bullpen_fatigue', detail: 'Fixture Arm threw 40 pitches across two games; the team had no game yesterday.' }];
    const before = structuredClone(rows);
    expect(await applyGaryVoice(rows, { league: 'MLB' })).toEqual(before);
    expect(sessions.create).not.toHaveBeenCalled();
    expect(sessions.send).not.toHaveBeenCalled();
  });

  it('uses the shared research rules and accepts only the same supplied sample', async () => {
    sessions.create.mockResolvedValue({});
    sessions.send.mockResolvedValue({ content: '{"reads":[{"i":0,"take":"Over the last 8 games, Fixture Hitter has a .312 AVG on 10-for-32 hitting."}]}' });
    const [result] = await applyGaryVoice([row()], { league: 'MLB' });
    expect(result.detail).toBe('Over the last 8 games, Fixture Hitter has a .312 AVG on 10-for-32 hitting.');
    expect(result.meta.evidence).toBe(row().detail);
    expect(sessions.create.mock.calls[0][0].systemPrompt).toContain('No betting recommendation');
  });

  it.each([
    [{ i: 0, take: 'I want the opposing bats against this bullpen.' }],
    [{ i: 0, take: 'Fixture Hitter is 14-for-32 over the last 8 games.' }],
    [{ i: 0, take: 'The pitcher has a 0.312 xERA.' }],
    [{ i: 0, take: 'First answer.' }, { i: 0, take: 'Conflicting answer.' }],
    [{ i: '0', take: 'A numeric string must not identify a row.' }],
    [{ i: 0, take: true }],
    [{ i: 0, take: { text: 'Malformed object response' } }],
  ])('keeps the observed detail when a rewrite is unsupported or ambiguous (%j)', async (...entries) => {
    sessions.create.mockResolvedValue({});
    sessions.send.mockResolvedValue({ content: JSON.stringify({ reads: entries }) });
    const [result] = await applyGaryVoice([row()], { league: 'MLB' });
    expect(result.detail).toBe(row().detail);
    expect(result.meta.evidence).toBeUndefined();
  });
});
