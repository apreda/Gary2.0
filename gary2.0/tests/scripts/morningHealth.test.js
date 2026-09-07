import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dateBefore, etDate, evaluateMorningHealth, loadMorningHealth, applyContentStageHistory, finalPickRetryMinutes } from '../../scripts/lib/morningHealth.js';

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
  it.each([null, undefined, '', '  ', [], '[]'])('keeps a genuine absent payload pending before the final retry window: %j', picks => {
    const data = snapshot(); data.picks = [{ date, picks }];
    const report = evaluateMorningHealth({ date, now, data });
    expect(check(report, 'picks:MLB').status).toBe('pending');
    expect(report.status).toBe('ok');
  });
  it.each(['[broken', '{}', 'null', 42, [null], [[]], [{}], [{ pick: '' }], [{ pick: '  ' }], [{ pick: {} }], [{ pick: 42 }], [{ pick: 'PENDING' }], [{ pick: 'PASS' }]])('fails corrupt stored game data before kickoff instead of reporting a pending empty board: %j', picks => {
    const data = snapshot(); data.picks = [{ date, picks }];
    const report = evaluateMorningHealth({ date, now, data });
    expect(report.status).toBe('fail');
    expect(check(report, 'integrity:picks').status).toBe('fail');
    expect(check(report, 'picks:MLB')).toBeUndefined();
    expect(check(report, 'results')).toBeUndefined();
  });
  it('accepts serialized arrays for both daily and weekly storage and preserves exact game/date checks', () => {
    const data = snapshot([game(1, 'MLB', '2026-09-05T10:00:00Z'), game(2, 'NFL', '2026-09-05T10:00:00Z')]);
    data.picks = [{ date, picks: JSON.stringify([{ league: 'MLB', game_id: 1, pick: 'A ML +110' }]) }];
    data.weekly = [{ picks: JSON.stringify([{ game_id: 2, pick: 'B -3', commence_time: '2026-09-05T10:00:00Z' }]) }];
    const report = evaluateMorningHealth({ date, now, data });
    expect(check(report, 'picks:MLB').status).toBe('ok');
    expect(check(report, 'picks:NFL').status).toBe('ok');
    data.weekly[0].picks = JSON.stringify([{ game_id: 2, pick: 'B -3', commence_time: '2026-09-06T10:00:00Z' }]);
    expect(check(evaluateMorningHealth({ date, now, data }), 'picks:NFL').status).toBe('fail');
  });
  it('never counts props as a published game or as an expected game-result grade', () => {
    const data = snapshot([game(1, 'MLB', '2026-09-05T10:00:00Z')]);
    const picks = [{ league: 'MLB', game_id: 1, pick: 'Player over 1.5', type: 'prop' }, { league: 'MLB', game_id: 1, pick: 'Player under 2.5', pickType: 'PROP' }];
    data.picks = [{ date, picks }, { date: '2026-09-04', picks }];
    const report = evaluateMorningHealth({ date, now, data });
    expect(check(report, 'picks:MLB')).toMatchObject({ status: 'fail', missing_started_game_ids: [1] });
    expect(check(report, 'results')).toMatchObject({ status: 'ok', missing_game_ids: [] });
    expect(check(report, 'integrity:picks')).toBeUndefined();
  });
  it('cannot hide malformed yesterday or weekly data behind zero missing grades', () => {
    for (const source of ['picks', 'weekly']) {
      const data = snapshot([game(2, 'NFL', '2026-09-05T10:00:00Z')]);
      data[source] = [{ date: '2026-09-04', picks: '[broken' }];
      const report = evaluateMorningHealth({ date, now, data });
      expect(report.status).toBe('fail');
      expect(check(report, `integrity:${source}`).status).toBe('fail');
      expect(check(report, 'picks:NFL')).toBeUndefined();
      expect(check(report, 'results')).toBeUndefined();
    }
  });
  it.each([['MLB', 15], ['NBA', 15], ['NFL', 30], ['NCAAF', 30]])('warns for a missing %s pick only when its final retry window begins', (league, minutes) => {
    const kickoff = '2026-09-05T12:00:00Z';
    const data = snapshot([game(1, league, kickoff)]);
    const start = Date.parse(kickoff);
    const before = evaluateMorningHealth({ date, now: start - minutes * 60_000 - 1, data });
    expect(check(before, `picks:${league}`).status).toBe('pending');
    const finalWindow = evaluateMorningHealth({ date, now: start - minutes * 60_000, data });
    expect(check(finalWindow, `picks:${league}`)).toMatchObject({ status: 'warn', missing_final_window_game_ids: [1], missing_started_game_ids: [] });
    const started = evaluateMorningHealth({ date, now: start, data });
    expect(check(started, `picks:${league}`)).toMatchObject({ status: 'fail', missing_started_game_ids: [1], missing_final_window_game_ids: [] });
  });
  it('keeps the health warning aligned with the scheduler final retry constants', () => {
    const scheduler = readFileSync(new URL('../../scripts/scheduler.js', import.meta.url), 'utf8');
    for (const [name, league] of [['RETRY_LEAD_TIMES_MINUTES', 'MLB'], ['FOOTBALL_RETRY_LEAD_TIMES_MINUTES', 'NFL']]) {
      const values = scheduler.match(new RegExp(`const ${name} = (\\[[^\\]]+\\]);`));
      expect(values, `${name} must remain visible to the health deadline contract`).not.toBeNull();
      expect(finalPickRetryMinutes(league)).toBe(JSON.parse(values[1]).at(-1));
    }
  });
});

