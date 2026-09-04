import { describe, it, expect, vi } from 'vitest';
import {
  loadChecklist, buildBlindAsk, buildCardAsk, parseBlind, parseCard, assembleReview,
  reviewVerdict, reviewPick, reviewProp, GATES, REVIEW_SYSTEM, REVIEW_POLICY_VERSION,
} from '../../../src/services/pickdesk/winnersReviewer.js';

const HOME = 'Boston Red Sox';
const AWAY = 'Seattle Mariners';
const yes = (evidence = 'Quoted supporting fact, source desk, dated September 4.') => ({ answer: 'yes', evidence });
const no = (evidence = 'The original decision explicitly addresses this uncertainty.') => ({ answer: 'no', evidence });
const caseAnswer = () => ({
  evidence_in_context: yes('The case labels its 2026 season sample and four recent starts separately.'),
  matchup_reason: yes('The case connects the supplied opponent split and this matchup.'),
  other_side_answered: yes('The case addresses the opposing bullpen evidence.'),
  strongest_point: 'The dated opponent split in the source desk.',
});
const blindObject = (stronger = HOME) => ({
  cases: { [HOME]: caseAnswer(), [AWAY]: caseAnswer() },
  comparison: { stronger_case: stronger, both_weak: 'no', evidence: 'Diagnostic comparison of the arguments.' },
});
const cardObject = () => ({
  card: {
    carries_case_reasons: yes(),
    decisive_facts_supported: yes(),
    evidence_in_context: yes(),
    reasons_fit_bet: yes('The decision addresses winning outright on this moneyline.'),
    price_addressed: yes('The original decision relates its supported case to this offered price.'),
    other_side_answered: yes('The card answers the opposing bullpen point with the original workload evidence.'),
    central_assumption_unresolved: no(),
  },
  outside: {
    news_checked: yes('Dated pregame sources checked, with no new contradiction found.'),
    news_against: { answer: 'no', item: '', source: '' },
    own_read: 'Ordinary game uncertainty remains.',
  },
  decided_by: 'The existing exact-ticket case meets the evidence checks.',
});
const input = {
  league: 'MLB', deskText: 'SOURCE DESK: the dated original facts, price and opposing bullpen workload.',
  caseHome: 'HOME ORIGINAL CASE', caseAway: 'AWAY ORIGINAL CASE', homeTeam: HOME, awayTeam: AWAY,
  pickText: 'Red Sox ML', odds: -118, betType: 'moneyline', pickIsHome: true,
  rationale: 'THE ORIGINAL CARD', first: 'away', gameDate: '2026-09-04',
  commenceTime: '2026-09-04T23:10:00Z', observedAt: '2026-09-04T19:00:00Z',
};
const prop = {
  league: 'MLB', deskText: 'ORIGINAL PROP BOARD AND PLAYER SHEETS', pickText: 'Jane Player under 5.5 strikeouts',
  playerName: 'Jane Player', propType: 'strikeouts', side: 'under', line: 5.5, odds: -145,
  rationale: 'The original prop decision and opposing evidence.',
};
const assemble = (blind = blindObject(), card = cardObject(), data = input) =>
  assembleReview(parseBlind(JSON.stringify(blind), HOME, AWAY), parseCard(JSON.stringify(card)), data);
const answers = (blind = blindObject(), card = cardObject()) => vi.fn()
  .mockResolvedValueOnce({ success: true, data: JSON.stringify(blind) })
  .mockResolvedValueOnce({ success: true, data: JSON.stringify(card) });

