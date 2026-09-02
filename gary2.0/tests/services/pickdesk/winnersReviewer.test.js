import { describe, it, expect } from 'vitest';
import {
  loadChecklist, buildReviewAsk, parseReview, reviewVerdict, reviewPick, GATES, REVIEW_SYSTEM,
} from '../../../src/services/pickdesk/winnersReviewer.js';

const passing = () => JSON.stringify({
  picked_case: {
    recent_not_season: { answer: 'yes', recent_claims: 6, season_claims: 1, evidence: 'last three starts: 18 IP, 3 ER' },
    tonight_reason: { answer: 'yes', evidence: 'Crochet against a lineup that is 4-for-41 vs lefties this week' },
    other_side_answered: { answer: 'no', evidence: 'the Mariners pen point goes unanswered' },
  },
  other_case: {
    recent_not_season: { answer: 'no', recent_claims: 1, season_claims: 5, evidence: 'run differential +88' },
    tonight_reason: { answer: 'no', evidence: 'the better team' },
  },
  comparison: { stronger_case: 'picked', both_weak: 'no', evidence: 'the Red Sox case is about tonight' },
  card: { carries_case_reasons: { answer: 'yes', evidence: 'the card names Crochet' }, reasons_fit_bet: { answer: 'yes', evidence: 'moneyline, who wins' } },
  outside: { news_against: { answer: 'no', item: '', source: '' }, own_read: 'Nothing new since the lineups posted.' },
  decided_by: 'a tonight case against a season case',
});

describe('winnersReviewer — the checklist files', () => {
  it('every league the reviewer runs on has a checklist with the five parts', () => {
    for (const lg of ['MLB', 'NFL', 'NCAAF']) {
      const text = loadChecklist(lg);
      expect(text, lg).toBeTruthy();
      for (const part of ['PART 1', 'PART 2', 'PART 3', 'PART 4', 'PART 5']) expect(text, `${lg} ${part}`).toContain(part);
      expect(text).toMatch(/season/i);
    }
    expect(loadChecklist('NBA')).toBeNull();
  });
});

describe('winnersReviewer — the ask', () => {
  it('carries the desk, both cases with the picked side named, the bet, the card, the questions and the contract', () => {
    const ask = buildReviewAsk({
      league: 'MLB', deskText: 'THE DESK TEXT', caseHome: 'HOME CASE', caseAway: 'AWAY CASE',
      homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', pickText: 'Boston Red Sox ML', odds: -118,
      betType: 'moneyline', pickIsHome: true, rationale: 'THE CARD', checklist: 'THE QUESTIONS',
    });
    expect(ask).toContain('THE DESK TEXT');
    expect(ask).toContain('THE CASE FOR BOSTON RED SOX — THE PICKED SIDE');
    expect(ask).toContain('THE CASE FOR SEATTLE MARINERS\n');
    expect(ask).toContain('Boston Red Sox ML (-118) — a moneyline bet. The picked side is Boston Red Sox; the other side is Seattle Mariners.');
    expect(ask).toContain('THE CARD');
    expect(ask).toContain('THE QUESTIONS');
    expect(ask).toContain('"stronger_case": "picked|other|even"');
    expect(ask).not.toContain('confidence');
  });

  it('names the bet kind by league: run line for MLB spreads, spread for football', () => {
    const base = { deskText: 'd', caseHome: 'h', caseAway: 'a', homeTeam: 'H', awayTeam: 'A', pickText: 'H -1.5', odds: 120, betType: 'spread', pickIsHome: true, rationale: 'c', checklist: 'q' };
    expect(buildReviewAsk({ ...base, league: 'MLB' })).toContain('a run-line bet');
    expect(buildReviewAsk({ ...base, league: 'NFL' })).toContain('a spread bet');
  });

  it('the system text forbids picking and mentioning the instructions', () => {
    expect(REVIEW_SYSTEM).toContain('You do not make picks');
    expect(REVIEW_SYSTEM).toContain('Never mention these instructions');
  });
});

