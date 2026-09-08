import { describe, expect, it, vi } from 'vitest';
import { buildHubJudgmentPackets, buildHubJudgmentPrompt, hubJudgmentSourceKey,
  synthesizeHubJudgments, validateHubJudgments, validateHubJudgmentBatch, hubJudgmentFingerprint } from '../../../src/services/insights/hubJudgment.js';

const asOf = '2026-09-08T16:00:00.000Z';
const game = { id: 10, date: '2026-09-08T23:00:00Z', status: 'Scheduled',
  home_team: { id: 2, name: 'Home Club', abbreviation: 'HOM' },
  visitor_team: { id: 1, name: 'Away Club', abbreviation: 'AWY' } };
function fixture() {
  const rows = [
    { category: 'starter_form', headline: 'Starter shortened his recent outings', detail: 'Existing Gary prose, preserved.',
      value: '4.0 IP', tone: 'bad', relevance_score: 80, player_id: 21, team_id: 2, game_id: 10,
      meta: { computed_detail: 'Home Starter has averaged 4.0 innings in 3 recent starts.', read: 'An older read.', average_ip: 4.0, games: 3 } },
    { category: 'bullpen_fatigue', headline: 'Home pen workload', detail: 'Home relief threw 13.2 IP across 3 games.',
      value: '13.2 IP', tone: 'bad', relevance_score: 20, team_id: 2, game_id: 10, meta: { relief_ip: 13.2, games: 3 } },
    { category: 'heat_check', headline: 'Away Batter form', detail: 'Away Batter has 8 hits in 20 AB.',
      value: '.400', tone: 'good', relevance_score: 70, player_id: 11, team_id: 1, game_id: 10, meta: {} },
  ];
  const context = { complete: true, evidence: [{ id: 'current_context', source_key: 'current_context|10||',
    game_id: '10', label: 'Current matchup', summary: 'Home Starter is probable. Both batting orders are posted.',
    source: 'Fixture observed context', as_of: asOf,
    facts: { home_pitcher: { name: 'Home Starter', player_id: '21', status: 'probable' }, away_pitcher: { name: 'Away Starter', player_id: '12', status: 'probable' } } }] };
  return { date: '2026-09-08', league: 'MLB', rows, games: [game], asOf, contextByGame: new Map([['10', context]]) };
}
function response(packet, changes = {}) {
  return JSON.stringify({ judgments: [{ game_id: packet.game.id, primary_evidence_id: packet.evidence[0].id,
    take: 'Home may need an earlier bridge to its relief staff',
    explanation: 'The starter’s recent length and the relief workload make the handoff worth watching.',
    full_case: 'The recent starting workload and the relief workload have to be read together. The published orders locate that question in today’s matchup; they do not settle how long the starter will last.',
    counterargument: 'A longer start could reduce the need for early relief. That is a possibility, not a confirmed plan.',
    watch_for: 'Watch whether the starter’s assignment changes before first pitch.',
    critical_condition: 'The listed starter remains probable.', what_changed: null,
    horizon: 'pregame', prominence: 'standard',
    supporting_evidence_ids: [packet.evidence[0].id, packet.evidence[1].id, 'current_context'], counter_evidence_ids: [], ...changes }] });
}
const options = { now: () => asOf };

