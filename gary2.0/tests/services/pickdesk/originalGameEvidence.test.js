import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/supabaseClient.js', () => ({ supabaseAdmin: {} }));
import { originalGameEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';
import { enqueueWinnersCandidate, winnersCandidate } from '../../../src/services/pickdesk/winnersAdmissions.js';
import { reconcilePublished, reviewCandidate } from '../../../scripts/run-winners-board.js';
const date = '2026-09-05', league = 'NCAAF', now = Date.parse('2026-09-05T12:00:00Z');
const pick = { game_id: '7', pick: 'Home State -3.5 (-110)', odds: -110, type: 'spread', spread: -3.5,
  homeTeam: 'Home State', awayTeam: 'Away Tech', league, path_home: 'Exact home case', path_away: 'Exact away case',
  rationale: 'Original rationale', model: 'Astra', prompt_sha: 'original-era', commence_time: '2026-09-05T16:00:00Z' };
const evidence = originalGameEvidence({ pick, deskText: 'ORIGINAL DESK', result: {
  _evidenceObservedAt: '2026-09-05T11:50:00Z', _researchBriefing: 'Original research with source limits',
  _originalToolResponses: [{ name: 'fetch_stats', toolCallId: 't1', observedAt: '2026-09-05T11:45:00Z', content: 'Exact late pitcher response: original source and denominator.' }],
} });

// Stateful queue fixture exercises duplicate publication and conditional writes.
function client({ candidate = null, saved = evidence } = {}) {
  const db = { candidate, writes: [], from(table) {
    let update, insert, filters = [];
    const q = { select() { return q; }, maybeSingle() { return q; },
      eq(k,v) { filters.push(['eq',k,v]); return q; }, is(k,v) { filters.push(['eq',k,v]); return q; },
      in(k,v) { filters.push(['in',k,v]); return q; }, gt(k,v) { filters.push(['gt',k,v]); return q; },
      gte() { return q; }, lte() { return q; },
      update(value) { update = value; return q; }, upsert(value) { insert = value; return q; },
      then(resolve) {
        let data = null;
        if (table === 'winners_candidates') {
          if (insert && !db.candidate) db.candidate = structuredClone(insert);
          if (update && db.candidate && filters.every(([op,k,v]) => {
            const [field,key] = k.split('->>'); const actual = (key ? db.candidate[field]?.[key] : db.candidate[field]) ?? null;
            return op === 'in' ? v.includes(actual) : op === 'gt' ? actual > v : actual === v;
          })) { Object.assign(db.candidate, structuredClone(update)); db.writes.push(update); }
          data = structuredClone(db.candidate);
        } else if (table === 'daily_picks') data = { picks: [pick] };
        else if (table === 'prop_picks') data = { picks: [] };
        else if (table === 'weekly_nfl_picks') data = [];
        else if (table === 'pick_desks') data = [{ matchup: 'Away Tech @ Home State', pick: pick.pick, desk: evidence.deskText,
          research_briefing: evidence.researchBriefing, decision_evidence: saved, created_at: '2026-09-05T11:55:00Z' }];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    }; return q;
  } }; return db;
}
afterEach(() => vi.useRealTimers());
describe('durable original evidence', () => {
  it('restores identical cases and every original tool response after losing the direct queue write', async () => {
    const db = client();
    await reconcilePublished(db,date,{ now });
    expect(db.candidate.evidence_snapshot).toEqual(evidence);
    const review = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    await reviewCandidate(db.candidate,{ now, gameReview: review });
    expect(review.mock.calls[0][0]).toMatchObject({ caseHome: pick.path_home, caseAway: pick.path_away, odds: -110, betLine: -3.5 });
    expect(review.mock.calls[0][0].deskText).toContain(evidence.toolResponses[0].content);
    expect(review.mock.calls[0][0].deskText).toContain(evidence.researchBriefing);
  });
  it.each(['pending','unavailable'])('fills a desk-only publication race while %s without restarting a completed judgment', async status => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const candidate = winnersCandidate({ date, league, kind: 'game', pick, evidence: { deskText: evidence.deskText, caseHome: pick.path_home } });
    const db = client({ candidate: { ...candidate, status } });
    await enqueueWinnersCandidate(db,{ date, league, kind: 'game', pick, evidence });
    expect(db.candidate.evidence_snapshot).toEqual(evidence);
    const count = db.writes.length;
    await enqueueWinnersCandidate(db,{ date, league, kind: 'game', pick, evidence: { ...evidence, toolResponses: [] } });
    expect(db.writes).toHaveLength(count); // complete original cannot be overwritten
  });
  it.each(['qualified','rejected','reviewing'])('does not replace evidence after a review has started or finished: %s', async status => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const old = { deskText: evidence.deskText };
    const db = client({ candidate: { ...winnersCandidate({ date, league, kind: 'game', pick, evidence: old }), status } });
    await enqueueWinnersCandidate(db,{ date, league, kind: 'game', pick, evidence });
    expect(db.candidate.evidence_snapshot).toEqual(old);
  });
  it.each([
    { ...evidence, observedAt: '2026-09-05T16:01:00Z' },
    { ...evidence, pickSnapshot: { ...pick, game_id: 'other-game' } },
    { ...evidence, pickSnapshot: { ...pick, rationale: 'Another decision on the same ticket' } },
  ])('refuses a postgame or mismatched saved envelope', async saved => {
    const db = client({ saved });
    await reconcilePublished(db,date,{ now });
    expect(db.candidate.evidence_snapshot).toEqual({});
  });
});