describe('recovered stage history', () => {
  const end = (stage, status, at = '2026-09-05T10:30:00Z', day = date) => ({ date: day, event: 'stage-end', stage, status, at });
  const overnight = end('overnight-football-cards', 'failed', '2026-09-05T06:30:00Z');
  const recovery = [end('nfl-cards', 'ok'), end('ncaaf-cards', 'ok')];
  const report = () => evaluateMorningHealth({ date, now, data: snapshot() });
  it('records an overnight failure as recovered only after both daytime stages succeed', () => {
    const output = applyContentStageHistory(report(), [overnight, ...recovery]);
    expect(output.status).toBe('ok');
    expect(output.stages[0]).toMatchObject({ status: 'failed', recovered_by: [{ stage: 'nfl-cards' }, { stage: 'ncaaf-cards' }] });
    expect(check(output, 'content-recovered').evidence).toContain('failed at');
    expect(applyContentStageHistory(report(), [overnight, recovery[0]]).status).toBe('fail');
  });
  it('does not hide an active card failure or an unreadable table behind stage exit codes', () => {
    for (const issue of [{ id: 'cards:NCAAF', status: 'fail' }, { id: 'cards:NFL', status: 'warn' }, { id: 'read:cards', status: 'fail' }]) {
      const output = report(); output.checks.push(issue);
      applyContentStageHistory(output, [overnight, ...recovery]);
      expect(output.status).toBe('fail');
      expect(output.stages[0].recovered_by).toBeUndefined();
    }
  });
  it('keeps an overnight failure recovered when complete cards age later that day', () => {
    const lateNow = '2026-09-05T20:00:00Z';
    const data = snapshot([game(2, 'NCAAF', '2026-09-05T23:00:00Z')]);
    data.board[0].updated_at = lateNow;
    data.insights[0].created_at = lateNow;
    data.wire[0].created_at = lateNow;
    data.pulse = [{ league: 'NCAAF', created_at: lateNow }];
    data.cards = [1, 2].map(team => ({ ...data.cards[0], payload: { card_build: {
      version: 1, built_at: fresh.created_at, team_id: String(team), game_complete: true,
    } } }));

    const output = evaluateMorningHealth({ date, now: lateNow, data });
    expect(check(output, 'cards:NCAAF')).toMatchObject({ status: 'warn', coverage_complete: true });
    applyContentStageHistory(output, [overnight, ...recovery]);
    expect(output.status).toBe('warn');
    expect(output.stages[0].recovered_by).toHaveLength(2);
    expect(check(output, 'content-stages')).toBeUndefined();
    expect(check(output, 'cards:NCAAF').evidence).toContain('No card updated within 8h');

    // A subsequent partial build is a real coverage regression, even before
    // the game's final card deadline; stage exits cannot establish recovery.
    data.cards.push({ ...data.cards[0], created_at: lateNow, payload: { card_build: {
      version: 1, built_at: lateNow, team_id: '1', game_complete: false,
    } } });
    const incomplete = evaluateMorningHealth({ date, now: lateNow, data });
    expect(check(incomplete, 'cards:NCAAF')).toMatchObject({ status: 'warn', coverage_complete: false, incomplete_game_ids: [2] });
    applyContentStageHistory(incomplete, [overnight, ...recovery]);
    expect(incomplete.status).toBe('fail');
    expect(incomplete.stages[0].recovered_by).toBeUndefined();
  });
  it('ignores old-day and future successes and uses event timestamps when writes arrive out of order', () => {
    const rows = [overnight, ...recovery,
      end('ncaaf-cards', 'failed', '2026-09-05T10:45:00Z'),
      end('ncaaf-cards', 'ok', '2026-09-05T10:40:00Z'),
      end('ncaaf-cards', 'ok', '2026-09-05T12:00:00Z'),
      end('ncaaf-cards', 'ok', '2026-09-05T10:59:00Z', '2026-09-04')];
    expect(applyContentStageHistory(report(), rows).status).toBe('fail');
  });
  it('allows a later subject-card completion to recover the same college card build', () => {
    const output = applyContentStageHistory(report(), [end('ncaaf-cards', 'timeout', '2026-09-05T10:00:00Z'), end('ncaaf-card-subjects', 'ok')]);
    expect(output.status).toBe('ok');
    expect(output.stages[0].recovered_by[0].stage).toBe('ncaaf-card-subjects');
  });
  it('never lets a successful health-check stage clear a failed writer', () => {
    expect(applyContentStageHistory(report(), [end('board', 'failed'), end('morning-health', 'ok')]).status).toBe('fail');
  });
});