describe('Hub connected evidence packets', () => {
  it('retains counterevidence below the display relevance floor and fences out other games, teams, leagues and future lanes', () => {
    const args = fixture();
    args.rows.push(...[
      { ...args.rows[0], game_id: 11 }, { ...args.rows[0], team_id: 99 },
      { ...args.rows[0], league: 'NFL' }, { ...args.rows[0], date: '2026-09-07' },
      { ...args.rows[0], category: 'regression_tomorrow', meta: { day: 'tomorrow' } },
      { ...args.rows[0], category: 'gary_hr_threats' },
    ]);
    const [packet] = buildHubJudgmentPackets(args);
    expect(packet.source_indices).toEqual([0, 1, 2]);
    expect(packet.evidence[0].summary).toContain('averaged 4.0');
    expect(JSON.stringify(packet.evidence)).not.toContain('An older read');
    expect(packet.evidence[1].facts.relief_ip).toBe(13.2);
  });

  it('keeps doubleheaders separate and never infers midnight, pregame from past clock, or future context from a final status', () => {
    const args = fixture();
    args.games.push({ ...game, id: 11 }, { ...game, id: 12, date: '2026-09-08' },
      { ...game, id: 13, date: '2026-09-08T15:00:00Z' }, { ...game, id: 14, status: 'Final' });
    args.rows.push(...args.games.slice(1).map(g => ({ ...args.rows[0], game_id: g.id })));
    expect(buildHubJudgmentPackets(args).map(packet => packet.game.id)).toEqual(['10', '11']);
    expect(hubJudgmentSourceKey(args.rows[0])).toBe('starter_form|10|21|2');
  });

  it('fingerprints measured evidence and current pitchers, excluding collection clocks and input order', () => {
    const first = fixture(), second = fixture();
    first.rows[0].meta.computed_as_of = first.rows[0].meta.source_collected_at = asOf;
    second.rows[0].meta.computed_as_of = second.rows[0].meta.source_collected_at = '2026-09-08T16:15:00Z';
    second.rows.reverse(); second.asOf = '2026-09-08T16:15:00Z';
    second.contextByGame.get('10').evidence[0].as_of = second.asOf;
    const fingerprint = buildHubJudgmentPackets(first)[0].input_fingerprint;
    expect(buildHubJudgmentPackets(second)[0].input_fingerprint).toBe(fingerprint);
    second.contextByGame.get('10').evidence[0].facts.home_pitcher.player_id = '22';
    expect(buildHubJudgmentPackets(second)[0].input_fingerprint).not.toBe(fingerprint);
  });

  it('uses the actual NBA datetime when the provider also supplies a date-only calendar label', () => {
    const args = fixture(); args.league = 'NBA';
    args.games = [{ ...game, date: '2026-09-08', datetime: '2026-09-08T23:00:00.000Z' }];
    expect(buildHubJudgmentPackets(args)[0].game.start_at).toBe('2026-09-08T23:00:00.000Z');
    delete args.games[0].datetime;
    expect(buildHubJudgmentPackets(args)).toEqual([]);
  });

  it('asks for a supported interpretation, opposing case, current context and optional abstention', () => {
    const prompt = buildHubJudgmentPrompt(buildHubJudgmentPackets(fixture()));
    expect(prompt).toContain('You may return no judgment');
    expect(prompt).toContain('Current lineup/pitcher context overrides');
    expect(prompt).toContain('counterargument');
    expect(prompt).not.toContain('An older read');
  });
  it('preserves an older source observation clock and never treats generated prose as measured evidence', () => {
    const args = fixture();
    args.rows[2].created_at = '2026-09-08T11:00:00Z';
    args.rows[2].detail = 'An unsupported model statement about 99 home runs.';
    args.rows[2].meta.evidence = 'A second unsupported model statement.';
    const evidence = buildHubJudgmentPackets(args)[0].evidence[2];
    expect(evidence.as_of).toBe('2026-09-08T11:00:00.000Z');
    expect(JSON.stringify(evidence)).not.toContain('unsupported');
  });
  it('admits only verified regular-season MLB matchup history and ignores derived eligibility when hashing evidence', () => {
    const args = fixture(); args.rows.push({ ...args.rows[0], category: 'head_to_head', meta: {} });
    expect(buildHubJudgmentPackets(args)[0].source_indices).toEqual([0, 1, 2]);
    args.rows[3].meta.season_type = 'regular';
    const packet = buildHubJudgmentPackets(args)[0];
    expect(packet.source_indices).toEqual([0, 1, 2, 3]);
    const fingerprint = packet.input_fingerprint;
    packet.evidence.forEach(entry => { delete entry.primary_eligible; });
    expect(hubJudgmentFingerprint(packet)).toBe(fingerprint);
  });
});

