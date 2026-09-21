import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Sep 21 2026: a login the CLI reported capped until Sep 26 was forgotten by
// every fresh process, so each scheduled pass still gave it a share of the
// search window and then re-learned the cap the slow way.
describe('codex cap memory across processes', () => {
  it('remembers a dated cap in a fresh process until it expires', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'codex-caps-')), 'caps.json');
    vi.stubEnv('GARY_CODEX_CAP_FILE', file);
    const now = Date.parse('2026-09-21T22:00:00Z');
    const first = await import('../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js');
    first._resetCodexHomeCaps();
    first.markCodexHomeCapped('/h/.codex-plus', 'try again at Sep 26th, 2026 10:48 AM', now);
    vi.resetModules();
    const second = await import('../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js');
    expect(second.isCodexHomeCapped('/h/.codex-plus', now + 60_000)).toBe(true);
    expect(second.isCodexHomeCapped('/h/.codex-plus', Date.parse('2026-09-26T15:00:00Z'))).toBe(false);
    vi.unstubAllEnvs();
  });
});
