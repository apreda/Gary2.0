import { describe, it, expect } from 'vitest';
import {
  loadChecklist, buildBlindAsk, buildCardAsk, parseBlind, parseCard, assembleReview, reviewVerdict, reviewPick, GATES, REVIEW_SYSTEM,
} from '../../../src/services/pickdesk/winnersReviewer.js';

const HOME = 'Boston Red Sox';
const AWAY = 'Seattle Mariners';

const blindAnswer = (stronger = HOME) => JSON.stringify({
  cases: {
    [HOME]: {
      recent_not_season: { answer: 'yes', recent_claims: 6, season_claims: 1, evidence: 'last three starts: 18 IP, 3 ER' },
      tonight_reason: { answer: 'yes', evidence: 'Crochet against a lineup that is 4-for-41 vs lefties this week' },
      other_side_answered: { answer: 'no', evidence: 'the Mariners pen point goes unanswered' },
    },
    [AWAY]: {
      recent_not_season: { answer: 'no', recent_claims: 1, season_claims: 5, evidence: 'run differential +88' },
      tonight_reason: { answer: 'no', evidence: 'the better team' },
    },
  },
  comparison: { stronger_case: stronger, both_weak: 'no', evidence: 'the Red Sox case is about tonight' },
});
const cardAnswer = (news = 'no') => JSON.stringify({
  card: { carries_case_reasons: { answer: 'yes', evidence: 'the card names Crochet' }, reasons_fit_bet: { answer: 'yes', evidence: 'moneyline, who wins' } },
  outside: { news_against: { answer: news, item: news === 'yes' ? 'Crochet scratched' : '', source: news === 'yes' ? 'beat writer' : '' }, own_read: 'Nothing new since the lineups posted.' },
  decided_by: 'a tonight case against a season case',
});

const input = {
  league: 'MLB', deskText: 'THE DESK TEXT', caseHome: 'HOME CASE', caseAway: 'AWAY CASE', homeTeam: HOME, awayTeam: AWAY,
  pickText: 'Red Sox ML', odds: -118, betType: 'moneyline', pickIsHome: true, rationale: 'THE CARD', checklist: 'THE QUESTIONS PART 1 PART 5', first: 'away',
};

describe('winnersReviewer — the checklist files', () => {
  it('every league the reviewer runs on has a checklist with the five parts', () => {
    for (const lg of ['MLB', 'NFL', 'NCAAF']) {
      const text = loadChecklist(lg);
      expect(text, lg).toBeTruthy();
      for (const part of ['PART 1', 'PART 2', 'PART 3', 'PART 4', 'PART 5']) expect(text, `${lg} ${part}`).toContain(part);
    }
    expect(loadChecklist('NBA')).toBeNull();
  });
});

describe('winnersReviewer — the blind ask', () => {
  it('carries the desk and both cases by club, in the game\'s order, and never the bet, the card or a price', () => {
    const ask = buildBlindAsk(input);
    expect(ask).toContain('THE DESK TEXT');
    expect(ask.indexOf('THE CASE FOR SEATTLE MARINERS')).toBeLessThan(ask.indexOf('THE CASE FOR BOSTON RED SOX'));
    expect(ask).not.toContain('PICKED');
    expect(ask).not.toContain('Red Sox ML');
    expect(ask).not.toContain('-118');
    expect(ask).not.toContain('THE CARD');
    expect(ask).toContain('You do not know which side was bet');
    expect(ask).toContain(`"stronger_case": "${HOME}|${AWAY}|even"`);
    const homeFirst = buildBlindAsk({ ...input, first: 'home' });
    expect(homeFirst.indexOf('THE CASE FOR BOSTON RED SOX')).toBeLessThan(homeFirst.indexOf('THE CASE FOR SEATTLE MARINERS'));
  });

  it('the card ask carries the bet, the card and the blind finding', () => {
    const blind = parseBlind(blindAnswer(), HOME, AWAY);
    const ask = buildCardAsk({ ...input, blind });
    expect(ask).toContain('Red Sox ML (-118) — a moneyline bet. The picked side is Boston Red Sox.');
    expect(ask).toContain('THE CARD');
    expect(ask).toContain('Stronger case: Boston Red Sox');
    expect(ask).toContain('PART 4 and PART 5 only');
    expect(REVIEW_SYSTEM).toContain('You do not make picks');
  });
});

