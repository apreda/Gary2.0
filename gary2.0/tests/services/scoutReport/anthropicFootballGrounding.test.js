import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CODEX FIRST (Sep 1 2026): every football search lane tries the $0 codex
// bridge before the Anthropic server search. Mocked here so a unit test never
// spawns the real CLI; the default miss exercises the Anthropic path these
// pins were written for, and one pin below covers the codex hit.
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({
  codexCliWebSearch: vi.fn(async () => ({ success: false, data: '', raw: null, error: 'mocked miss' })),
  isCodexCliModel: (m) => typeof m === 'string' && m.startsWith('codex-'),
}));
import { codexCliWebSearch } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import {
  fetchAnthropicFootballCurrentState,
  isSearchRefusal,
  scrubFootballGroundingText,
} from '../../../src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js';

const originalKey = process.env.ANTHROPIC_API_KEY;
const originalModel = process.env.ANTHROPIC_GROUNDING_MODEL;

const narrative = [
  'Buffalo Bills — Current State',
  'The Buffalo Bills verified their starter and reserve playing-time plans in a current coach briefing. '.repeat(3),
  'Carolina Panthers — Current State',
  'The Carolina Panthers separately verified their starter and reserve playing-time plans in a current coach briefing. '.repeat(3),
  'Matchup Context',
  'This is a preseason game, so starter-phase facts remain separate from reserve-phase facts.',
].join('\n');

function response({ stop_reason = 'end_turn', content } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason,
      content: content || [
        { type: 'server_tool_use', id: 'search_1', name: 'web_search', input: { query: 'current game news' } },
        { type: 'web_search_tool_result', tool_use_id: 'search_1', content: [{ type: 'web_search_result', url: 'https://example.com', title: 'Report', encrypted_content: 'encrypted' }] },
        { type: 'text', text: narrative },
      ],
    }),
  };
}

function request(fetchImpl, overrides = {}) {
  return fetchAnthropicFootballCurrentState({
    homeTeam: 'Buffalo Bills',
    awayTeam: 'Carolina Panthers',
    sport: 'americanfootball_nfl',
    gameDate: 'August 28, 2026',
    now: new Date('2026-08-22T17:00:00.000Z'),
    fetchImpl,
    ...overrides,
  });
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.ANTHROPIC_GROUNDING_MODEL;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.ANTHROPIC_GROUNDING_MODEL;
  else process.env.ANTHROPIC_GROUNDING_MODEL = originalModel;
});