describe('Winners exact-ticket prompts', () => {
  it('keeps each league checklist while retiring blanket recent-over-season preference', () => {
    for (const league of ['MLB', 'NFL', 'NCAAF']) {
      const text = loadChecklist(league);
      for (const part of ['PART 1', 'PART 2', 'PART 3', 'PART 4', 'PART 5']) expect(text).toContain(part);
      expect(text).toContain('Recent evidence and season evidence can both be useful');
      expect(text).toContain('Neither receives automatic preference');
      expect(text).not.toContain('Yes only when recent work carries the case');
    }
    expect(loadChecklist('NCAAF')).toContain('actual games represented');
    expect(loadChecklist('NFL')).toContain('lack of three recent regular-season games is not itself a reason to fail');
    expect(loadChecklist('NBA')).toBeNull();
  });

  it('preserves case order and omits the selected ticket/card from the blind call', () => {
    const ask = buildBlindAsk(input);
    expect(ask).toContain(input.deskText);
    expect(ask.indexOf('THE CASE FOR SEATTLE')).toBeLessThan(ask.indexOf('THE CASE FOR BOSTON'));
    expect(ask).not.toContain(input.pickText);
    expect(ask).not.toContain(input.rationale);
    expect(ask).not.toContain('-118');
    expect(ask).toContain('Repetition across cases or news stories is not independent support');
    expect(buildBlindAsk({ ...input, first: 'home' }).indexOf('THE CASE FOR BOSTON'))
      .toBeLessThan(buildBlindAsk({ ...input, first: 'home' }).indexOf('THE CASE FOR SEATTLE'));
  });

  it('gives the ticket check the full original desk, cases, price and timing', () => {
    const ask = buildCardAsk({ ...input, blind: parseBlind(JSON.stringify(blindObject()), HOME, AWAY) });
    for (const value of [input.deskText, input.caseHome, input.caseAway, input.rationale, '-118', input.commenceTime, input.observedAt]) expect(ask).toContain(value);
    expect(ask).toContain('No numerical probability or calculated edge is required');
    expect(ask).toContain('before this review and before kickoff');
    expect(ask).toContain('Do not supply a missing rebuttal for the picker');
    expect(REVIEW_SYSTEM).toContain('You do not make picks');
    expect(REVIEW_SYSTEM).toContain('Do not infer probability');
  });

  it('carries the exact signed spread and exact prop outcome without borrowing a win case', () => {
    expect(buildCardAsk({ ...input, betType: 'spread', betLine: -1.5, pickText: 'Red Sox -1.5' })).toContain('"line":-1.5');
    const ask = buildCardAsk({ ...prop, ticketKind: 'prop' });
    expect(ask).toContain('"side":"under"');
    expect(ask).toContain('"line":5.5');
    expect(ask).toContain('No blind team comparison for a player prop');
    expect(ask).toContain(prop.deskText);
  });
});

describe('Winners v2 decisions', () => {
  it('records schema and blind mapping without requiring the selected side to win the comparison', () => {
    const review = assemble(blindObject(AWAY));
    expect(review.schema_version).toBe(2);
    expect(review.policy_version).toBe(REVIEW_POLICY_VERSION);
    expect(review.comparison.stronger_case).toBe('other');
    expect(review.evidence_as_of).toBe(input.observedAt);
    expect(reviewVerdict(review)).toEqual({ verdict: 'STRONG', status: 'qualified', decided_by: cardObject().decided_by });
    expect(reviewVerdict(assemble(blindObject('even'))).verdict).toBe('STRONG');
  });

  it('allows a supported season-based case, an underdog and organic confidence without using them as gates', () => {
    const review = assemble(blindObject(HOME), cardObject(), { ...input, pickIsHome: false, pickText: 'Mariners ML', odds: 150, confidence: 0.43 });
    expect(review.picked_case.evidence_in_context.evidence).toContain('2026 season');
    expect(review.comparison.stronger_case).toBe('other');
    expect(reviewVerdict(review).status).toBe('qualified');
    review.confidence = 0.99;
    expect(reviewVerdict(review).status).toBe('qualified');
  });

  it('rejects each complete failed check separately, including previously recorded-only questions', () => {
    for (const [reason, get, expected] of GATES) {
      const review = assemble();
      const node = get(review);
      node.answer = expected === 'yes' ? 'no' : 'yes';
      if ('item' in node) Object.assign(node, { item: 'A new pregame fact contradicts the premise.', source: 'https://team.example/news September 4, 2026' });
      expect(reviewVerdict(review), reason).toEqual({ verdict: 'WEAK', status: 'rejected', decided_by: reason });
    }
  });

  it('does not admit unknown answers, missing evidence, incomplete search or legacy reviews', () => {
    for (const [, get] of GATES) {
      const review = assemble();
      get(review).answer = null;
      expect(reviewVerdict(review)).toMatchObject({ verdict: null, status: 'unavailable' });
    }
    const review = assemble();
    review.card.decisive_facts_supported.evidence = '';
    expect(reviewVerdict(review).status).toBe('unavailable');
    expect(reviewVerdict({ ...assemble(), schema_version: 1 }).status).toBe('unavailable');
    expect(reviewVerdict(null).status).toBe('unavailable');
    // A failed question elsewhere does not disguise an incomplete review as a completed rejection.
    review.card.reasons_fit_bet.answer = 'no';
    expect(reviewVerdict(review).status).toBe('unavailable');
  });

  it('distinguishes an unresolved central premise from ordinary outcome uncertainty', () => {
    const review = assemble();
    expect(review.outside.own_read).toBe('Ordinary game uncertainty remains.');
    expect(reviewVerdict(review).status).toBe('qualified');
    review.card.central_assumption_unresolved = { answer: 'yes', evidence: 'The case needs a starter length that the source never establishes.' };
    expect(reviewVerdict(review).decided_by).toBe('a central assumption remains unresolved');
  });

  it('parses partial team names but refuses ambiguous/empty club mappings and malformed outputs', () => {
    expect(parseBlind(JSON.stringify(blindObject('Red Sox')), HOME, AWAY).comparison.stronger_case).toBe('home');
    expect(parseBlind(JSON.stringify(blindObject('Mariners')), HOME, AWAY).comparison.stronger_case).toBe('away');
    expect(parseBlind(JSON.stringify(blindObject('')), HOME, AWAY).comparison.stronger_case).toBeNull();
    expect(parseBlind('{}', HOME, AWAY)).toBeNull();
    expect(parseBlind('no json', HOME, AWAY)).toBeNull();
    expect(parseCard('{}')).toBeNull();
    expect(parseCard('no json')).toBeNull();
  });
});