describe('winnersReviewer — parsing, assembling and the verdict', () => {
  it('maps the blind read onto picked/other by the side Gary bet', () => {
    const blind = parseBlind('```json\n' + blindAnswer() + '\n```', HOME, AWAY);
    expect(blind.comparison.stronger_case).toBe('home');
    const card = parseCard(cardAnswer());
    const r = assembleReview(blind, card, { homeTeam: HOME, awayTeam: AWAY, pickIsHome: true });
    expect(r.blind).toBe(true);
    expect(r.picked_case.recent_not_season.answer).toBe('yes');
    expect(r.other_case.recent_not_season.answer).toBe('no');
    expect(r.comparison.stronger_case).toBe('picked');
    expect(reviewVerdict(r)).toEqual({ verdict: 'STRONG', decided_by: 'a tonight case against a season case' });
    // the same blind read, Gary bet the other side → the blind read found the OTHER case stronger
    const r2 = assembleReview(blind, card, { homeTeam: HOME, awayTeam: AWAY, pickIsHome: false });
    expect(r2.comparison.stronger_case).toBe('other');
    expect(r2.picked_case.recent_not_season.answer).toBe('no');
    expect(reviewVerdict(r2).verdict).toBe('WEAK');
  });

  it('reads the stronger club by a partial name and treats even as even', () => {
    expect(parseBlind(blindAnswer('Red Sox'), HOME, AWAY).comparison.stronger_case).toBe('home');
    expect(parseBlind(blindAnswer('Mariners'), HOME, AWAY).comparison.stronger_case).toBe('away');
    expect(parseBlind(blindAnswer('even'), HOME, AWAY).comparison.stronger_case).toBe('even');
    expect(parseBlind(blindAnswer('Yankees'), HOME, AWAY).comparison.stronger_case).toBeNull();
    expect(parseBlind('no json', HOME, AWAY)).toBeNull();
    expect(parseCard('no json')).toBeNull();
  });

  it('every gate fails the verdict on its own, and names itself', () => {
    const base = () => assembleReview(parseBlind(blindAnswer(), HOME, AWAY), parseCard(cardAnswer()), { homeTeam: HOME, awayTeam: AWAY, pickIsHome: true });
    const cases = [
      [(r) => { r.picked_case.recent_not_season.answer = 'no'; }, 'the picked case leans on the season, not recent work'],
      [(r) => { r.picked_case.tonight_reason.answer = 'no'; }, 'the picked case names no tonight reason'],
      [(r) => { r.comparison.both_weak = 'yes'; }, 'both cases are weak'],
      [(r) => { r.comparison.stronger_case = 'other'; }, "the blind read found the other side's case stronger"],
      [(r) => { r.comparison.stronger_case = 'even'; }, 'the blind read found the two cases about even'],
      [(r) => { r.outside.news_against.answer = 'yes'; }, "today's news cuts against the pick"],
    ];
    for (const [mutate, name] of cases) {
      const r = base();
      mutate(r);
      expect(reviewVerdict(r)).toEqual({ verdict: 'WEAK', decided_by: name });
    }
    expect(GATES).toHaveLength(6);
    const r = base();
    r.picked_case.other_side_answered.answer = 'no';
    r.card.carries_case_reasons.answer = 'no';
    r.card.reasons_fit_bet.answer = 'no';
    expect(reviewVerdict(r).verdict).toBe('STRONG'); // recorded-only questions never gate
    expect(reviewVerdict(null)).toEqual({ verdict: null, decided_by: 'no review' });
  });
});

describe('winnersReviewer — reviewPick (two calls, fail-soft)', () => {
  it('call one is blind and without search; call two carries the bet with search on', async () => {
    const seen = [];
    const oneShot = async (prompt, opts) => {
      seen.push({ prompt, opts });
      return { success: true, data: seen.length === 1 ? blindAnswer() : cardAnswer() };
    };
    const out = await reviewPick(input, { oneShot });
    expect(out.ok).toBe(true);
    expect(out.verdict).toBe('STRONG');
    expect(out.model).toBe('codex-gpt-5.6-sol');
    expect(seen).toHaveLength(2);
    expect(seen[0].opts.search).toBe(false);
    expect(seen[0].prompt).not.toContain('Red Sox ML');
    expect(seen[1].opts.search).toBe(true);
    expect(seen[1].prompt).toContain('Red Sox ML');
    expect(seen[0].opts.breakerKey).toBe('codex-review');
  });

  it('when the blind read favours the other side, the pick is WEAK even with a clean card', async () => {
    let n = 0;
    const oneShot = async () => ({ success: true, data: ++n === 1 ? blindAnswer(AWAY) : cardAnswer() });
    const out = await reviewPick(input, { oneShot });
    expect(out.ok).toBe(true);
    expect(out.verdict).toBe('WEAK');
    expect(out.decided_by).toBe("the blind read found the other side's case stronger");
  });

  it('never throws: a failed or unparseable call comes back ok:false, naming the call', async () => {
    expect((await reviewPick(input, { oneShot: async () => { throw new Error('boom'); } })).ok).toBe(false);
    expect((await reviewPick(input, { oneShot: async () => ({ success: false, error: 'timed out' }) })).error).toBe('blind read: timed out');
    expect((await reviewPick(input, { oneShot: async () => ({ success: true, data: 'nothing' }) })).error).toBe('blind read: unparseable answer');
    let n = 0;
    expect((await reviewPick(input, { oneShot: async () => (++n === 1 ? { success: true, data: blindAnswer() } : { success: false, error: 'down' }) })).error).toBe('card read: down');
    expect((await reviewPick({ ...input, deskText: '' }, { oneShot: async () => ({ success: true, data: blindAnswer() }) })).error).toBe('missing desk or pick');
    expect((await reviewPick({ ...input, league: 'NBA', checklist: null }, { oneShot: async () => ({ success: true, data: blindAnswer() }) })).error).toBe('no checklist for NBA');
  });
});
