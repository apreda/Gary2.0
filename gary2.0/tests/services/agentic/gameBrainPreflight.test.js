import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ codex: vi.fn(), claude: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({
  isCodexCliModel: model => model.startsWith('codex-'), codexCliOneShot: mocks.codex,
}));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js', () => ({
  isClaudeCliModel: model => model.startsWith('claude-'), claudeCliPing: mocks.claude,
}));
import { preflightBrains } from '../../../src/services/agentic/orchestrator/providerAdapters/brainPreflight.js';
import { gameBrainRoutes } from '../../../src/services/agentic/orchestrator/gameBrainRouting.js';
const models = ['claude-fable-5-1', 'codex-gpt-6-astra', 'claude-opus-5'];
const routes = gameBrainRoutes(models, { env: {}, home: '/fixture' });
beforeEach(() => { mocks.codex.mockReset(); mocks.claude.mockReset(); });
describe('game preflight account order', () => {
  it('stops after Fable answers without waking GPT or Opus', async () => {
    mocks.claude.mockResolvedValue({ success: true });
    expect((await preflightBrains(routes)).results).toEqual([{ model: models[0], routeId: models[0], ok: true, reason: null }]);
    expect(mocks.codex).not.toHaveBeenCalled();
    expect(mocks.claude).toHaveBeenCalledTimes(1);
  });
  it('tests Pro only after Fable, Plus and Opus all refuse', async () => {
    mocks.claude.mockResolvedValue({ success: false, error: 'usage limit' });
    mocks.codex.mockResolvedValueOnce({ success: false, error: 'refresh token revoked' }).mockResolvedValueOnce({ success: true });
    const result = await preflightBrains(routes);
    expect(result.results.at(-1)).toMatchObject({ model: models[1], ok: true });
    expect(mocks.codex.mock.calls.map(([, options]) => options.codexHomes)).toEqual([['/fixture/.codex-plus'], ['/fixture/.codex']]);
    expect(mocks.claude).toHaveBeenCalledTimes(2);
  });
  it('reaches Opus after Plus fails without probing Pro', async () => {
    mocks.claude.mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    mocks.codex.mockResolvedValue({ success: false, error: 'usage limit' });
    const result = await preflightBrains(routes);
    expect(mocks.codex).toHaveBeenCalledTimes(1);
    expect(result.results.map(r => r.ok)).toEqual([false, false, true]);
    expect(mocks.claude.mock.calls.map(([model]) => model)).toEqual([models[0], models[2]]);
  });
});
