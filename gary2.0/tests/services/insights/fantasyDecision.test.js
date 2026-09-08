import { describe, expect, it, vi } from 'vitest';
import { buildFantasyPrompt, createFantasyBriefing, fantasyInputFingerprint, fantasyPromptEvidence, validateFantasyDecisions } from '../../../src/services/insights/fantasyDecision.js';

function facts(league = 'mlb') {
  return {
    date: '2026-09-07', league, as_of: '2026-09-07T16:00:00.000Z',
    window_start: '2026-09-07', window_end: '2026-09-13', coverage: { complete: true },
    candidates: [{ id: 'bdl:11', player_id: '11', player_name: 'Fixture Player', team: 'DET', position: 'SP', role: 'pitcher',
      context: { opportunities: [{ game_id: '101', start_at: '2026-09-07T22:00:00Z', lineup_status: 'confirmed' }], rostered_percent: null },
      limitations: ['League availability is unknown.'],
      evidence: [
        { id: 'lineup', label: 'Today', source: 'BDL', observed_at: '2026-09-07T16:00:00.000Z', facts: { batting_order: 3 } },
        { id: 'recent', label: 'Last outings', source: 'BDL', facts: { strikeouts: 12, games: 2 } },
      ] }],
  };
}

function answer(overrides = {}) {
  return JSON.stringify({ decisions: [{ candidate_id: 'bdl:11', action: 'START', horizon: 'next_game',
    headline: 'Consider the start for strikeout help',
    why_now: 'The scheduled opportunity puts the recent strikeouts in play today.',
    fit: 'Managers needing strikeouts can consider this start.',
    risk: 'The limited recent sample leaves uncertainty.',
    watch_for: 'Check the posted starter before the game.',
    evidence_ids: ['lineup', 'recent'], formats: ['categories'], categories: ['strikeouts'], ...overrides }] });
}

