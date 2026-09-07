import { describe, it, expect, vi } from 'vitest';
import { createCostTracker } from '../../../src/services/agentic/orchestrator/costTracker.js';

describe('observed token usage and subscription cost reporting', () => {
  it('prices Astra and future Codex subscription models at zero marginal model cost', () => {
    const tracker = createCostTracker('subscription');
    for (const model of ['codex-gpt-6-astra', 'codex-future-model']) tracker.addUsage(model, {
      prompt_tokens: 100_000, completion_tokens: 5000, cached_tokens: 80_000,
    });
    const totals = tracker.getTotals();
    expect(totals.totalCost).toBe(0);
    expect(totals.breakdown.every(b => b.cachedInputTokens === 80_000 && b.uncachedInputTokens === 20_000)).toBe(true);
  });
  it('does not fabricate a total from logical search counts or unknown API prices', () => {
    const tracker = createCostTracker('unknown costs');
    tracker.addUsage('unpriced-api-model', { prompt_tokens: 1000, completion_tokens: 100 });
    tracker.addGroundingCall();
    expect(tracker.getTotals()).toMatchObject({ totalCost: null, groundingCost: null, unpricedModelCalls: 1 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try { expect(tracker.logSummary()).toBeNull(); expect(log.mock.calls.flat().join(' ')).toContain('total unavailable'); }
    finally { log.mockRestore(); }
  });
  it('retains known API estimates and bounds cached usage within input usage', () => {
    const tracker = createCostTracker('metered');
    tracker.addUsage('anthropic-claude-haiku-4-5', { prompt_tokens: '1000', completion_tokens: '100', cached_tokens: 2000 });
    expect(tracker.getTotals()).toMatchObject({ totalCost: 0.0015, breakdown: [{ inputTokens: 1000, cachedInputTokens: 1000, uncachedInputTokens: 0 }] });
  });
});
