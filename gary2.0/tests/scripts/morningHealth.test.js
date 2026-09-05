import { describe, expect, it } from 'vitest';
import { dateBefore, etDate, evaluateMorningHealth, loadMorningHealth } from '../../scripts/lib/morningHealth.js';

const date = '2026-09-05';
const now = '2026-09-05T11:00:00Z';
const game = (id, league = 'MLB', time = '2026-09-05T20:10:00Z') => ({ date, league, bdl_game_id: id, commence_time: time });
const fresh = { created_at: '2026-09-05T10:15:00Z' };
function snapshot(games = [game(1)]) {
  return {
    slate: games, board: [{ date, board: games, updated_at: fresh.created_at }],
    insights: games.map(g => ({ league: g.league, game_id: String(g.bdl_game_id), ...fresh })),
    cards: games.map(g => ({ league: g.league, game_id: String(g.bdl_game_id), ...fresh })),
    wire: games.map(g => ({ league: g.league, ...fresh })), pulse: [],
    picks: [], weekly: [], results: [], nflResults: [], recaps: [],
  };
}
const check = (report, id) => report.checks.find(c => c.id === id);

describe('morning output health', () => {
  it('does not alarm for pregame picks, and applies ET date across UTC midnight', () => {
    const report = evaluateMorningHealth({ date, now, data: snapshot() });
    expect(check(report, 'picks:MLB').status).toBe('pending');
    expect(report.status).toBe('ok');
    expect(etDate('2026-09-06T02:10:00Z')).toBe(date);
    expect(dateBefore('2026-03-09')).toBe('2026-03-08');
  });
  it('cannot hide missing college coverage behind fresh MLB rows', () => {
    const data = snapshot([game(1), game(2, 'NCAAF', '2026-09-05T12:00:00Z')]);
    data.insights = data.insights.filter(r => r.league === 'MLB');
    data.cards = data.cards.filter(r => r.league === 'MLB');
    const report = evaluateMorningHealth({ date, now, data });
    expect(check(report, 'insights:MLB').status).toBe('ok');
    expect(check(report, 'insights:NCAAF').status).toBe('fail');
    expect(check(report, 'cards:NCAAF')).toMatchObject({ status: 'fail', missing_game_ids: [2] });
  });
  it('reports partial later coverage before the two-hour deadline and then fails it when due', () => {
    const data = snapshot([game(1, 'NCAAF'), game(2, 'NCAAF')]);
    data.cards = [data.cards[0]];
    expect(check(evaluateMorningHealth({ date, now, data }), 'cards:NCAAF').status).toBe('warn');
    expect(check(evaluateMorningHealth({ date, now: '2026-09-05T19:00:00Z', data }), 'cards:NCAAF').status).toBe('fail');
  });
  it('requires both teams for newly marked college packs and never trusts stale complete markers', () => {
    const data = snapshot([game(2, 'NCAAF', '2026-09-05T12:00:00Z')]);
    data.cards = [1, 2].map(team => ({ ...data.cards[0], payload: { card_build: { version: 1, built_at: fresh.created_at, team_id: String(team), game_complete: true } } }));
    expect(check(evaluateMorningHealth({ date, now, data }), 'cards:NCAAF').status).toBe('ok');
    data.cards.push({ ...data.cards[0], payload: { card_build: { version: 1, built_at: '2026-09-05T10:30:00Z', team_id: '1', game_complete: false } } });
    expect(check(evaluateMorningHealth({ date, now, data }), 'cards:NCAAF').status).toBe('fail');
  });
  it('checks exact board identity, rather than accepting a matching row count', () => {
    const data = snapshot();
    data.board[0].board = [game(99)];
    expect(check(evaluateMorningHealth({ date, now, data }), 'board')).toMatchObject({ status: 'fail', missing_game_ids: [1] });
  });
  it('never treats a read error as a quiet or healthy day', () => {
    const report = evaluateMorningHealth({ date, now, data: snapshot(), errors: { cards: 'HTTP 403' } });
    expect(report.status).toBe('fail');
    expect(check(report, 'read:cards').evidence).toBe('HTTP 403');
    expect(check(report, 'cards:MLB')).toBeUndefined();
  });
  it('accepts already settled results from before 2AM and keeps narrative gaps separate', () => {
    const data = snapshot();
    data.picks = [{ date: '2026-09-04', picks: [{ league: 'MLB', game_id: 3, pick: 'A ML +110' }] }];
    data.results = [{ league: 'MLB', game_id: '3', pick_text: 'A ML +110', game_date: '2026-09-04', result: 'won', updated_at: '2026-09-05T03:00:00Z' }];
    const report = evaluateMorningHealth({ date, now, data });
    expect(check(report, 'results').status).toBe('ok');
    expect(check(report, 'recaps').status).toBe('warn');
    data.results[0].pick_text = 'A -1.5 +110';
    expect(check(evaluateMorningHealth({ date, now, data }), 'results').status).toBe('warn');
    data.results[0].pick_text = 'A ML +110';
    data.results[0].result = 'unrecognized';
    expect(check(evaluateMorningHealth({ date, now, data }), 'results').status).toBe('warn');
  });
  it('reads weekly NFL picks for the exact ET game date', () => {
    const data = snapshot([game(2, 'NFL', '2026-09-05T10:00:00Z')]);
    data.weekly = [{ picks: [{ game_id: 2, pick: 'A -3', commence_time: '2026-09-05T10:00:00Z' }, { game_id: 9, pick: 'B -7', commence_time: '2026-09-06T17:00:00Z' }] }];
    expect(check(evaluateMorningHealth({ date, now, data }), 'picks:NFL').status).toBe('ok');
  });
  it('does not diagnose provider failure from a legitimate empty news feed', () => {
    const data = snapshot(); data.wire = [];
    expect(check(evaluateMorningHealth({ date, now, data }), 'wire:MLB').status).toBe('warn');
  });
});

describe('bounded health reads', () => {
  it('paginates beyond 500 cards and does not silently report partial coverage', async () => {
    const calls = [];
    const fetchImpl = async endpoint => {
      calls.push(endpoint);
      const cards = endpoint.pathname.endsWith('/player_insight_cards');
      const offset = Number(endpoint.searchParams.get('offset'));
      return { ok: true, json: async () => cards ? Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({ id: offset + i })) : [] };
    };
    const result = await loadMorningHealth({ url: 'https://example.test', key: 'test', date, fetchImpl });
    expect(result.data.cards).toHaveLength(501);
    expect(result.errors).toEqual({});
    expect(calls.every(url => url.searchParams.get('order')?.endsWith('.asc'))).toBe(true);
  });
  it('discards a partial table on a later failed page', async () => {
    const fetchImpl = async endpoint => {
      const cards = endpoint.pathname.endsWith('/player_insight_cards');
      if (cards && endpoint.searchParams.get('offset') === '500') return { ok: false, status: 503 };
      return { ok: true, json: async () => cards ? Array.from({ length: 500 }, () => ({})) : [] };
    };
    const result = await loadMorningHealth({ url: 'https://example.test', key: 'test', date, fetchImpl });
    expect(result.data.cards).toBeUndefined();
    expect(result.errors.cards).toMatch(/503/);
  });
  it('propagates the whole check deadline to active HTTP reads', async () => {
    const controller = new AbortController();
    const promise = loadMorningHealth({ url: 'https://example.test', key: 'test', date, signal: controller.signal,
      fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    });
    controller.abort(new Error('health deadline'));
    const result = await promise;
    expect(Object.keys(result.data)).toHaveLength(0);
    expect(Object.values(result.errors)).toEqual(Array(11).fill('health deadline'));
  });
});