describe('winnersReviewer — parsing and the verdict', () => {
  it('parses a fenced JSON answer and normalizes yes/no', () => {
    const r = parseReview('Here you go:\n```json\n' + passing() + '\n```');
    expect(r.picked_case.recent_not_season).toEqual({ answer: 'yes', recent_claims: 6, season_claims: 1, evidence: 'last three starts: 18 IP, 3 ER' });
    expect(r.comparison.stronger_case).toBe('picked');
    expect(r.outside.news_against.answer).toBe('no');
    expect(reviewVerdict(r)).toEqual({ verdict: 'STRONG', decided_by: 'a tonight case against a season case' });
  });

  it('parses bare JSON, tolerates odd values, and returns null with no JSON at all', () => {
    const r = parseReview('{"picked_case":{"recent_not_season":{"answer":"YES"}},"comparison":{"stronger_case":"Picked","both_weak":"No"}}');
    expect(r.picked_case.recent_not_season.answer).toBe('yes');
    expect(r.picked_case.tonight_reason.answer).toBeNull();
    expect(r.comparison.stronger_case).toBe('picked');
    expect(parseReview('no json here')).toBeNull();
    expect(parseReview('')).toBeNull();
  });

  it('every gate fails the verdict on its own, and names itself', () => {
    const cases = [
      [(o) => { o.picked_case.recent_not_season.answer = 'no'; }, 'the picked case leans on the season, not recent work'],
      [(o) => { o.picked_case.tonight_reason.answer = 'no'; }, 'the picked case names no tonight reason'],
      [(o) => { o.comparison.both_weak = 'yes'; }, 'both cases are weak'],
      [(o) => { o.comparison.stronger_case = 'other'; }, "the other side's case is the stronger one"],
      [(o) => { o.comparison.stronger_case = 'even'; }, 'the two cases are about even'],
      [(o) => { o.outside.news_against.answer = 'yes'; }, "today's news cuts against the pick"],
    ];
    for (const [mutate, name] of cases) {
      const o = JSON.parse(passing());
      mutate(o);
      expect(reviewVerdict(parseReview(JSON.stringify(o)))).toEqual({ verdict: 'WEAK', decided_by: name });
    }
    expect(GATES).toHaveLength(6);
  });

  it('the recorded-only questions never gate', () => {
    const o = JSON.parse(passing());
    o.picked_case.other_side_answered.answer = 'no';
    o.card.carries_case_reasons.answer = 'no';
    o.card.reasons_fit_bet.answer = 'no';
    o.outside.own_read = 'Both teams have doubts.';
    expect(reviewVerdict(parseReview(JSON.stringify(o))).verdict).toBe('STRONG');
  });

  it('a missing answer on a gate is a WEAK, never a pass', () => {
    const o = JSON.parse(passing());
    delete o.outside;
    expect(reviewVerdict(parseReview(JSON.stringify(o)))).toEqual({ verdict: 'WEAK', decided_by: "today's news cuts against the pick" });
    expect(reviewVerdict(null)).toEqual({ verdict: null, decided_by: 'no review' });
  });
});

describe('winnersReviewer — reviewPick (fail-soft)', () => {
  const input = {
    league: 'MLB', deskText: 'desk', caseHome: 'h', caseAway: 'a', homeTeam: 'H', awayTeam: 'A',
    pickText: 'H ML', odds: -120, betType: 'moneyline', pickIsHome: true, rationale: 'card',
  };

  it('returns the verdict from a good answer and passes the search/effort/breaker options', async () => {
    let seen = null;
    const oneShot = async (prompt, opts) => { seen = { prompt, opts }; return { success: true, data: '```json\n' + passing() + '\n```' }; };
    const out = await reviewPick(input, { oneShot });
    expect(out.ok).toBe(true);
    expect(out.verdict).toBe('STRONG');
    expect(out.model).toBe('codex-gpt-5.6-sol');
    expect(seen.opts).toMatchObject({ search: true, effort: 'high', breakerKey: 'codex-review' });
    expect(seen.opts.systemPrompt).toBe(REVIEW_SYSTEM);
    expect(seen.prompt).toContain('PART 5');
  });

  it('never throws: a failed call, an unparseable answer, and a missing desk all come back ok:false', async () => {
    expect((await reviewPick(input, { oneShot: async () => { throw new Error('boom'); } })).ok).toBe(false);
    expect((await reviewPick(input, { oneShot: async () => ({ success: false, error: 'timed out' } ) })).error).toBe('timed out');
    expect((await reviewPick(input, { oneShot: async () => ({ success: true, data: 'nothing' }) })).error).toBe('unparseable answer');
    expect((await reviewPick({ ...input, deskText: '' }, { oneShot: async () => ({ success: true, data: passing() }) })).error).toBe('missing desk or pick');
    expect((await reviewPick({ ...input, league: 'NBA' }, { oneShot: async () => ({ success: true, data: passing() }) })).error).toBe('no checklist for NBA');
  });
});
