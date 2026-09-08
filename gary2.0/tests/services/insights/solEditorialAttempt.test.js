import { beforeEach, describe, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ createModelSession: vi.fn(), sendToSession: vi.fn(), sendToSessionWithRetry: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => session);
vi.mock('../../../src/services/agentic/orchestrator/orchestratorConfig.js', () => ({ DESK_FALLBACK_MODELS: ['unused-fallback'] }));
import { contentModel, generateSolTextOnce } from '../../../src/services/insights/solText.js';
beforeEach(() => { vi.clearAllMocks(); session.createModelSession.mockResolvedValue({ provider: 'fixture' }); });

describe('one-attempt optional editorial adapter', () => {
  it('uses the existing configured content model without the retry wrapper or a fallback model', async () => {
    session.sendToSession.mockRejectedValueOnce(new Error('network failure'));
    await expect(generateSolTextOnce('Order these approved identities.')).rejects.toThrow('network failure');
    expect(session.createModelSession).toHaveBeenCalledTimes(1);
    expect(session.createModelSession.mock.calls[0][0].modelName).toBe(contentModel());
    expect(session.sendToSession).toHaveBeenCalledTimes(1);
    expect(session.sendToSessionWithRetry).not.toHaveBeenCalled();
  });
});
