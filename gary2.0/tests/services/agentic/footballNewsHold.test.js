// NO NEWS, NO PICK (founder, Nov 12 2026: "Gary shouldn't be picking when data doesn't load"). On Nov 1, 9 of 12 NFL reads
// went out with "today's news is not on file" when both news desks failed; a failed search now holds the pick, the props and
// the darts, and only a search that came back goes ahead, even when every line of it is then filtered out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ research: vi.fn() }));
vi.mock('../../../src/services/gary/agentic/orchestrator/researchBriefing.js', () => ({ buildResearchBriefing: mocks.research }));
import { nflNewsFor, NEWS_NOTHING_NEW } from '../../../src/services/gary/agentic/orchestrator/nflRead.js';
import { PickDataError } from '../../../src/services/gary/pickDataIntegrity.js';

let n = 0;
const ask = () => nflNewsFor(`story ${n++}`, 'americanfootball_nfl', 'Pittsburgh Steelers', 'Cleveland Browns', { gameId: n, timeoutMs: 60_000 });
beforeEach(() => { vi.stubEnv('GARY_RESEARCHER', 'on'); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); mocks.research.mockReset(); });

describe("a game's news search", () => {
  it('that failed on every desk holds the pick', async () => {
    mocks.research.mockRejectedValue(new Error('HTTP 429'));
    await expect(ask()).rejects.toBeInstanceOf(PickDataError);
    mocks.research.mockResolvedValue('');
    await expect(ask()).rejects.toThrow(/today's news for this game/);
  });
  it('that came back goes ahead, even when every line was filtered out', async () => {
    mocks.research.mockResolvedValue('PITTSBURGH: T.J. Watt practiced in full Friday and is expected to play.');
    expect(await ask()).toContain('T.J. Watt practiced in full Friday');
    mocks.research.mockResolvedValue('PITTSBURGH: Last season the Steelers went 10-7.');
    expect(await ask()).toBe(NEWS_NOTHING_NEW);
  });
  it('switched off is not a failure', async () => {
    vi.stubEnv('GARY_RESEARCHER', 'off');
    expect(await ask()).toBeNull();
    expect(mocks.research).not.toHaveBeenCalled();
  });
});
