import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameBrainEffort, gameCodexHomes, runGameBrainOnAccounts } from '../../../src/services/agentic/orchestrator/gameBrainRouting.js';
import { markCodexHomeCapped, _resetCodexHomeCaps } from '../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js';

beforeEach(() => _resetCodexHomeCaps());
const homes = ['/plus', '/pro'];
const pick = { pick: 'Fixture ML +120' };

describe('game subscription routing', () => {
  it('uses Plus before Pro without changing global Codex account discovery', () => {
    expect(gameCodexHomes({ home: '/user', env: { CODEX_HOME: '/interactive', GARY_CODEX_HOMES: '/content' } }))
      .toEqual(['/user/.codex-plus', '/user/.codex']);
    expect(gameCodexHomes({ env: { GARY_GAME_CODEX_HOMES: '/a, /b,/a' } })).toEqual(['/a', '/b']);
  });

  it('keeps Fable at xhigh and Opus at max without trying a GPT account', async () => {
    for (const [model, thinkingLevel] of [['claude-fable-5-1', 'xhigh'], ['claude-opus-5', 'max']]) {
      const run = vi.fn().mockResolvedValue(pick);
      expect(await runGameBrainOnAccounts(model, run, { homes })).toBe(pick);
      expect(run).toHaveBeenCalledExactlyOnceWith({ thinkingLevel });
    }
    expect(gameBrainEffort('codex-gpt-6-astra')).toBe('xhigh');
  });

  it('uses only Plus when its full Astra analysis succeeds', async () => {
    const run = vi.fn().mockResolvedValue(pick);
    expect(await runGameBrainOnAccounts('codex-gpt-6-astra', run, { homes })).toBe(pick);
    expect(run).toHaveBeenCalledExactlyOnceWith({ thinkingLevel: 'xhigh', codexHomes: ['/plus'] });
  });

  it.each(['usage limit during Pass 2', 'refresh token was revoked'])('restarts the whole analysis on Pro after %s', async error => {
    const run = vi.fn().mockResolvedValueOnce({ error }).mockResolvedValueOnce(pick);
    expect(await runGameBrainOnAccounts('codex-gpt-6-astra', run, { homes })).toBe(pick);
    expect(run.mock.calls.map(([options]) => options)).toEqual([
      { thinkingLevel: 'xhigh', codexHomes: ['/plus'] },
      { thinkingLevel: 'xhigh', codexHomes: ['/pro'] },
    ]);
  });

  it('skips a known capped account and returns failure only after all eligible accounts fail', async () => {
    markCodexHomeCapped('/plus', 'usage limit');
    const run = vi.fn().mockRejectedValue(new Error('Pro usage limit'));
    expect(await runGameBrainOnAccounts('codex-gpt-6-astra', run, { homes })).toMatchObject({ error: 'Pro usage limit' });
    expect(run).toHaveBeenCalledExactlyOnceWith({ thinkingLevel: 'xhigh', codexHomes: ['/pro'] });
  });

  it.each([
    { error: 'Missing roster', code: 'required_data_unavailable' },
    { error: 'Missing price', code: 'market_unavailable' },
    { error: 'Incomplete evidence', retryModel: false },
  ])('does not use another account to evade a data failure: $error', async failure => {
    const run = vi.fn().mockResolvedValue(failure);
    expect(await runGameBrainOnAccounts('codex-gpt-6-astra', run, { homes })).toMatchObject(failure);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not start another account after cancellation', async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => { controller.abort(new Error('Stopped game')); return { error: 'quota' }; });
    await expect(runGameBrainOnAccounts('codex-gpt-6-astra', run, { homes, signal: controller.signal })).rejects.toThrow('Stopped game');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