describe('Hub structured judgment validation', () => {
  it('keeps practice reports citeable without letting a module or retired fantasy row become the main story', () => {
    const args = fixture();
    args.rows.push({ ...args.rows[0], category: 'practice_report' }, { ...args.rows[0], category: 'closerWatch' },
      { ...args.rows[0], category: 'cutList' }, { ...args.rows[0], category: 'fantasy_pickup' });
    const packets = buildHubJudgmentPackets(args), practice = packets[0].evidence.find(e => e.category === 'practice_report');
    expect(packets[0].source_indices).toEqual([0, 1, 2, 3]);
    expect(practice.primary_eligible).toBe(false);
    expect(() => validateHubJudgments(response(packets[0], { primary_evidence_id: practice.id }), packets, { now: asOf })).toThrow('eligible');
    expect(() => validateHubJudgments(response(packets[0], { supporting_evidence_ids: [packets[0].evidence[0].id, practice.id, 'current_context'] }), packets, { now: asOf })).not.toThrow();
    args.rows = args.rows.slice(3);
    expect(buildHubJudgmentPackets(args)).toEqual([]);
  });
  it('preserves the complete argument, citations, identities, condition and bounded pregame validity', () => {
    const packets = buildHubJudgmentPackets(fixture());
    const [{ source_index, judgment }] = validateHubJudgments(response(packets[0]), packets, { now: asOf });
    expect(source_index).toBe(0);
    expect(judgment).toMatchObject({ date: '2026-09-08', league: 'mlb', game_id: '10', status: 'ready',
      valid_until: '2026-09-08T22:00:00.000Z', critical_condition: 'The listed starter remains probable.' });
    expect(judgment.evidence).toHaveLength(3);
    expect(judgment.full_case).toContain('they do not settle');
    expect(judgment.evidence_state).toHaveLength(4);
  });
  it.each([
    { game_id: '99' }, { primary_evidence_id: 'current_context' },
    { supporting_evidence_ids: ['invented', 'current_context'] },
    { horizon: 'week' }, { prominence: 'lock' }, { explanation: 'An uncited 99.99% chance.' },
    { what_changed: 'The starter was replaced.' }, { take: 'x'.repeat(151) },
  ])('rejects invalid claim/contract %j', change => {
    const packets = buildHubJudgmentPackets(fixture());
    expect(() => validateHubJudgments(response(packets[0], change), packets, { now: asOf })).toThrow();
  });
  it('rejects expired analysis, duplicate games, and omitted current context', () => {
    const packets = buildHubJudgmentPackets(fixture()), raw = response(packets[0]);
    expect(() => validateHubJudgments(raw, packets, { now: '2026-09-09T00:00:00Z' })).toThrow('expired');
    const value = JSON.parse(raw); value.judgments.push(value.judgments[0]);
    expect(() => validateHubJudgments(JSON.stringify(value), packets, { now: asOf })).toThrow();
    expect(() => validateHubJudgments(response(packets[0], { supporting_evidence_ids: packets[0].evidence.slice(0, 2).map(e => e.id) }), packets, { now: asOf })).toThrow('current matchup');
  });
  it('does not license a fabricated statistic using a player/team/game identity or a source date', () => {
    const args = fixture(); args.rows[0].player_id = 998877;
    args.contextByGame.get('10').evidence[0].facts.home_pitcher.player_id = '998877';
    const packets = buildHubJudgmentPackets(args);
    for (const take of ['The hitter has 998877 home runs.', 'The hitter has 2026 home runs.', 'The hitter has 10 home runs.']) {
      expect(() => validateHubJudgments(response(packets[0], { take }), packets, { now: asOf })).toThrow('uncited numbers');
    }
  });
});

describe('Hub prepared display measurements', () => {
  it('accepts a cited prepared number without licensing arbitrary rounding', () => {
    const args = fixture();
    args.contextByGame.get('10').evidence[0].facts.home_pitcher.season_baseline = {
      pitching_era: 3.2004, display_measurements: { pitching_era: '3.20' },
    };
    const packets = buildHubJudgmentPackets(args);
    expect(() => validateHubJudgments(response(packets[0], { explanation: 'The starter has a 3.20 season ERA.' }), packets, { now: asOf })).not.toThrow();
    expect(() => validateHubJudgments(response(packets[0], { explanation: 'The starter has a 3.201 season ERA.' }), packets, { now: asOf })).toThrow('uncited numbers');
  });
});