describe('Anthropic football current-state fallback', () => {
  it('uses the server web-search tool with symmetric football-only boundaries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response());
    const result = await request(fetchImpl);

    expect(result).toMatchObject({ provider: 'anthropic-web-search', searchCount: 1 });
    const [url, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers).toMatchObject({
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
    });
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.tools).toEqual([expect.objectContaining({
      type: 'web_search_20250305', name: 'web_search', max_uses: 6,
    })]);
    const prompt = body.messages[0].content;
    expect(prompt).toContain('Current ET system date: Saturday, August 22, 2026');
    expect(prompt).toContain('Target game date: August 28, 2026');
    expect(prompt).toContain('BOTH Buffalo Bills and Carolina Panthers');
    expect(prompt).toContain('starter-phase plans from verified reserve-phase plans');
    expect(prompt).toContain('Do not include odds, spreads, moneylines, totals, ATS records');
    expect(prompt).toContain('Do not report injuries or injury statuses');
  });

  it('continues pause_turn by replaying encrypted assistant blocks unchanged', async () => {
    const pausedBlocks = [
      { type: 'server_tool_use', id: 'search_pause', name: 'web_search', input: { query: 'Buffalo Bills plans' } },
      { type: 'web_search_tool_result', tool_use_id: 'search_pause', content: [{ type: 'web_search_result', encrypted_content: 'keep-me-exact', url: 'https://example.com/a', title: 'A' }] },
    ];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ stop_reason: 'pause_turn', content: pausedBlocks }))
      .mockResolvedValueOnce(response());

    const result = await request(fetchImpl);
    expect(result).not.toBeNull();
    const first = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(second.messages[1]).toEqual({ role: 'assistant', content: pausedBlocks });
    expect(second.tools).toEqual(first.tools);
  });

  it('fails closed after the bounded pause_turn continuation cap', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      stop_reason: 'pause_turn',
      content: [{ type: 'text', text: 'still working' }],
    }));
    expect(await request(fetchImpl)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects a 200 response whose search tool result is an embedded error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ content: [
      { type: 'web_search_tool_result', tool_use_id: 'bad', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } },
      { type: 'text', text: narrative },
    ] }));
    expect(await request(fetchImpl)).toBeNull();
  });

  it('rejects HTTP failures, incomplete stops, short text, and one-team reports', async () => {
    const httpFail = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    expect(await request(httpFail)).toBeNull();

    const maxTokens = vi.fn().mockResolvedValue(response({ stop_reason: 'max_tokens' }));
    expect(await request(maxTokens)).toBeNull();

    const short = vi.fn().mockResolvedValue(response({ content: [
      { type: 'web_search_tool_result', tool_use_id: 'x', content: [{ type: 'web_search_result' }] },
      { type: 'text', text: 'Buffalo Bills and Carolina Panthers.' },
    ] }));
    expect(await request(short)).toBeNull();

    const oneTeam = vi.fn().mockResolvedValue(response({ content: [
      { type: 'web_search_tool_result', tool_use_id: 'x', content: [{ type: 'web_search_result' }] },
      { type: 'text', text: 'Buffalo Bills current report. '.repeat(20) },
    ] }));
    expect(await request(oneTeam)).toBeNull();
  });

  it('does not call the provider without the metered API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchImpl = vi.fn();
    expect(await request(fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('strips betting and pick lines from an otherwise factual report', () => {
    const cleaned = scrubFootballGroundingText(`Buffalo Bills facts.\nOur pick: Bills +3.5.\nCarolina Panthers facts.\nATS trend: 4-1 ATS.\nMatchup context remains factual.`);
    expect(cleaned).toContain('Buffalo Bills facts.');
    expect(cleaned).toContain('Carolina Panthers facts.');
    expect(cleaned).not.toMatch(/pick|\+3\.5|ATS/i);
  });
});

describe('codex-first football search (Sep 1 2026)', () => {
  it('a valid codex draft is returned under the same validation floor without touching Anthropic', async () => {
    const draft = [
      '## Buffalo Bills',
      'The Buffalo Bills verified their starter and reserve playing-time plans in a current coach briefing. '.repeat(3),
      '## Carolina Panthers',
      'The Carolina Panthers separately verified their starter and reserve playing-time plans in a current coach briefing. '.repeat(3),
    ].join('\n');
    codexCliWebSearch.mockResolvedValueOnce({ success: true, data: draft, raw: null });
    const fetchImpl = vi.fn();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const result = await fetchAnthropicFootballCurrentState({
      homeTeam: 'Buffalo Bills', awayTeam: 'Carolina Panthers', sport: 'NFL', fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result?.provider).toBe('codex-web-search');
    expect(result?.data).toContain('Buffalo Bills');
    expect(result?.data).toContain('Carolina Panthers');
  });

  it('a codex draft that is a refusal falls through — an apology never reaches the desk', async () => {
    const refusal = "## FINDINGS\n\nI apologize, but I cannot provide the coverage you've requested. The Buffalo Bills and the Carolina Panthers have not yet played any regular season games, so there is no recent usage to report. "
      + "I'd be happy to provide this analysis after the teams have played regular season games. ".repeat(6);
    codexCliWebSearch.mockResolvedValueOnce({ success: true, data: refusal, raw: null });
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const result = await fetchAnthropicFootballCurrentState({
      homeTeam: 'Buffalo Bills', awayTeam: 'Carolina Panthers', sport: 'NFL', fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('isSearchRefusal spots the model declining and leaves reporting alone', () => {
    expect(isSearchRefusal("I apologize, but I cannot provide the coverage you've requested.")).toBe(true);
    expect(isSearchRefusal('The initial searches returned only depth charts. Let me search for game analysis.')).toBe(true);
    expect(isSearchRefusal("I'm unable to find game coverage for this matchup.")).toBe(true);
    expect(isSearchRefusal('The Bills held the Panthers to 12 points; the pass rush produced five sacks.')).toBe(false);
    expect(isSearchRefusal('')).toBe(false);
  });

  it('a codex draft that names only one team falls through to Anthropic', async () => {
    codexCliWebSearch.mockResolvedValueOnce({ success: true, data: '## Buffalo Bills\n' + 'Only the Bills are discussed here at length. '.repeat(12), raw: null });
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const result = await fetchAnthropicFootballCurrentState({
      homeTeam: 'Buffalo Bills', awayTeam: 'Carolina Panthers', sport: 'NFL', fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
