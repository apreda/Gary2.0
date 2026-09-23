import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ claude: vi.fn(), gpt: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js', () => ({ claudeCliWebSearch: calls.claude }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({ codexCliWebSearch: calls.gpt }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/deepseekSession.js', () => ({ deepseekOneShot: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/subscriptionRoutes.js', async (importOriginal) => ({ ...(await importOriginal()), subscriptionRoutes: () => [
  { id: 'claude-subscription', model: 'claude-sonnet-5' },
  { id: 'business-gpt-0', model: 'codex-gpt-5.6-terra', codexHomes: ['/h/.codex-plus'] },
  { id: 'personal-gpt', model: 'codex-gpt-5.6-terra', codexHomes: ['/h/.codex'], allowPersonalAccount: true },
] }));
import { subscriptionSearch } from '../../../src/services/agentic/orchestrator/subscriptionSearch.js';
import { markCodexHomeCapped, _resetCodexHomeCaps } from '../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js';
beforeEach(() => {
  vi.resetAllMocks(); _resetCodexHomeCaps();
  calls.claude.mockResolvedValue({ success: false, error: 'no answer' });
  calls.gpt.mockResolvedValue({ success: false, error: 'no answer' });
});
describe('Wire search window (Sep 21 2026: routes split a league window into 43 s slices)', () => {
  it('gives the first route the full bridge window instead of an even split', async () => {
    await subscriptionSearch('news', { timeoutMs: 130_000, primaryTimeoutMs: 90_000 });
    expect(calls.claude.mock.calls[0][1].timeoutMs).toBeGreaterThanOrEqual(89_000);
  });
  it('does not count a login that is known to be capped when dividing the window', async () => {
    markCodexHomeCapped('/h/.codex', 'try again at Sep 26th, 2026 6:01 AM', Date.parse('2026-09-21T20:00:00Z'));
    const r = await subscriptionSearch('news', { timeoutMs: 130_000, primaryTimeoutMs: 90_000 });
    expect(calls.gpt).toHaveBeenCalledTimes(1);
    expect(calls.gpt.mock.calls[0][1].codexHomes).toEqual(['/h/.codex-plus']);
    expect(calls.gpt.mock.calls[0][1].timeoutMs).toBeGreaterThanOrEqual(35_000);
    expect(r.error).toContain('personal-gpt: login capped');
  });
  it('lets the only live route use the whole league window', async () => {
    const now = Date.parse('2026-09-21T22:00:00Z');
    markCodexHomeCapped('/h/.codex', 'try again at Sep 26th, 2026 6:01 AM', now);
    markCodexHomeCapped('/h/.codex-plus', 'try again at Sep 26th, 2026 10:48 AM', now);
    await subscriptionSearch('news', { timeoutMs: 130_000, primaryTimeoutMs: 90_000 });
    expect(calls.gpt).not.toHaveBeenCalled();
    expect(calls.claude.mock.calls[0][1].timeoutMs).toBeGreaterThanOrEqual(129_000);
  });
});