describe('Hub generation, reuse and safe invalidation', () => {
  it('bounds non-MLB availability judgments to the immutable observation clock in generation and schedule-only reuse', async () => {
    const args = fixture(); args.league = 'NFL'; args.rows[0].category = 'injury';
    args.rows[0].id = 'stored-injury'; args.rows[0].created_at = '2026-09-08T13:00:00Z';
    let packet = buildHubJudgmentPackets(args)[0];
    const first = await synthesizeHubJudgments(args, { ...options, generateText: async () => response(packet) });
    expect(first.rows[0].meta.judgment.valid_until).toBe('2026-09-08T19:00:00.000Z');
    args.previousRows = first.rows; args.asOf = '2026-09-08T17:00:00Z';
    args.rows[0].updated_at = args.rows[0].meta.updated_at = args.asOf;
    const model = vi.fn(async () => response(buildHubJudgmentPackets(args)[0]));
    const later = await synthesizeHubJudgments(args, { now: () => args.asOf, generateText: model });
    expect(model).not.toHaveBeenCalled();
    expect(later.rows[0].meta.judgment.valid_until).toBe('2026-09-08T19:00:00.000Z');
    packet = buildHubJudgmentPackets(args)[0];
    expect(() => validateHubJudgments(response(packet), [packet], { now: '2026-09-08T19:00:01Z' })).toThrow('expired');
    args.previousRows = later.rows; args.asOf = '2026-09-08T19:00:00Z'; model.mockClear();
    const expired = await synthesizeHubJudgments(args, { now: () => args.asOf, generateText: model });
    expect(model).not.toHaveBeenCalled(); expect(expired.rows[0].meta.judgment).toBeUndefined();
    expect(expired.invalidations[0].status).toBe('context_unavailable');
    expect(expired.invalidations[0].full_case).toBe(first.rows[0].meta.judgment.full_case);
    expect(buildHubJudgmentPackets(args)[0].limitations.join(' ')).toContain('Fresh availability context is missing');
  });
  it('requires a known availability observation clock; only a real new collector timestamp can extend that deadline', () => {
    const args = fixture(); args.league = 'NCAAF'; args.rows[0].category = 'quarterback';
    expect(buildHubJudgmentPackets(args)[0].context_complete).toBe(false);
    args.rows[0].meta.source_collected_at = '2026-09-08T13:00:00Z';
    const before = buildHubJudgmentPackets(args)[0];
    expect(before.source_valid_until).toBe('2026-09-08T19:00:00.000Z');
    args.rows[0].meta.source_collected_at = '2026-09-08T15:00:00Z';
    const after = buildHubJudgmentPackets(args)[0];
    expect(after.source_valid_until).toBe('2026-09-08T21:00:00.000Z');
    expect(after.input_fingerprint).toBe(before.input_fingerprint);
  });
  async function prior() {
    const args = fixture(), packets = buildHubJudgmentPackets(args);
    return synthesizeHubJudgments(args, { ...options, generateText: async () => response(packets[0]) });
  }
  it('adds metadata without rewriting original prose, numeric fields, tone or source metadata', async () => {
    const args = fixture(), before = JSON.parse(JSON.stringify(args.rows)), packets = buildHubJudgmentPackets(args);
    const result = await synthesizeHubJudgments(args, { ...options, generateText: async () => response(packets[0]) });
    const source = result.rows.map(row => { const clone = JSON.parse(JSON.stringify(row)); delete clone.meta.judgment; return clone; });
    expect(source).toEqual(before); expect(args.rows).toEqual(before);
    expect(result.rows[0].meta.judgment.primary_source_key).toBe('starter_form|10|21|2');
    expect(result.failures).toEqual([]);
  });
  it('reuses unchanged evidence without another model call, renewing the checked window while retaining actual generation time', async () => {
    const previous = await prior(), args = fixture(), model = vi.fn();
    args.previousRows = previous.rows; args.asOf = '2026-09-08T16:15:00Z';
    args.contextByGame.get('10').evidence[0].as_of = args.asOf;
    const result = await synthesizeHubJudgments(args, { now: () => args.asOf, generateText: model });
    expect(model).not.toHaveBeenCalled();
    expect(result.rows[0].meta.judgment.valid_until).toBe('2026-09-08T22:15:00.000Z');
    expect(result.rows[0].meta.judgment.generated_at).toBe(asOf);
    expect(result.invalidations).toEqual([]);
  });
  it('invalidates an old argument when changed evidence yields no new useful call', async () => {
    const previous = await prior(), args = fixture(); args.previousRows = previous.rows;
    args.contextByGame.get('10').evidence[0].facts.home_pitcher.player_id = '22';
    const result = await synthesizeHubJudgments(args, { ...options, generateText: async () => '{"judgments":[]}' });
    expect(result.invalidations[0]).toMatchObject({ status: 'context_changed', valid_until: asOf });
    expect(result.invalidations[0].full_case).toBe(previous.rows[0].meta.judgment.full_case);
    expect(result.rows.every(row => !row.meta.judgment)).toBe(true);
  });
  it('does not renew a prior judgment after incomplete context or a source row disappears', async () => {
    const previous = await prior(), args = fixture(), model = vi.fn(); args.previousRows = previous.rows;
    args.rows = args.rows.slice(1); args.contextByGame.get('10').complete = false;
    const result = await synthesizeHubJudgments(args, { ...options, generateText: model });
    expect(model).not.toHaveBeenCalled();
    expect(result.invalidations[0]).toMatchObject({ status: 'context_unavailable', game_id: '10', primary_source_key: 'starter_form|10|21|2' });
  });
  it('does not silently renew a full-context argument after a collector throws; successful empty lanes are not failures', async () => {
    const previous = await prior(), args = fixture(), model = vi.fn(); args.previousRows = previous.rows;
    args.collectorFailures = [{ computer: 'computeFootballAvailability', message: 'not included in model data' }];
    const packet = buildHubJudgmentPackets(args)[0];
    expect(packet.context_complete).toBe(false); expect(packet.limitations.join(' ')).toContain('computeFootballAvailability');
    const result = await synthesizeHubJudgments(args, { ...options, generateText: model });
    expect(model).not.toHaveBeenCalled(); expect(result.invalidations[0].status).toBe('context_unavailable');
    args.collectorFailures = [];
    expect(buildHubJudgmentPackets(args)[0].context_complete).toBe(true);
  });
  it('invalidates the former source anchor when Gary selects another subject', async () => {
    const previous = await prior(), args = fixture(); args.previousRows = previous.rows;
    args.rows[1].meta.relief_ip = 15; args.rows[1].detail = 'Home relief threw 15 IP across 3 games.';
    const packets = buildHubJudgmentPackets(args);
    const result = await synthesizeHubJudgments(args, { ...options, generateText: async () => response(packets[0], { primary_evidence_id: packets[0].evidence[1].id }) });
    expect(result.rows[1].meta.judgment.primary_source_key).toBe('bullpen_fatigue|10||2');
    expect(result.invalidations[0]).toMatchObject({ status: 'superseded', primary_source_key: 'starter_form|10|21|2' });
  });
  it('permits a measured change only with preserved previous and current cited observations', async () => {
    const previous = await prior(), args = fixture(); args.previousRows = previous.rows;
    args.rows[1].meta.relief_ip = 15; args.rows[1].value = '15 IP';
    const packets = buildHubJudgmentPackets(args), change = packets[0].evidence.find(entry => entry.category === 'change_context');
    expect(change.facts.previous.facts.relief_ip).toBe(13.2);
    const item = JSON.parse(response(packets[0])).judgments[0];
    item.what_changed = 'The reported relief workload changed from 13.2 to 15 innings.';
    item.supporting_evidence_ids.push(change.id);
    const result = validateHubJudgments(JSON.stringify({ judgments: [item] }), packets, { now: asOf });
    expect(result[0].judgment.what_changed).toContain('13.2 to 15');
  });
  it('repairs one invalid response, and deadline aborts even a misbehaving transport', async () => {
    const args = fixture(), packets = buildHubJudgmentPackets(args);
    const model = vi.fn().mockResolvedValueOnce('{"judgments":[{}]}').mockResolvedValueOnce(response(packets[0]));
    expect((await synthesizeHubJudgments(args, { ...options, generateText: model })).failures).toEqual([]);
    expect(model).toHaveBeenCalledTimes(2);
    const hung = vi.fn(async () => new Promise(() => {}));
    const result = await synthesizeHubJudgments(args, { ...options, generateText: hung, budgetMs: 15 });
    expect(result.failures[0].message).toContain('deadline'); expect(hung).toHaveBeenCalledTimes(1);
  });
});

