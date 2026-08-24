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