describe('frozen current-day college rankings', () => {
  const lateNow = '2026-09-05T21:00:00Z';
  const oldPublication = '2026-09-05T10:07:00Z';
  function frozenSnapshot() {
    const data = snapshot([game(2, 'NCAAF', '2026-09-05T23:00:00Z')]);
    data.board[0].updated_at = lateNow;
    data.cards[0].created_at = lateNow;
    data.wire[0].created_at = lateNow;
    data.insights = [{ date, league: 'NCAAF', game_id: '2', category: 'situational',
      source: 'balldontlie_ncaaf_rankings', created_at: oldPublication, updated_at: oldPublication }];
    data.pulse = [{ date, league: 'NCAAF', tab: 'rankings', updated_at: '2026-09-05T20:39:46Z' }];
    const attempt = { date, stage: 'ncaaf-insights', run_id: 'daily-1630', attempt: 1 };
    const stageHistory = [
      { ...attempt, event: 'stage-start', at: '2026-09-05T20:39:34Z' },
      { ...attempt, event: 'stage-end', at: '2026-09-05T20:39:47Z', status: 'ok', exit_code: 0 },
    ];
    return { date, now: lateNow, data, stageHistory };
  }

  it('accepts the preserved AP row only with a recent completed owner and its refreshed rankings snapshot', () => {
    const input = frozenSnapshot();
    const originalData = structuredClone(input.data);
    const report = applyContentStageHistory(evaluateMorningHealth(input), input.stageHistory);
    expect(report.status).toBe('ok');
    expect(check(report, 'insights:NCAAF')).toMatchObject({ status: 'ok',
      freshness_basis: 'frozen_ranking_revalidated', revalidated_by: {
        stage: 'ncaaf-insights', run_id: 'daily-1630', completed_at: '2026-09-05T20:39:47Z',
        rankings_updated_at: '2026-09-05T20:39:46.000Z',
      } });
    expect(check(report, 'insights:NCAAF').evidence).toContain('Original story timestamps are unchanged');
    expect(input.data).toEqual(originalData);
    expect(check(evaluateMorningHealth({ ...input, stageHistory: [] }), 'insights:NCAAF').status).toBe('fail');
  });

  it.each([
    ['missing publication', input => { input.data.insights = []; }],
    ['volatile-only publication', input => { input.data.insights[0].category = 'quarterback'; }],
    ['a different situational source', input => { input.data.insights[0].source = 'other'; }],
    ['an undated publication', input => { delete input.data.insights[0].date; }],
    ['a previous-day publication', input => { input.data.insights[0].date = '2026-09-04'; }],
    ['a different slate game', input => { input.data.insights[0].game_id = '99'; }],
    ['an invalid publication timestamp', input => { input.data.insights[0].updated_at = 'invalid'; }],
    ['missing rankings', input => { input.data.pulse = []; }],
    ['another league pulse', input => { input.data.pulse[0].league = 'NFL'; }],
    ['another pulse tab', input => { input.data.pulse[0].tab = 'board'; }],
    ['a previous-day pulse', input => { input.data.pulse[0].date = '2026-09-04'; }],
    ['a stale rankings refresh', input => { input.data.pulse[0].updated_at = oldPublication; }],
    ['a fresh pulse predating the completed attempt', input => { input.data.pulse[0].updated_at = '2026-09-05T20:30:00Z'; }],
    ['a future rankings refresh', input => { input.data.pulse[0].updated_at = '2026-09-05T22:00:00Z'; }],
    ['an unsuccessful owner', input => { input.stageHistory[1].status = 'failed'; }],
    ['a nonzero owner exit', input => { input.stageHistory[1].exit_code = 1; }],
    ['a missing attempt start', input => { input.stageHistory.shift(); }],
    ['a different attempt start', input => { input.stageHistory[0].attempt = 2; }],
    ['a different run start', input => { input.stageHistory[0].run_id = 'another-run'; }],
    ['another owning stage', input => { input.stageHistory.forEach(row => { row.stage = 'nfl-insights'; }); }],
    ['previous-day stage history', input => { input.stageHistory.forEach(row => { row.date = '2026-09-04'; }); }],
    ['a future completion', input => { input.stageHistory[1].at = '2026-09-05T22:00:00Z'; }],
    ['a stale owner', input => {
      input.stageHistory[0].at = '2026-09-05T10:20:00Z';
      input.stageHistory[1].at = '2026-09-05T10:20:30Z';
      input.data.pulse[0].updated_at = '2026-09-05T10:20:20Z';
    }],
  ])('retains the freshness failure for %s', (_label, change) => {
    const input = frozenSnapshot(); change(input);
    const report = evaluateMorningHealth(input);
    expect(check(report, 'insights:NCAAF').status).toBe('fail');
    expect(check(report, 'insights:NCAAF').freshness_basis).toBeUndefined();
    expect(report.status).toBe('fail');
  });

  it('keeps the latest failed writer visible even when earlier success is logged later', () => {
    const input = frozenSnapshot();
    input.stageHistory.unshift({ ...input.stageHistory[1], run_id: 'later-attempt',
      at: '2026-09-05T20:50:00Z', status: 'timeout', exit_code: 124 });
    // Neither a future event nor another date can recover that latest failure.
    input.stageHistory.push({ ...input.stageHistory[2], at: '2026-09-05T22:00:00Z' });
    input.stageHistory.push({ ...input.stageHistory[2], date: '2026-09-04', at: '2026-09-05T20:59:00Z' });
    const report = applyContentStageHistory(evaluateMorningHealth(input), input.stageHistory);
    expect(check(report, 'insights:NCAAF').status).toBe('fail');
    expect(check(report, 'content-stages').evidence).toContain('ncaaf-insights: timeout');
  });

  it.each(['MLB', 'NFL'])('does not bypass %s insight freshness', league => {
    const input = frozenSnapshot();
    for (const rows of [input.data.slate, input.data.board[0].board, input.data.insights, input.data.cards, input.data.pulse]) {
      rows.forEach(row => { row.league = league; });
    }
    expect(check(evaluateMorningHealth(input), `insights:${league}`).status).toBe('fail');
  });

  it.each(['insights', 'pulse', 'slate'])('does not revalidate through an unreadable %s table', table => {
    const input = frozenSnapshot(); input.errors = { [table]: 'HTTP 503' };
    const report = evaluateMorningHealth(input);
    expect(report.status).toBe('fail');
    expect(check(report, `read:${table}`).status).toBe('fail');
    expect(check(report, 'insights:NCAAF')?.freshness_basis).toBeUndefined();
  });

  it('does not conceal an independent board failure or extend the configured freshness horizon', () => {
    const input = frozenSnapshot();
    input.data.board[0].updated_at = oldPublication;
    const report = evaluateMorningHealth(input);
    expect(check(report, 'insights:NCAAF').status).toBe('ok');
    expect(check(report, 'board').status).toBe('fail');
    expect(report.status).toBe('fail');
    expect(check(evaluateMorningHealth({ ...input, maxAgeHours: 0.1 }), 'insights:NCAAF').status).toBe('fail');
  });

  it('does not carry the frozen-publication exception across Eastern midnight', () => {
    const input = frozenSnapshot();
    input.now = '2026-09-06T04:01:00Z';
    // The owner and pulse are still less than eight hours old, but this is
    // yesterday's publication now, not a verified current-day Hub snapshot.
    expect(check(evaluateMorningHealth(input), 'insights:NCAAF').status).toBe('fail');
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
    expect(calls.find(url => url.pathname.endsWith('/insight_connections')).searchParams.get('select')).toContain('source:meta->>source');
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
