import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: mocks.create, sendToSession: mocks.send, sendToSessionWithRetry: mocks.send,
}));
vi.mock('../../../src/services/agentic/orchestrator/orchestratorConfig.js', async original => {
  const config = await original();
  return { ...config, CONFIG: { ...config.CONFIG, maxIterations: 4 } };
});
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';

const home = 'Dallas Cowboys', away = 'New York Giants';
const game = { home_team: home, away_team: away, spread_home: -3.5, spread_away: 3.5, spread_home_odds: -110, spread_away_odds: -105 };
const homeCase = 'The original home case considers the offensive matchup and the uncertainty in the opposing coverage. '.repeat(4).trim();
const awayCase = 'The original away case considers sustained possessions and the uncertainty in the home pass protection. '.repeat(4).trim();
const cases = `CASE FOR DALLAS COWBOYS COVERING THE SPREAD:\n${homeCase}\n\nCASE FOR NEW YORK GIANTS COVERING THE SPREAD:\n${awayCase}\n\nINVESTIGATION COMPLETE`;
const rationale = 'The home offense has a documented path against the opposing coverage. Sustained visiting possessions remain the main risk, and the original evidence leaves that uncertainty unresolved. '.repeat(7).trim();
const card = extra => JSON.stringify({ final_pick: 'Dallas Cowboys -3.5 -110', confidence_score: 0.63, rationale, ...extra });
const response = (content, finishReason = 'stop') => ({ content, toolCalls: null, finishReason });
const run = () => runAgentLoop('system', 'Original NFL desk', 'americanfootball_nfl', home, away, { game, spread: -3.5 });

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('GARY_RESEARCHER', 'off');
  mocks.create.mockResolvedValue({ provider: 'codex-cli', modelName: 'codex-gpt-6-astra' });
  mocks.send.mockRejectedValue(new Error('Unexpected extra model turn'));
});
afterEach(() => vi.unstubAllEnvs());

describe('NFL final-output retries in the actual persistent session', () => {
  it.each([
    ['max_tokens', () => response('Incomplete final output', 'max_tokens'), 'Your response was CUT OFF'],
    ['short rationale', () => response(card({ rationale: 'The home club has the stronger case.' })), 'Your rationale is too short'],
    ['cut sentence', () => response(card({ rationale: rationale.slice(0, -1) })), 'Your rationale was CUT OFF'],
  ])('sends the %s correction instead of repeating the previous formatting instruction', async (_failure, incomplete, correction) => {
    mocks.send.mockResolvedValueOnce(response(cases))
      .mockResolvedValueOnce(response('My final call is Dallas to cover the supplied spread, for the original matchup reasons.'))
      .mockResolvedValueOnce(incomplete()).mockResolvedValueOnce(response(card()));
    const result = await run();
    expect(result).toMatchObject({ pick: 'Dallas Cowboys -3.5 -110', path_home: homeCase, path_away: awayCase });
    expect(mocks.send.mock.calls[3][1]).toContain(correction);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result._originalToolResponses).toEqual([]);
  });

  it('does not accept a parseable Pass 2 card when the provider reports truncation', async () => {
    mocks.send.mockResolvedValueOnce(response(cases)).mockResolvedValueOnce(response(card(), 'max_tokens'))
      .mockResolvedValueOnce(response(card()));
    const result = await run();
    expect(result.rationale).toBe(rationale);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls[2][1]).toContain('Your response was CUT OFF');
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it.each(['The home club has the stronger case.', rationale.slice(0, -1)])('applies the same rationale validation before an early Pass 2 return', async invalidRationale => {
    mocks.send.mockResolvedValueOnce(response(cases)).mockResolvedValueOnce(response(card({ rationale: invalidRationale })))
      .mockResolvedValueOnce(response(card()));
    const result = await run();
    expect(result.rationale).toBe(rationale);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls[2][1]).toContain('PASS 3');
  });

  it('returns a failure instead of a parseable truncated card when no retry budget remains', async () => {
    mocks.send.mockResolvedValueOnce(response(cases))
      .mockResolvedValueOnce(response('My final call is Dallas to cover the supplied spread, for the original matchup reasons.'))
      .mockResolvedValueOnce(response('Incomplete final output', 'max_tokens'))
      .mockResolvedValueOnce(response(card(), 'max_tokens'));
    const result = await run();
    expect(result.error).toMatch(/truncat/i);
    expect(result.pick).toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(4);
  });

  it('does not accept a last-turn card that never completed the required NFL case review', async () => {
    mocks.send.mockResolvedValueOnce(response('I am still reviewing the home matchup.'))
      .mockResolvedValueOnce(response('I am still reviewing the visiting matchup.'))
      .mockResolvedValueOnce(response('I have not completed both cases.'))
      .mockResolvedValueOnce(response(card()));
    const result = await run();
    expect(result.error).toMatch(/pipeline|case review/i);
    expect(result.pick).toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(4);
  });
});