describe('Hub partial batch acceptance', () => {
  function twoGames() {
    const args = fixture();
    args.games.push({ ...game, id: 11 });
    args.rows.push(...args.rows.map(row => ({ ...row, game_id: 11 })));
    const context = JSON.parse(JSON.stringify(args.contextByGame.get('10')));
    context.evidence[0].game_id = '11'; context.evidence[0].source_key = 'current_context|11||';
    args.contextByGame.set('11', context);
    return args;
  }
  const combined = (...values) => JSON.stringify({ judgments: values.flatMap(value => JSON.parse(value).judgments) });
  it('retains a valid sibling and repairs only the failed game with its exact validation reason', async () => {
    const args = twoGames(), packets = buildHubJudgmentPackets(args);
    const model = vi.fn().mockResolvedValueOnce(combined(response(packets[0]), response(packets[1], { explanation: 'An invented 99.99% claim.' })))
      .mockResolvedValueOnce(response(packets[1]));
    const result = await synthesizeHubJudgments(args, { ...options, generateText: model });
    expect(result.rows.filter(row => row.meta.judgment)).toHaveLength(2);
    expect(result.failures).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ accepted: 1, validation_errors: [{ game_id: '11', message: expect.stringContaining('uncited numbers') }] });
    expect(model.mock.calls[1][0]).toContain('99.99');
    expect(model.mock.calls[1][0]).not.toContain('"game_id":"10"');
  });
  it('keeps accepted games when the repair transport hits the deadline', async () => {
    const args = twoGames(), packets = buildHubJudgmentPackets(args);
    const model = vi.fn().mockResolvedValueOnce(combined(response(packets[0]), response(packets[1], { explanation: 'An invented 99.99% claim.' })))
      .mockImplementationOnce(async () => new Promise(() => {}));
    const result = await synthesizeHubJudgments(args, { ...options, generateText: model, budgetMs: 15 });
    expect(result.rows.filter(row => row.meta.judgment).map(row => row.meta.judgment.game_id)).toEqual(['10']);
    expect(result.failures).toEqual([{ game_id: '11', message: expect.stringContaining('deadline') }]);
  });
  it('treats valid omissions as abstention, duplicates as game-specific failures, and malformed roots as failures', async () => {
    const args = twoGames(), packets = buildHubJudgmentPackets(args), model = vi.fn(async () => response(packets[0]));
    const result = await synthesizeHubJudgments(args, { ...options, generateText: model });
    expect(model).toHaveBeenCalledTimes(1); expect(result.skipped).toContainEqual({ game_id: '11', reason: 'no_useful_judgment' });
    const duplicate = validateHubJudgmentBatch(combined(response(packets[0]), response(packets[0]), response(packets[1])), packets, { now: asOf });
    expect(duplicate.accepted.map(item => item.judgment.game_id)).toEqual(['11']);
    expect(duplicate.failed).toEqual([{ game_id: '10', message: 'Repeated Hub game argument' }]);
    expect(() => validateHubJudgmentBatch('{"judgments":null}', packets, { now: asOf })).toThrow();
    expect(() => validateHubJudgmentBatch('{malformed', packets, { now: asOf })).toThrow();
  });
});