describe('Fantasy decisions from dated evidence', () => {
  it('attaches original evidence and identity instead of accepting model-written facts', async () => {
    const evidence = facts();
    const generateText = vi.fn().mockResolvedValue(answer());
    const result = await createFantasyBriefing(evidence, { generateText, now: new Date('2026-09-07T16:05:00Z') });
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].player_name).toBe('Fixture Player');
    expect(result.decisions[0].evidence).toEqual(evidence.candidates[0].evidence);
    expect(result.decisions[0].availability.league_available).toBeNull();
    expect(result.expires_at).toBe('2026-09-07T19:00:00.000Z');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('permits Gary to watch a player rather than justify a predetermined add', () => {
    const result = validateFantasyDecisions(answer({ action: 'WATCH', evidence_ids: ['lineup'] }), facts());
    expect(result[0].action).toBe('WATCH');
    expect(buildFantasyPrompt(facts())).toContain('There is no supplied recommendation');
  });

  it.each([
    ['excluded metric', { why_now: 'His xERA makes this start appealing.' }],
    ['expected ERA alias', { why_now: 'His expected earned run average supports this start.' }],
    ['unknown player', { candidate_id: 'bdl:999' }],
    ['invented source', { evidence_ids: ['lineup', 'invented'] }],
    ['single source for a start', { evidence_ids: ['lineup'] }],
    ['invented number', { why_now: 'He has 87 strikeouts.' }],
    ['wrong scoring format', { formats: ['ppr'] }],
    ['clipped explanation', { why_now: 'The reason is…' }],
    ['unsupported certainty', { headline: 'A guaranteed win' }],
    ['oversized explanation', { why_now: 'word '.repeat(150) }],
  ])('rejects %s rather than publishing a partly trusted response', (_, changes) => {
    expect(() => validateFantasyDecisions(answer(changes), facts())).toThrow();
  });

  it('rejects duplicate decisions and truncated JSON', () => {
    const item = JSON.parse(answer()).decisions[0];
    expect(() => validateFantasyDecisions(JSON.stringify({ decisions: [item, item] }), facts())).toThrow(/duplicate/);
    expect(() => validateFantasyDecisions(answer().slice(0, -5), facts())).toThrow();
  });

  it('allows supplied numbers and calendar dates without inventing thresholds', () => {
    const result = validateFantasyDecisions(answer({ why_now: 'The September 7 opportunity follows 12 strikeouts in 2 games.' }), facts());
    expect(result).toHaveLength(1);
  });

  it('retries validation only once and fails without a publishable partial result', async () => {
    const generateText = vi.fn().mockResolvedValue(answer({ why_now: 'He has 87 strikeouts.' }));
    await expect(createFantasyBriefing(facts(), { generateText, now: new Date('2026-09-07T16:05:00Z') })).rejects.toThrow(/validation failed/);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('repairs every selected call together using their full evidence instead of resending the whole discovery pool', async () => {
    const evidence = facts();
    evidence.candidates.push({ ...structuredClone(evidence.candidates[0]), id: 'bdl:22', player_id: '22', player_name: 'Second Player' });
    evidence.candidates.push({ ...structuredClone(evidence.candidates[0]), id: 'bdl:33', player_id: '33', player_name: 'Unselected Player' });
    evidence.candidates[2].evidence[0].facts.large = 'unused'.repeat(2000);
    const first = JSON.parse(answer({ why_now: 'He has 87 strikeouts.', risk: 'The sample includes 88 walks.' })).decisions[0];
    const second = { ...JSON.parse(answer()).decisions[0], candidate_id: 'bdl:22', why_now: 'He has 89 strikeouts.' };
    const invalid = JSON.stringify({ decisions: [first, second] });
    expect(() => validateFantasyDecisions(invalid, evidence)).toThrow(/87[\s\S]*88[\s\S]*89/);
    const generateText = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(answer());
    const result = await createFantasyBriefing(evidence, { generateText, now: new Date('2026-09-07T16:05:00Z') });
    const [initial, repair] = generateText.mock.calls.map(call => call[0]);
    expect(repair).toContain('87');
    expect(repair).toContain('88');
    expect(repair).toContain('89');
    expect(repair).toContain('Second Player');
    expect(repair).not.toContain('Unselected Player');
    expect(repair).toContain('"strikeouts":12');
    expect(Buffer.byteLength(repair)).toBeLessThan(Buffer.byteLength(initial));
    expect(result.generation.total_prompt_bytes).toBe(Buffer.byteLength(initial) + Buffer.byteLength(repair));
  });

  it('does not call the model for incomplete collections or a healthy empty slate', async () => {
    const generateText = vi.fn();
    await expect(createFantasyBriefing({ ...facts(), coverage: { complete: false } }, { generateText })).rejects.toThrow(/incomplete/);
    const result = await createFantasyBriefing({ ...facts(), candidates: [] }, { generateText, now: new Date('2026-09-07T16:05:00Z') });
    expect(result.decisions).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('fingerprints actual facts and source timestamps but ignores collection-only clock changes', () => {
    const original = facts();
    const later = structuredClone(original);
    later.as_of = '2026-09-07T16:30:00.000Z';
    later.candidates[0].evidence[0].observed_at = later.as_of;
    expect(fantasyInputFingerprint(later)).toBe(fantasyInputFingerprint(original));
    original.candidates[0].evidence[0].facts.collected_at = original.as_of;
    later.candidates[0].evidence[0].facts.collected_at = later.as_of;
    original.valid_until = '2026-09-07T19:00:00Z';
    later.valid_until = '2026-09-07T19:30:00Z';
    original.candidates[0].evidence[0].summary = `Collected ${original.as_of}`;
    later.candidates[0].evidence[0].summary = `Collected ${later.as_of}`;
    expect(fantasyInputFingerprint(later)).toBe(fantasyInputFingerprint(original));
    later.candidates[0].evidence[0].facts.batting_order = 4;
    expect(fantasyInputFingerprint(later)).not.toBe(fantasyInputFingerprint(original));
    later.candidates[0].evidence[0].facts.batting_order = 3;
    later.candidates[0].evidence[0].provider_updated_at = later.as_of;
    expect(fantasyInputFingerprint(later)).not.toBe(fantasyInputFingerprint(original));
  });

  it('bounds complete prompt size without clipping the evidence', () => {
    const evidence = facts();
    evidence.candidates[0].evidence[0].facts.full = 'x'.repeat(230_000);
    expect(() => buildFantasyPrompt(evidence)).toThrow(/do not truncate/);
  });

  it('does not regenerate because transport byte counts changed', () => {
    const first = facts();
    const second = facts();
    first.coverage.transport = { response_bytes: 1000 };
    second.coverage.transport = { response_bytes: 2000 };
    second.coverage.requests_attempted = 9;
    expect(fantasyInputFingerprint(first)).toBe(fantasyInputFingerprint(second));
    expect(buildFantasyPrompt(second)).not.toContain('response_bytes');
    second.coverage.sources_failed = ['ownership'];
    expect(fantasyInputFingerprint(first)).not.toBe(fantasyInputFingerprint(second));
  });

  it('compacts repeated game keys without losing late rows, nulls, or missing measurements', () => {
    const evidence = facts();
    const rows = [{ date: '2026-09-06', targets: 9 }, { date: '2026-09-05', targets: null }, { date: '2026-09-04', targets: 0 }];
    evidence.candidates[0].evidence[0].facts.rows = rows;
    let table = fantasyPromptEvidence(evidence).candidates[0].evidence[0].facts.rows;
    expect(table.rows.map(row => Object.fromEntries(table.columns.map((key, i) => [key, row[i]])))).toEqual(rows);
    delete rows[1].targets;
    expect(fantasyPromptEvidence(evidence).candidates[0].evidence[0].facts.rows).toEqual(rows);
  });

  it('closes game-dependent calls at the scheduled start and rejects fake weekly starts', () => {
    const decision = validateFantasyDecisions(answer(), facts())[0];
    expect(decision.valid_until).toBe('2026-09-07T22:00:00.000Z');
    expect(() => validateFantasyDecisions(answer({ horizon: 'week' }), facts())).toThrow(/horizon/);
    expect(validateFantasyDecisions(answer({ action: 'HOLD', horizon: 'week' }), facts())[0].valid_until).toBeNull();
  });

  it('does not spend a model call on expired evidence or publish a game that locked during generation', async () => {
    const generateText = vi.fn().mockResolvedValue(answer());
    await expect(createFantasyBriefing(facts(), { generateText, now: new Date('2026-09-07T19:00:00Z') })).rejects.toThrow(/expired/);
    expect(generateText).not.toHaveBeenCalled();
    const evidence = facts();
    evidence.candidates[0].context.opportunities[0].start_at = '2026-09-07T16:05:00Z';
    const result = await createFantasyBriefing(evidence, { generateText, now: new Date('2026-09-07T16:05:00Z') });
    expect(result.decisions).toEqual([]);
  });

  it('accepts ordinary display precision from a cited measured rate', () => {
    const evidence = facts();
    evidence.candidates[0].evidence[1].facts.pitching_era = 3.6525;
    expect(validateFantasyDecisions(answer({ why_now: 'The 3.65 ERA needs matchup context.' }), evidence)).toHaveLength(1);
    evidence.candidates[0].evidence[1].facts.k_per_9 = 12.2;
    expect(validateFantasyDecisions(answer({ why_now: 'The 12.2 K/9 needs matchup context.' }), evidence)).toHaveLength(1);
  });

  it('never licenses a statistic using an identity or an uncited measurement', () => {
    const evidence = facts();
    expect(() => validateFantasyDecisions(answer({ why_now: 'He has 11 strikeouts.' }), evidence)).toThrow(/number/);
    evidence.candidates[0].evidence.push({ id: 'uncited', facts: { strikeouts: 87 } });
    expect(() => validateFantasyDecisions(answer({ why_now: 'He has 87 strikeouts.' }), evidence)).toThrow(/number/);
  });

  it('supports a cross-player comparison only when both players have explicitly cited evidence', () => {
    const evidence = facts();
    const peer = { ...structuredClone(evidence.candidates[0]), id: 'bdl:22', player_id: '22', player_name: 'Alternative Player' };
    peer.evidence[1].facts.strikeouts = 17;
    peer.context.opportunities[0].start_at = '2026-09-07T20:00:00Z';
    evidence.candidates.push(peer);
    const call = { why_now: 'His 12 strikeouts trail the alternative at 17.', evidence_ids: ['recent', 'bdl:22/recent'] };
    const result = validateFantasyDecisions(answer(call), evidence);
    expect(result[0].evidence[1]).toMatchObject({ id: 'bdl:22/recent', label: 'Alternative Player · Last outings', player_id: '22' });
    expect(result[0].valid_until).toBe('2026-09-07T20:00:00.000Z');
    expect(result[0].opportunities).toEqual(evidence.candidates[0].context.opportunities);
    expect(() => validateFantasyDecisions(answer({ ...call, evidence_ids: ['recent', 'lineup'] }), evidence)).toThrow(/17/);
    expect(() => validateFantasyDecisions(answer({ ...call, evidence_ids: ['bdl:22/lineup', 'bdl:22/recent'] }), evidence)).toThrow(/reference/);
    evidence.candidates[0].context.opportunities = [];
    expect(() => validateFantasyDecisions(answer(call), evidence)).toThrow(/no future scheduled opportunity/);
  });

  it('can quote a cited source status verbatim without treating it as clearance', () => {
    const evidence = facts();
    evidence.candidates[0].evidence[1].facts.status = '60-Day-IL';
    expect(validateFantasyDecisions(answer({ action: 'WATCH', why_now: 'The published 60-Day-IL status conflicts with the probable listing.' }), evidence)).toHaveLength(1);
  });

  it('accepts the cited kickoff clock without treating timestamp digits as statistics', () => {
    const evidence = facts();
    evidence.candidates[0].evidence[0].facts.start_at = '2026-09-07T21:10:00Z';
    expect(validateFantasyDecisions(answer({ watch_for: 'Check the lineup before 5:10 PM ET.' }), evidence)).toHaveLength(1);
    expect(() => validateFantasyDecisions(answer({ why_now: 'He has 10 strikeouts.' }), evidence)).toThrow(/number/);
    expect(validateFantasyDecisions(answer({ watch_for: 'Check the 49ers lineup.' }), evidence)).toHaveLength(1);
  });

  it('never extends the source forecast lifetime by collecting it later', async () => {
    const evidence = facts('nfl');
    evidence.valid_until = '2026-09-07T17:00:00Z';
    const result = await createFantasyBriefing(evidence, { generateText: vi.fn().mockResolvedValue(answer({ formats: ['ppr'], categories: ['receptions'] })), now: new Date('2026-09-07T16:05:00Z') });
    expect(result.expires_at).toBe('2026-09-07T17:00:00.000Z');
  });

  it('keeps NFL format-specific interpretation and a six-hour evidence lifetime', async () => {
    const result = await createFantasyBriefing(facts('nfl'), {
      generateText: vi.fn().mockResolvedValue(answer({ formats: ['ppr'], categories: ['receptions'] })),
      now: new Date('2026-09-07T16:05:00Z'),
    });
    expect(result.league).toBe('NFL');
    expect(result.decisions[0].formats).toEqual(['ppr']);
    expect(result.expires_at).toBe('2026-09-07T22:00:00.000Z');
    const evidence = facts('nfl');
    evidence.candidates[0].evidence[1].facts.points = 5.1;
    expect(() => validateFantasyDecisions(answer({ formats: ['ppr'], categories: ['receptions'], why_now: 'The forecast is a maximum of 5.1 points.' }), evidence)).toThrow(/ceiling or floor/);
  });

  it('honors cancellation before and after model work', async () => {
    const controller = new AbortController();
    const generateText = vi.fn(async () => { controller.abort(); return answer(); });
    await expect(createFantasyBriefing(facts(), { generateText, signal: controller.signal, now: new Date('2026-09-07T16:05:00Z') })).rejects.toThrow();
    expect(generateText).toHaveBeenCalledTimes(1);
    await expect(createFantasyBriefing(facts(), { generateText, signal: controller.signal })).rejects.toThrow();
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});

it('rejects xERA in cited evidence even when the generated prose omits its name', () => {
  const evidence = facts();
  evidence.candidates[0].evidence[1].facts.xera = 3.26;
  expect(() => validateFantasyDecisions(answer(), evidence)).toThrow(/xERA is excluded/);
});
