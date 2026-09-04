import { beforeEach, describe, expect, it, vi } from 'vitest';

// The college lanes' grounded search transport: the Codex subscription bridge
// first ($0 marginal, the same rung the desks ride), the Anthropic server
// web-search API when the bridge is out. Same { success, data } contract as
// both rungs; a failure of both is a failure, never an empty answer.

const codex = vi.hoisted(() => ({ codexCliWebSearch: vi.fn() }));
const anthropic = vi.hoisted(() => ({ anthropicWebSearchRaw: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => codex);
vi.mock('../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js', () => anthropic);

const { searchGrounded } = await import('../../../src/services/insights/ncaafSearch.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchGrounded', () => {
  it('rides the Codex bridge first and never touches the metered rung when it answers', async () => {
    codex.codexCliWebSearch.mockResolvedValue({ success: true, data: '[{"player":"x"}]' });
    const out = await searchGrounded('who is hurt', { timeoutMs: 1234 });
    expect(out).toEqual({ success: true, data: '[{"player":"x"}]', transport: 'codex' });
    expect(codex.codexCliWebSearch).toHaveBeenCalledWith('who is hurt', expect.objectContaining({ timeoutMs: 1234 }));
    expect(anthropic.anthropicWebSearchRaw).not.toHaveBeenCalled();
  });

  it('falls back to the Anthropic server search when the bridge is out', async () => {
    codex.codexCliWebSearch.mockResolvedValue({ success: false, data: '', error: 'breaker open' });
    anthropic.anthropicWebSearchRaw.mockResolvedValue({ success: true, data: '[]' });
    const out = await searchGrounded('who is hurt', { timeoutMs: 1234, maxTokens: 3000 });
    expect(out).toEqual({ success: true, data: '[]', transport: 'anthropic' });
    expect(anthropic.anthropicWebSearchRaw).toHaveBeenCalledWith('who is hurt', expect.objectContaining({ timeoutMs: 1234, maxTokens: 3000 }));
  });

  it('reports a failure when both rungs fail', async () => {
    codex.codexCliWebSearch.mockResolvedValue({ success: false, data: '', error: 'timeout' });
    anthropic.anthropicWebSearchRaw.mockResolvedValue({ success: false, data: null, error: 'ANTHROPIC_API_KEY missing' });
    const out = await searchGrounded('who is hurt');
    expect(out.success).toBe(false);
    expect(out.data).toBeNull();
    expect(out.error).toContain('ANTHROPIC_API_KEY missing');
  });

  it('contains a throwing rung instead of surfacing it', async () => {
    codex.codexCliWebSearch.mockRejectedValue(new Error('spawn failed'));
    anthropic.anthropicWebSearchRaw.mockResolvedValue({ success: true, data: '[]' });
    const out = await searchGrounded('who is hurt');
    expect(out).toEqual({ success: true, data: '[]', transport: 'anthropic' });
  });
});
