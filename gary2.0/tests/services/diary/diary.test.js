import { describe, it, expect, vi } from 'vitest';
import { summarizeByReason, buildNotebook } from '../../../src/services/diary/notebook.js';
import { buildAutopsyAsk, parseAutopsy, writeAutopsy, AUTOPSY_SYSTEM } from '../../../src/services/diary/autopsy.js';
import { AUTOPSY_REVIEW_VERSION, matchingDesk, pregameEvidence } from '../../../src/services/diary/evidence.js';

vi.mock('../../../src/supabaseClient.js', () => ({ supabaseAdmin: {}, supabase: {} }));
const { runAutopsies } = await import('../../../scripts/run-diary.js');
const input = (over = {}) => ({
  homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', gameDate: '2026-09-02', pickText: 'Red Sox ML -144', result: 'lost',
  rationale: 'The starter has allowed two runs across three starts.', caseText: 'The starter can work deep into this game.',
  pregameEvidence: pregameEvidence({ desk: 'Three starts: 19 innings, two earned runs. Season: 140 innings.', rationale: 'The starter has allowed two runs across three starts.' }),
  story: 'FINAL: Mariners 6, Red Sox 3. Seventh inning: a fielding error preceded three runs off the bullpen.', ...over,
});
const answer = (over = {}) => ({
  mechanism_stated: 'The starter could work deep.', reason_type: 'starter_recent_form', decided_by: 'A late error preceded three runs.', mechanism_label: 'defense',
  decision_review: {
    assessment: 'no_identified_error', explanation: 'The cited past starts match the supplied pregame data.',
    evidence: [{ source: 'rationale', quote: 'The starter has allowed two runs across three starts.' }, { source: 'desk', quote: 'Three starts: 19 innings, two earned runs.' }],
    limitations: 'The pricing of the ticket remains unverified.',
  },
  outcome_review: { claim_status: 'unknown', variance: 'consistent_with_variance', explanation: 'The error is compatible with variance; the starter line is missing.', evidence: [{ source: 'game_story', quote: 'Seventh inning: a fielding error preceded three runs off the bullpen.' }] },
  note: 'The past starts match this record; the scoring story does not establish the full starter performance.', ...over,
});
const row = (over = {}) => ({
  review_version: AUTOPSY_REVIEW_VERSION, game_date: '2026-09-01', game_id: '1', source: 'gary', home_team: 'Boston Red Sox', away_team: 'Seattle Mariners', pick_text: 'Red Sox ML -144', result: 'lost', ...answer(), ...over,
});