describe('Winners game and prop review API', () => {
  it('runs games in two calls with original evidence on both, Sol, high effort and only the final call searching', async () => {
    const oneShot = answers();
    const out = await reviewPick(input, { oneShot });
    expect(out).toMatchObject({ ok: true, verdict: 'STRONG', status: 'qualified', policy_version: REVIEW_POLICY_VERSION, model: 'codex-gpt-5.6-sol' });
    expect(oneShot).toHaveBeenCalledTimes(2);
    const [first, final] = oneShot.mock.calls;
    expect(first[0]).not.toContain(input.pickText);
    expect(first[1]).toMatchObject({ search: false, model: 'gpt-5.6-sol', effort: 'high', breakerKey: 'codex-review' });
    expect(final[0]).toContain(input.deskText);
    expect(final[0]).toContain(input.pickText);
    expect(final[1].search).toBe(true);
  });

  it('reviews a core prop once against its source desk with the same gates', async () => {
    const oneShot = vi.fn().mockResolvedValue({ success: true, data: JSON.stringify(cardObject()) });
    const out = await reviewProp(prop, { oneShot });
    expect(oneShot).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ ok: true, verdict: 'STRONG', status: 'qualified' });
    expect(out.review).toMatchObject({ blind: false, ticket: { kind: 'prop', player_name: 'Jane Player', line: 5.5, side: 'under', odds: -145 } });
    expect(oneShot.mock.calls[0][0]).toContain(prop.deskText);
    expect(oneShot.mock.calls[0][1].search).toBe(true);
    const bad = cardObject();
    bad.card.reasons_fit_bet = { answer: 'no', evidence: 'The card argues for the over, but the ticket is under 5.5.' };
    oneShot.mockResolvedValue({ success: true, data: JSON.stringify(bad) });
    expect((await reviewProp(prop, { oneShot })).status).toBe('rejected');
  });

  it('leaves failed or incomplete reviews unavailable and never throws', async () => {
    expect((await reviewPick(input, { oneShot: async () => { throw new Error('boom'); } })).error).toBe('boom');
    expect((await reviewPick(input, { oneShot: async () => ({ success: false, error: 'timed out' }) })).error).toBe('blind read: timed out');
    expect((await reviewPick(input, { oneShot: async () => ({ success: true, data: '{}' }) })).error).toBe('blind read: unparseable answer');
    const unknown = cardObject();
    unknown.card.decisive_facts_supported.answer = 'unknown';
    const out = await reviewPick(input, { oneShot: answers(blindObject(), unknown) });
    expect(out).toMatchObject({ ok: true, status: 'unavailable', verdict: null });
    expect(out.review.card.decisive_facts_supported.answer).toBeNull();
    const incompleteBlind = blindObject();
    delete incompleteBlind.cases[AWAY];
    const oneShot = answers(incompleteBlind);
    expect((await reviewPick(input, { oneShot })).error).toBe('blind read: incomplete case evidence');
    expect(oneShot).toHaveBeenCalledTimes(1);
  });

  it('refuses incomplete tickets before making model calls', async () => {
    const oneShot = vi.fn();
    for (const change of [{ odds: null }, { odds: 0 }, { rationale: '' }, { deskText: '' }, { caseAway: '' }, { pickIsHome: null }, { betType: 'spread', pickText: 'Red Sox' }, { betType: 'total' }]) {
      expect((await reviewPick({ ...input, ...change }, { oneShot })).status).toBe('unavailable');
    }
    for (const change of [{ line: null }, { side: 'yes' }, { playerName: '' }, { propType: '' }, { deskText: '' }]) {
      expect((await reviewProp({ ...prop, ...change }, { oneShot })).status).toBe('unavailable');
    }
    expect(oneShot).not.toHaveBeenCalled();
    expect((await reviewPick({ ...input, league: 'NBA' }, { oneShot })).error).toBe('no checklist for NBA');
  });

  it('retains line zero and parses legacy signed spread text without treating odds as the line', async () => {
    const out = await reviewPick({ ...input, betType: 'spread', betLine: 0 }, { oneShot: answers() });
    expect(out.review.ticket.line).toBe(0);
    const textLine = await reviewPick({ ...input, betType: 'spread', pickText: 'Red Sox -1.5' }, { oneShot: answers() });
    expect(textLine.review.ticket.line).toBe(-1.5);
    const priceOnly = await reviewPick({ ...input, betType: 'spread', pickText: 'Red Sox -118' }, { oneShot: vi.fn() });
    expect(priceOnly.error).toBe('missing exact spread line');
  });
});
