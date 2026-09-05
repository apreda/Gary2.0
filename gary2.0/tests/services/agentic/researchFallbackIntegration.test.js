import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), research: vi.fn(), createFollowUp: vi.fn(), ask: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({ createModelSession: mocks.create, sendToSession: mocks.send, sendToSessionWithRetry: mocks.send }));
vi.mock('../../../src/services/agentic/orchestrator/researchBriefing.js', () => ({ buildResearchBriefing: mocks.research, extractResearcherQuestions: (text) => String(text).includes('ASK RESEARCHER:') ? ['Verify the weather'] : [], createResearcherFollowUpSession: mocks.createFollowUp, askResearcher: mocks.ask }));
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GARY_RESEARCHER', 'on');
  vi.stubEnv('GARY_CHILD_DEADLINE_AT', '');
  mocks.create.mockResolvedValue({ provider: 'codex-cli', modelName: 'codex-gpt-6-astra' });
  mocks.send.mockRejectedValue(new Error('test stops at brain decision input'));
  mocks.createFollowUp.mockResolvedValue({ provider: 'codex-cli' });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('original-desk decision after optional research failure', () => {
  it('actually reaches Astra with the unchanged original desk and reuses unavailable research on retry', async () => {
    mocks.research.mockRejectedValue(new Error('research unavailable'));
    const options = { game: { moneyline_home: -110, moneyline_away: -110 }, scoutReport: 'exact original stats and data', gameId: 77, modelOverride: 'codex-gpt-6-astra' };
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(runAgentLoop('system', 'original desk decision input', 'baseball_mlb', 'Home', 'Away', { ...options })).rejects.toThrow('test stops at brain decision input');
    }
    expect(mocks.research).toHaveBeenCalledTimes(2); // two researchers, once across both brain attempts
    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const call of mocks.send.mock.calls) expect(call[1]).toBe('original desk decision input');
  });

  it('continues to the original desk when a hanging researcher exhausts the shared budget', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GARY_RESEARCH_TIMEOUT_MS', '100');
    let researchSignal;
    mocks.research.mockImplementation((...args) => { researchSignal = args.at(-1).signal; return new Promise(() => {}); });
    const task = runAgentLoop('system', 'timed original desk', 'baseball_mlb', 'Home', 'Away', { game: { moneyline_home: -110, moneyline_away: -110 }, scoutReport: 'other original desk', gameId: 78, modelOverride: 'codex-gpt-6-astra' });
    const ended = expect(task).rejects.toThrow('test stops at brain decision input');
    await vi.advanceTimersByTimeAsync(100);
    await ended;
    expect(researchSignal.aborted).toBe(true);
    expect(mocks.research).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toBe('timed original desk');
  });

  it('gives follow-ups only the time left from the initial budget, then continues the same brain', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GARY_RESEARCH_TIMEOUT_MS', '100');
    mocks.research.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
      return { briefing: 'Verified original briefing' };
    });
    mocks.send.mockResolvedValueOnce({ content: 'ASK RESEARCHER: Verify the weather', toolCalls: null, finishReason: 'stop' });
    let followUpSignal;
    mocks.ask.mockImplementation((_session, _questions, options) => { followUpSignal = options.signal; return new Promise(() => {}); });
    const task = runAgentLoop('system', 'follow-up original desk', 'baseball_mlb', 'Home', 'Away', { game: { moneyline_home: -110, moneyline_away: -110 }, scoutReport: 'follow-up desk', gameId: 79, modelOverride: 'codex-gpt-6-astra' });
    const ended = expect(task).rejects.toThrow('test stops at brain decision input');
    await vi.advanceTimersByTimeAsync(100);
    await ended;
    expect(followUpSignal.aborted).toBe(true);
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[1][1].content).toContain('Work from the desk and the briefing.');
    expect(mocks.send.mock.calls[1][1].content).toContain('question budget is exhausted');
  });
});
