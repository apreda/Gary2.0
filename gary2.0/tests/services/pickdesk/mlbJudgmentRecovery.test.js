import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/supabaseClient.js', () => ({ supabaseAdmin: {} }));
import { reconcilePublished, reviewCandidate } from '../../../scripts/run-winners-board.js';
import { winnersCandidate } from '../../../src/services/pickdesk/winnersAdmissions.js';
import { originalGameEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';
import { mlbJudgmentFixture } from '../../helpers/mlbJudgmentFixture.js';

const date = '2026-09-08', now = Date.parse('2026-09-08T18:00:00Z');
function setup({ queued = true, status = 'unavailable', published = false, admitted = false, missingDesk = false } = {}) {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const pick = { game_id: '42', league: 'MLB', pick: 'Red Sox ML -118', odds: -118, type: 'moneyline', homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners',
    commence_time: '2026-09-08T23:10:00Z', rationale: 'Original full-game reasoning.', model: 'codex-gpt-6-astra', prompt_sha: 'v2-era',
    decision_policy: 'mlb-judgment-v2', judgment_run_id: 'run-recovery', price_endorsement: 'endorse', odds_visibility: 'odds_visible' };
  const full = mlbJudgmentFixture(pick);
  const journal = structuredClone(full); if (!published) delete journal.receipts.published;
  const evidence = originalGameEvidence({ pick, deskText: 'Original full source desk', result: { _mlbJudgment: journal, _evidenceObservedAt: '2026-09-08T16:10:00Z' } });
  const header = { run_id: pick.judgment_run_id, game_date: date, game_id: pick.game_id, commence_time: pick.commence_time, model: pick.model, prompt_sha: pick.prompt_sha,
    source_snapshot: { deskText: evidence.deskText, researchBriefing: 'Original immutable research briefing', toolResponses: [{ name: 'original tool', content: 'Original source evidence' }], game: { id: pick.game_id } } };
  const db = { candidate: queued ? { ...winnersCandidate({ date, league: 'MLB', kind: 'game', pick, evidence }), status, admitted_at: admitted ? '2026-09-08T17:00:00Z' : null } : null,
    writes: [], from(table) {
      const filters = []; let insert, update;
      const q = { select() { return q; }, maybeSingle() { return q; }, gte() { return q; }, lte() { return q; },
        eq(key, value) { filters.push(['eq', key, value]); return q; }, is(key, value) { filters.push(['eq', key, value]); return q; },
        gt(key, value) { filters.push(['gt', key, value]); return q; }, in(key, value) { filters.push(['in', key, value]); return q; },
        upsert(value) { insert = value; return q; }, update(value) { update = value; return q; },
        then(resolve) {
          let data;
          if (table === 'daily_picks') data = { picks: [pick] };
          else if (table === 'prop_picks') data = { picks: [] };
          else if (table === 'weekly_nfl_picks') data = [];
          else if (table === 'mlb_judgment_runs') data = header;
          else if (table === 'pick_desks') data = missingDesk ? [] : [{ matchup: `${pick.awayTeam} @ ${pick.homeTeam}`, pick: pick.pick, desk: evidence.deskText,
            decision_evidence: evidence, created_at: '2026-09-08T16:10:00Z' }];
          else if (table === 'winners_candidates') {
            if (insert && !db.candidate) db.candidate = structuredClone(insert);
            const matches = filters.every(([op, key, value]) => {
              const actual = key.split(/->>?/).reduce((object, key) => object?.[key], db.candidate) ?? null;
              return op === 'in' ? value.includes(actual) : op === 'gt' ? actual > value : actual === value;
            });
            if (update && matches) { Object.assign(db.candidate, structuredClone(update)); db.writes.push(update); }
            data = structuredClone(db.candidate);
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      }; return q;
    } };
  const recoverJudgment = vi.fn(async () => structuredClone(full));
  return { db, pick, evidence, full, header, recoverJudgment };
}
afterEach(() => vi.useRealTimers());

describe('MLB staged publication gap recovery', () => {
  it('restores the published receipt on the same queued journal without changing original evidence', async () => {
    const f = setup(), original = structuredClone(f.evidence);
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.recoverJudgment).toHaveBeenCalledWith(f.db, f.pick, { gameDate: date, now });
    expect(f.db.candidate.evidence_snapshot).toEqual({ ...original, mlbJudgment: f.full });
    expect(f.db.candidate.pick_snapshot).toEqual(f.pick);
    const gameReview = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    expect((await reviewCandidate(f.db.candidate, { now, gameReview })).status).toBe('qualified');
    expect(gameReview).toHaveBeenCalledTimes(1);
  });
  it('creates a missing queue entry from exact recovered publication evidence', async () => {
    const f = setup({ queued: false });
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate.policy_version).toBe('mlb-conviction-v4');
    expect(f.db.candidate.evidence_snapshot.mlbJudgment).toEqual(f.full);
  });
  it('accepts the new durable receipt recorded after the reconciliation sweep began', async () => {
    const f = setup();
    f.full.receipts.published.recorded_at = new Date(now + 500).toISOString();
    f.recoverJudgment.mockImplementation(async () => { vi.setSystemTime(now + 1000); return structuredClone(f.full); });
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate.evidence_snapshot.mlbJudgment.receipts.published).toEqual(f.full.receipts.published);
  });
  it('recovers missing desk-mirror evidence from the same immutable source ledger', async () => {
    const f = setup({ queued: false, missingDesk: true });
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate.evidence_snapshot).toMatchObject({ snapshotVersion: 2, deskText: f.header.source_snapshot.deskText,
      researchBriefing: f.header.source_snapshot.researchBriefing, toolResponses: f.header.source_snapshot.toolResponses,
      mlbJudgment: f.full, observedAt: f.full.receipts.price_assessment.recorded_at, pickSnapshot: f.pick });
    const gameReview = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    expect((await reviewCandidate(f.db.candidate, { now, gameReview })).status).toBe('qualified');
  });
  it.each(['game_id','model','prompt_sha','commence_time'])('does not recover immutable source from a mismatched %s', async field => {
    const f = setup({ queued: false, missingDesk: true }); f.header[field] = 'different';
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate.evidence_snapshot).toEqual({});
  });
  it('permits optional receipt row identifiers to differ while retaining the same four durable payload hashes', async () => {
    const f = setup();
    for (const value of Object.values(f.full.receipts)) delete value.event_id;
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate.evidence_snapshot.mlbJudgment.receipts.published).toEqual(f.full.receipts.published);
  });
  it.each(['qualified','rejected','reviewing'])('does not overwrite a journal after review has started or finished: %s', async status => {
    const f = setup({ status }), before = structuredClone(f.db.candidate);
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate).toEqual(before);
  });
  it('does not replace an already complete or admitted original journal', async () => {
    for (const options of [{ published: true }, { admitted: true }]) {
      const f = setup(options), before = structuredClone(f.db.candidate);
      await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
      expect(f.db.candidate).toEqual(before); expect(f.db.writes).toEqual([]);
    }
  });
  it('does not use receipt recovery to rewrite the original expectation text', async () => {
    const f = setup(), before = structuredClone(f.db.candidate);
    f.full.stress.expectations.finish.claim = 'A reconstructed different expectation.';
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate).toEqual(before);
  });
  it('keeps the journal unavailable when recovery fails instead of manufacturing a receipt', async () => {
    const f = setup(), before = structuredClone(f.db.candidate);
    f.recoverJudgment.mockRejectedValue(new Error('durable ledger unavailable'));
    await reconcilePublished(f.db, date, { now, recoverJudgment: f.recoverJudgment });
    expect(f.db.candidate).toEqual(before);
    const gameReview = vi.fn();
    expect((await reviewCandidate(f.db.candidate, { now, gameReview })).status).toBe('unavailable');
    expect(gameReview).not.toHaveBeenCalled();
  });
  it('never recovers a postgame publication receipt', async () => {
    const f = setup();
    await reconcilePublished(f.db, date, { now: Date.parse(f.pick.commence_time), recoverJudgment: f.recoverJudgment });
    expect(f.recoverJudgment).not.toHaveBeenCalled();
  });
});
