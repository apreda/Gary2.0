/**
 * WINNERS JUDGE v2 pins (founder GO, Aug 10 2026). Selection-only machinery:
 * scores a sealed case against its own desk, clamps everything, and returns
 * null on any failure — a judge problem can never block a stored pick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

import { createModelSession, sendToSessionWithRetry } from '../../../src/services/agentic/orchestrator/sessionManager.js';
import { judgeWinnersCase, buildJudgeAsk, JUDGE_SYSTEM } from '../../../src/services/pickdesk/winnersJudge.js';

const INPUT = {
  finalPick: 'Guardians ML -125',
  readWinner: 'Guardians',
  gameRead: 'the better arm and the fresher pen',
  rationale: "Gary's Take\n\nA clean case built on the desk.",
  deskText: '═══ PROBABLE PITCHERS ═══\nshelf facts',
};

beforeEach(() => {
  vi.clearAllMocks();
  createModelSession.mockResolvedValue({ modelName: 'judge' });
});

describe('judgeWinnersCase', () => {
  it('scores a case from fenced JSON, clamped to 0-100, with the basis trimmed', async () => {
    sendToSessionWithRetry.mockResolvedValue({
      content: '```json\n{ "case_strength": 82, "coherence": 90, "specificity": 71, "score": 108, "basis": "Named pen edge holds against the workload rows." }\n```',
    });
    const out = await judgeWinnersCase(INPUT);
    expect(out.score).toBe(100);
    expect(out.case_strength).toBe(82);
    expect(out.basis).toContain('pen edge');
  });

  it('returns null on garbage, missing score, or a thrown provider error', async () => {
    sendToSessionWithRetry.mockResolvedValue({ content: 'no json here' });
    expect(await judgeWinnersCase(INPUT)).toBeNull();
    sendToSessionWithRetry.mockResolvedValue({ content: '```json\n{ "basis": "no score" }\n```' });
    expect(await judgeWinnersCase(INPUT)).toBeNull();
    sendToSessionWithRetry.mockRejectedValue(new Error('bridge down'));
    expect(await judgeWinnersCase(INPUT)).toBeNull();
    expect(await judgeWinnersCase({ finalPick: null, deskText: 'x' })).toBeNull();
  });

  it('the ask carries desk, sealed pick, read, and card — and the system prompt never authors picks', () => {
    const ask = buildJudgeAsk(INPUT);
    expect(ask).toContain('THE DESK');
    expect(ask).toContain('Guardians ML -125');
    expect(ask).toContain('THE PRE-LINES READ');
    expect(ask).toContain('THE PUBLISHED CARD');
    expect(JUDGE_SYSTEM).toContain('You do not make picks');
  });
});
