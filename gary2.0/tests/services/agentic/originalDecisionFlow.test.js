import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), fetch: vi.fn(), scout: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: mocks.create, sendToSession: mocks.send, sendToSessionWithRetry: mocks.send,
}));
vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({ buildScoutReport: mocks.scout }));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({ fetchStats: mocks.fetch, clearStatRouterCache: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/orchestratorHelpers.js', async importOriginal => ({
  ...await importOriginal(),
  // Exercise the real loop with aggressive working-context cleanup. Originals
  // must survive even when later tools remove the accepted Pass 1 text.
  pruneContextIfNeeded: messages => messages.filter(m => m.role !== 'tool' && !m.content?.includes?.('CASE FOR ')),
}));
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';
import { analyzeGame } from '../../../src/services/agentic/orchestrator/orchestratorMain.js';
import { shouldRetryPickWithModel } from '../../../src/services/marketTruth.js';
import { originalGameEvidence, reviewSourceDesk } from '../../../src/services/pickdesk/originalGameEvidence.js';
const home = 'Home State', away = 'Away Tech';
const game = { home_team: home, away_team: away, spread_home: -3.5, spread_away: 3.5, spread_home_odds: -110, spread_away_odds: -105 };
const homeCase = 'Original home evidence and the unresolved risk in its cover case. '.repeat(5).trim();
const awayCase = 'Original away evidence and the unresolved risk in its cover case. '.repeat(5).trim();
const cases = `CASE FOR HOME STATE COVERING THE SPREAD:\n${homeCase}\n\nCASE FOR AWAY TECH COVERING THE SPREAD:\n${awayCase}\n\nINVESTIGATION COMPLETE`;
const card = JSON.stringify({ pick: 'Home State -3.5 (-110)', bet_type: 'spread', confidence_score: 60,
  rationale: 'The home team has a documented path against this opponent. The opposing case rests on sustained drives and the original evidence leaves that unresolved. '.repeat(9) });
const response = content => ({ content, toolCalls: null, finishReason: 'stop' });
const tool = (token,id) => ({ content: '', finishReason: 'tool_calls', toolCalls: [{ id, type: 'function', function: { name: 'fetch_stats', arguments: JSON.stringify({ token, sport: 'NFL' }) } }] });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('GARY_RESEARCHER','off');
  mocks.create.mockResolvedValue({ provider: 'codex-cli', modelName: 'codex-gpt-6-astra' });
  mocks.fetch.mockImplementation(async (_sport,token) => ({ source: 'fixture provider', data_scope: 'original college sample', home: { team: home, record: '1-0', games_used: 1 }, away: { team: away, note: `Original ${token} response` } }));
  mocks.send.mockRejectedValue(new Error('Unexpected model call'));
});
afterEach(() => vi.unstubAllEnvs());
describe('original evidence through actual decision exits', () => {
  it.each([true,false])('saves the accepted football cases and tool responses, early JSON %s', async early => {
    mocks.send.mockResolvedValueOnce(tool('RECENT_FORM','first')).mockResolvedValueOnce(response(cases));
    if (!early) mocks.send.mockResolvedValueOnce(tool('SCHEDULE_STRENGTH','later'));
    mocks.send.mockResolvedValueOnce(response(card));
    const result = await runAgentLoop('system','Original desk','americanfootball_ncaaf',home,away,{ game, spread: -3.5 });
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ path_home: homeCase, path_away: awayCase });
    expect(result._originalToolResponses.map(r => r.toolCallId)).toEqual(early ? ['first'] : ['first','later']);
    expect(result._originalToolResponses[0].content).toContain('"record": "1-0"');
    const delivered = mocks.send.mock.calls.filter(call => call[2]?.isFunctionResponse).flatMap(call => call[1]);
    expect(delivered[0].content).toBe(result._originalToolResponses[0].content);
    expect(mocks.fetch.mock.calls[0][0]).toBe('americanfootball_ncaaf'); // model's incorrect args.sport cannot change the menu
    const envelope = originalGameEvidence({ result, pick: result, deskText: 'Original desk' });
    expect(reviewSourceDesk(envelope)).toContain(result._originalToolResponses[0].content);
    expect(envelope.caseHome).toBe(homeCase);
  });

  it('does no scouting or model work for an unpriced market and permits a fresh priced attempt', async () => {
    const unpriced = { ...game, spread_home: null, spread_away: null, spread_home_odds: null, spread_away_odds: null };
    const missing = await analyzeGame(unpriced,'americanfootball_ncaaf');
    expect(missing).toMatchObject({ code: 'market_unavailable', retryModel: false });
    expect(shouldRetryPickWithModel(missing)).toBe(false);
    expect(mocks.scout).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
    mocks.scout.mockRejectedValueOnce(new Error('Reached fresh priced scout'));
    expect((await analyzeGame(game,'americanfootball_ncaaf')).error).toBe('Reached fresh priced scout');
    expect(mocks.scout).toHaveBeenCalledOnce();
    expect(shouldRetryPickWithModel({ error: 'Provider quota' })).toBe(true);
  });
});
