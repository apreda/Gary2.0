import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({ codexCliWebSearch: vi.fn() }));
vi.mock('../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js', () => ({ anthropicWebSearchRaw: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js', () => ({ claudeCliWebSearch: vi.fn() }));
import { claudeCliWebSearch } from '../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js';
import { _resetMeteredSearchBudget } from '../../../src/services/agentic/scoutReport/shared/meteredSearchBudget.js';
import { codexCliWebSearch } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import { anthropicWebSearchRaw } from '../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js';
import { groundingSearch, groundedWebSearch } from '../../../src/services/agentic/scoutReport/shared/grounding.js';

const clarification = 'I’ll search official sources for the requested team.\n\nWhat would you like me to research or do? Please provide the topic, team, company, file, or specific task.';
const fallback = 'Seattle published the current roster transaction on September 8, 2026. [Official report](https://www.seahawks.com/news/report)';
beforeEach(() => {
  codexCliWebSearch.mockReset().mockResolvedValue({ success: true, data: clarification });
  anthropicWebSearchRaw.mockReset().mockResolvedValue({ success: true, data: fallback });
  claudeCliWebSearch.mockReset().mockResolvedValue({ success: false, data: '' });
  delete process.env.GARY_GROUNDING_VIA_CLAUDE;
  // The metered rung is what these cases exercise; the default budget is 0.
  process.env.GARY_METERED_SEARCH_CAP = '-1';
  _resetMeteredSearchBudget();
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.GARY_METERED_SEARCH_CAP; delete process.env.GARY_GROUNDING_VIA_CLAUDE; });

describe('the press never bills the key on its own (Sep 9 2026)', () => {
  it('with the default budget the metered API is not bought when the codex bridge fails', async () => {
    delete process.env.GARY_METERED_SEARCH_CAP;
    _resetMeteredSearchBudget();
    codexCliWebSearch.mockResolvedValue({ success: false, data: '', error: 'capped' });
    const result = await groundedWebSearch('Seahawks roster news', { sport: 'NFL' });
    expect(result.success).toBe(false);
    expect(anthropicWebSearchRaw).not.toHaveBeenCalled();
  });
  it('the Claude bridge answers before the metered API when GARY_GROUNDING_VIA_CLAUDE=1', async () => {
    process.env.GARY_GROUNDING_VIA_CLAUDE = '1';
    codexCliWebSearch.mockResolvedValue({ success: false, data: '', error: 'capped' });
    claudeCliWebSearch.mockResolvedValue({ success: true, data: fallback });
    const result = await groundedWebSearch('Seahawks roster news', { sport: 'NFL' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('September 8, 2026');
    expect(claudeCliWebSearch).toHaveBeenCalledTimes(1);
    expect(anthropicWebSearchRaw).not.toHaveBeenCalled();
  });
});

describe('grounding rejects completed non-answers before they become research', () => {
  it('uses the existing Anthropic fallback when Codex asks for the already supplied task', async () => {
    expect(await groundingSearch(null, 'Seattle news', 'September 8, 2026')).toBe(fallback);
    expect(anthropicWebSearchRaw).toHaveBeenCalledTimes(1);
  });
  it('returns unavailable when both providers answer with clarification or inability to search', async () => {
    anthropicWebSearchRaw.mockResolvedValue({ success: true, data: 'I cannot browse the web in this conversation.' });
    expect(await groundingSearch(null, 'Seattle news', 'September 8, 2026')).toBeNull();
  });
  it('retains a factual report that honestly identifies an unverified detail', async () => {
    const answer = 'I cannot verify the exact return date. Seattle’s September 8 report confirmed limited practice; no game designation has been announced. [Official report](https://www.seahawks.com/news/report)';
    codexCliWebSearch.mockResolvedValue({ success: true, data: answer });
    expect(await groundingSearch(null, 'Seattle news', 'September 8, 2026')).toBe(answer);
    expect(anthropicWebSearchRaw).not.toHaveBeenCalled();
  });
  it('does not reuse an older cached progress-plus-clarification response', async () => {
    const query = `cached-clarification-${process.pid}-${Date.now()}`;
    const directory = join(process.env.TMPDIR || '/tmp', 'gary-grounding-cache');
    const path = join(directory, `${createHash('md5').update(query).digest('hex')}.json`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, JSON.stringify({ success: true, data: clarification }));
    try {
      expect(await groundedWebSearch(query)).toMatchObject({ success: true, data: fallback });
      expect(codexCliWebSearch).toHaveBeenCalledTimes(1);
      expect(anthropicWebSearchRaw).toHaveBeenCalledTimes(1);
    } finally { rmSync(path, { force: true }); }
  });
});