describe('original evidence and decision review', () => {
  it('reviews a win and a loss with the same evidence contract', () => {
    const lost = buildAutopsyAsk(input());
    expect(lost.replace('It LOST.', 'It WON.')).toBe(buildAutopsyAsk(input({ result: 'won' })));
    expect(lost).toContain('ORIGINAL SOURCE: desk');
    expect(lost).toContain('POSTGAME SOURCE: game_story');
    expect(AUTOPSY_SYSTEM).toContain('A loss does not establish bad reasoning, and a win does not validate reasoning.');
  });
  it('does not convert a loss into a factual error, or a win into a clean decision', () => {
    const loss = parseAutopsy(JSON.stringify(answer()), input());
    expect(loss.decision_review.assessment).toBe('no_identified_error');
    expect(loss.outcome_review.variance).toBe('consistent_with_variance');
    const won = answer(); won.decision_review.assessment = 'unsupported_assumption';
    expect(parseAutopsy(JSON.stringify(won), input({ result: 'won' })).decision_review.assessment).toBe('unsupported_assumption');
  });
  it('requires original data plus exact claim and data citations, excluding hindsight', () => {
    const noDesk = parseAutopsy(JSON.stringify(answer()), input({ pregameEvidence: null }));
    expect(noDesk.decision_review.assessment).toBe('unknown');
    expect(noDesk.note).toBe('');
    const fabricated = answer(); fabricated.decision_review.evidence[1].quote = 'Invented stats absent from the desk.';
    expect(parseAutopsy(JSON.stringify(fabricated), input()).decision_review.assessment).toBe('unknown');
    const hindsight = answer(); hindsight.decision_review.evidence = [{ source: 'game_story', quote: 'Seventh inning: a fielding error preceded three runs off the bullpen.' }];
    expect(parseAutopsy(JSON.stringify(hindsight), input()).decision_review.assessment).toBe('unknown');
  });
  it('keeps missing outcomes unknown and cannot diagnose variance from a final alone', () => {
    const out = parseAutopsy(JSON.stringify(answer()), input({ story: '' }));
    expect(out.outcome_review.claim_status).toBe('unknown');
    expect(out.outcome_review.variance).toBe('unknown');
    const score = answer(); score.outcome_review.evidence = [{ source: 'game_story', quote: 'FINAL: Mariners 6, Red Sox 3.' }];
    expect(parseAutopsy(JSON.stringify(score), input()).outcome_review.variance).toBe('unknown');
  });
  it('rejects old contracts and drops side rules', () => {
    expect(parseAutopsy('{"reason_status":"wrong","note":"learn from this loss"}', input())).toBeNull();
    expect(parseAutopsy('nothing', input())).toBeNull();
    const side = parseAutopsy(JSON.stringify(answer({ note: 'always fade the road favorite here' })), input());
    expect(side.note).toBe('');
    expect(side.note_dropped_as_side).toBe(true);
  });
  it('retains one call, no search, and fail-soft behavior', async () => {
    const oneShot = vi.fn(async () => ({ success: true, data: JSON.stringify(answer()) }));
    expect((await writeAutopsy(input(), { oneShot })).ok).toBe(true);
    expect(oneShot).toHaveBeenCalledTimes(1);
    expect(oneShot.mock.calls[0][1]).toMatchObject({ search: false, effort: 'medium', breakerKey: 'codex-autopsy' });
    expect((await writeAutopsy({ pickText: 'x' }, { oneShot })).error).toBe('missing pick or card');
    expect((await writeAutopsy(input(), { oneShot: async () => { throw new Error('boom'); } })).ok).toBe(false);
  });
  it('matches original desks by exact ticket as well as clubs, refusing ambiguity', () => {
    const desk = { matchup: 'Seattle Mariners @ Boston Red Sox', pick: 'Red Sox ML -144', desk: 'original' };
    const target = { homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', pickText: 'Red Sox ML -144' };
    expect(matchingDesk([desk], target)).toBe(desk);
    expect(matchingDesk([{ ...desk, pick: 'Red Sox ML -120' }], target)).toBeNull();
    expect(matchingDesk([desk, desk], target)).toBeNull();
    expect(matchingDesk([desk], { ...target, sameMatchupGames: 2 })).toBeNull();
  });
});

describe('the separate notebook', () => {
  it('summarizes decision findings separately from results, preserving unknown', () => {
    const table = summarizeByReason([row(), row({ result: 'won', decision_review: { assessment: 'unsupported_assumption' } }), row({ result: 'won', decision_review: { assessment: 'unknown' } })]);
    expect(table[0]).toMatchObject({ bets: 3, record: '2-1', noIdentifiedError: 1, assumptions: 1, unknown: 1 });
    expect(table[0]).not.toHaveProperty('rightRate');
  });
  it('keeps legacy hindsight lessons out and labels same-game reviews as correlated', () => {
    const nb = buildNotebook([row(), row({ source: 'diary', note: 'fade road favorites' }), row({ review_version: null, note: 'old hindsight lesson' })], {});
    expect(nb.notes).toBe(2);
    expect(nb.text).toContain('2 reviewed tickets from 1 game.');
    expect(nb.text).toContain('correlated observations');
    expect(nb.text).toContain('original decision no_identified_error; claim afterward unknown');
    expect(nb.text).toContain('result 0-2');
    expect(nb.text).not.toContain('fade road favorites');
    expect(nb.text).not.toContain('old hindsight lesson');
    expect(nb.text).not.toContain('it decided the game');
    expect(buildNotebook([row({ review_version: null })], {}).text).toBe('');
  });
});

describe('nightly orchestration preserves original inputs', () => {
  function database(tables, inserted) {
    return { from(table) {
      let insert = null;
      const query = { select() { return query; }, eq() { return query; },
        upsert(value, options) { insert = value; inserted.push({ table, value, options }); return query; },
        then(resolve) { return Promise.resolve({ data: insert ? [{ game_id: insert.game_id }] : (tables[table] || []), error: null }).then(resolve); },
      }; return query;
    } };
  }
  it('reviews wins, losses and pushes in both sources, leaving existing reviews intact', async () => {
    const picks = ['won', 'lost', 'push'].map((result, i) => ({ game_id: String(i + 1), league: 'MLB', homeTeam: 'Boston Red Sox', awayTeam: i === 0 ? 'Seattle Mariners' : `Opponent ${i}`, pick: `Red Sox ML -14${i}`, rationale: 'Original card', path_home: 'Original home case', path_away: 'Original away case', result }));
    const diary = picks.map((p) => ({ game_id: p.game_id, home_team: p.homeTeam, away_team: p.awayTeam, pick_text: p.pick, result: p.result, rationale: p.rationale, side: 'home', pregame_evidence: pregameEvidence({ desk: 'Exact diary desk', notebook: 'Original notebook' }) }));
    const tables = { daily_picks: [{ picks }], game_results: picks.map((p) => ({ game_id: p.game_id, pick_text: p.pick, result: p.result })), diary_picks: diary, pick_autopsies: [{ game_id: '2', source: 'gary' }], pick_desks: [{ matchup: 'Seattle Mariners @ Boston Red Sox', pick: 'Red Sox ML -140', desk: 'Exact public desk', research_briefing: 'Original research' }] };
    const written = []; const inputs = [];
    const out = await runAutopsies('2026-09-02', { database: database(tables, written), getFinals: async () => ({ byPk: new Map(), byNames: new Map() }), review: async (i) => {
      inputs.push(i); return { ok: true, autopsy: { ...row(), decision_review: { assessment: 'unknown' }, outcome_review: { claim_status: 'unknown' } }, model: 'unchanged', ms: 1 };
    } });
    expect(out).toEqual({ jobs: 5, done: 5 });
    expect(inputs.map((i) => i.result).sort()).toEqual(['lost', 'push', 'push', 'won', 'won']);
    expect(inputs[0].caseText).toBe('Original home case');
    expect(inputs[0].pregameEvidence.desk).toBe('Exact public desk');
    expect(inputs[1].pregameEvidence.desk).toBeNull();
    expect(inputs[2].pregameEvidence.desk).toBe('Exact diary desk');
    expect(written.every((x) => x.options.ignoreDuplicates === true)).toBe(true);
    expect(written[0].value.pregame_evidence.research_briefing).toBe('Original research');
  });
});
