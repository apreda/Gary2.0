import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fallbackReasonPair,
  fallbackVerbatimPair,
  isStandaloneSentence,
  isReasonSentence,
  isSafeReasonPair,
  isVerbatimSnippet,
  reasonCandidates,
  splitSentences,
} from '../../supabase/functions/_shared/verbatimSnippets.js';

const composerSrc = readFileSync(
  new URL('../../supabase/functions/social-auto-post/index.ts', import.meta.url),
  'utf8',
);

// Founder directive (Aug 17 2026): pick tweets use ONLY Gary's own words —
// whole sentences copied verbatim from the stored pick rationale. The model
// SELECTS sentences; it never writes, edits, shortens, or paraphrases. The
// app and the feed are literally the same Gary.

const RATIONALE = [
  'Saturday night in Anaheim, the marine layer settling over the outfield and two last-place clubs playing loose.',
  'St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.',
  'These teams are too close for the Royals to be priced like a 41% proposition, so I’m taking the full plus-money swing.',
].join('\n\n');

describe('splitSentences', () => {
  it('never splits on St., decimals, or other abbreviation periods', () => {
    const s = splitSentences(RATIONALE);
    expect(s).toHaveLength(3);
    expect(s[1]).toBe('St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.');
  });

  it('splits normal multi-sentence paragraphs and drops empties', () => {
    expect(splitSentences('One here. Two there! Three?')).toEqual(['One here.', 'Two there!', 'Three?']);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
});

describe('isVerbatimSnippet', () => {
  it('accepts exact sentences and tolerates only whitespace differences', () => {
    expect(isVerbatimSnippet(RATIONALE, 'St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.')).toBe(true);
    expect(isVerbatimSnippet(RATIONALE, 'St. Louis scored 19 runs  over two games and Kent Emanuel carries a 3.21 ERA at AAA.')).toBe(true);
  });

  it('rejects any rewording, however close', () => {
    expect(isVerbatimSnippet(RATIONALE, 'St. Louis scored 19 runs over two games and has the fresher bullpen.')).toBe(false);
    expect(isVerbatimSnippet(RATIONALE, '')).toBe(false);
  });
});

describe('fallbackVerbatimPair', () => {
  it('returns two distinct verbatim sentences within the budget', () => {
    const pair = fallbackVerbatimPair(RATIONALE, 260);
    expect(pair).not.toBe(null);
    expect(isVerbatimSnippet(RATIONALE, pair.opening)).toBe(true);
    expect(isVerbatimSnippet(RATIONALE, pair.closing)).toBe(true);
    expect(pair.opening).not.toBe(pair.closing);
    expect(pair.opening.length + pair.closing.length).toBeLessThanOrEqual(260);
  });

  it('falls back to a single sentence when no pair fits, and never truncates', () => {
    const pair = fallbackVerbatimPair(RATIONALE, 120);
    expect(pair).not.toBe(null);
    expect(pair.closing).toBe('');
    expect(isVerbatimSnippet(RATIONALE, pair.opening)).toBe(true);
  });

  it('returns null when nothing fits rather than inventing or cutting words', () => {
    expect(fallbackVerbatimPair(RATIONALE, 10)).toBe(null);
    expect(fallbackVerbatimPair('', 260)).toBe(null);
  });
});

describe('reasonCandidates', () => {
  const R = [
    'Monday night at PNC Park, overcast sky, light breeze toward right, and two clubs trying to keep a fading playoff path alive.',
    'Tarik Skubal has allowed two earned runs over his last 19 innings and the Pirates are hitting .211 against lefties.',
    'The -153 is too much for an Angels team that has lost all six of his latest starts.',
    'At -105, I\u2019ll put the $100 on Detroit to win outright.',
  ].join('\n\n');

  it('drops stake and wager-declaration sentences — the pick line already says the bet', () => {
    const kept = reasonCandidates(R);
    expect(kept.some((s) => s.includes('$100'))).toBe(false);
    expect(kept.some((s) => s.includes('put the'))).toBe(false);
  });

  it('drops EVERY priced sentence whole — no price talk reaches the feed (founder, Aug 26)', () => {
    // Supersedes the old price-critique carve-out. The verbatim law forbids
    // editing Gary's sentences, so a priced sentence is excluded, never scrubbed.
    const kept = reasonCandidates(R);
    expect(kept.some((s) => /[-+]\d{3,4}\b/.test(s))).toBe(false);
    expect(reasonCandidates('He cashes at plus money more often than not. The lineup is the reason tonight.'))
      .toEqual(['The lineup is the reason tonight.']);
  });

  it('fallbackReasonPair prefers stat-bearing reasons over the scene-setting opener', () => {
    const pair = fallbackReasonPair(R, 300);
    expect(pair).not.toBe(null);
    expect(pair.opening.includes('PNC Park')).toBe(false);
    expect(pair.opening.includes('19 innings') || pair.closing.includes('19 innings')).toBe(true);
    expect(isVerbatimSnippet(R, pair.opening)).toBe(true);
    expect(pair.closing === '' || isVerbatimSnippet(R, pair.closing)).toBe(true);
  });

  it('never truncates: an unfittable candidate set falls back rather than cutting words', () => {
    expect(fallbackReasonPair(R, 10)).toBe(null);
  });

  it('section headings never reach a tweet line (Aug 24: "Gary\'s Take" posted as a closing during the Gemini outage)', () => {
    const card = [
      'I’m laying 1.5 runs with the Phillies at even money because the strongest edges in my read all point toward separation rather than another coin-flip finish.',
      "Gary's Take",
      'The bullpen carries a 3.43 ERA and 1.21 WHIP, compared with a 3.71 ERA and 1.25 WHIP for the other side.',
    ].join('\n\n');
    const cands = reasonCandidates(card);
    expect(cands.some((s) => /gary'?s take/i.test(s))).toBe(false);
    // Even with a budget so tight only the tiny heading would fit as a
    // closing, the pair must never include it.
    const long = fallbackReasonPair(card, 200);
    if (long) {
      expect(/gary'?s take/i.test(long.opening)).toBe(false);
      expect(/gary'?s take/i.test(long.closing)).toBe(false);
    }
  });

  it('keeps a fitting thesis even when only two shorter statistics can pair', () => {
    const thesis = 'I’m backing Pittsburgh because the starting-pitching advantage is substantial enough without asking for a run line.';
    const card = ['Jobe has a 6.23 ERA.', 'Skenes has a .649 OPS allowed.', thesis].join('\n');
    expect(fallbackReasonPair(card, thesis.length)).toEqual({ opening: thesis, closing: '' });
  });

  it('tries a later whole thesis when the first cannot fit, and ranks a lone fallback consistently', () => {
    const thesis = 'My read favors Pittsburgh because Skenes controls the matchup.';
    const tooLong = 'I’m backing Pittsburgh because ' + 'the pitching advantage is substantial '.repeat(8) + 'today.';
    expect(fallbackReasonPair([tooLong, 'Jobe has a 6.23 ERA.', thesis].join('\n'), thesis.length))
      .toEqual({ opening: thesis, closing: '' });
    expect(fallbackReasonPair('A showdown awaits.\nJobe has a 6.23 ERA.', 25))
      .toEqual({ opening: 'Jobe has a 6.23 ERA.', closing: '' });
  });

  it('recognizes a third-person argument and keeps its nearby evidence over unrelated dense stats', () => {
    const thesis = 'Atlanta’s lineup has a more useful handedness advantage against Sánchez than Philadelphia’s has against Sale.';
    const evidence = 'Sánchez has allowed a .737 OPS to right-handed hitters compared with .357 to lefties.';
    const card = `${thesis} ${evidence}\n\nHarper has a 1.186 OPS, Turner a .630 OPS, and Schwarber an .899 OPS.`;
    expect(fallbackReasonPair(card, 265)).toEqual({ opening: thesis, closing: evidence });
  });

  it('excludes an argument that needs missing pieces and does not promote an objection paragraph', () => {
    for (const sentence of [
      'My read is that those pieces will sustain the offense.',
      'I expect that difference to matter repeatedly as possessions accumulate.',
      'My judgment is that those returning pieces can support sustained possessions.',
      'I expect that uneven batting order to give Drohan opportunities to contain damage.',
      'The assumptions are consequential.',
      'Alvarado and Tur offer alternatives.',
    ]) expect(isReasonSentence(sentence)).toBe(false);
    const card = 'The strongest argument against the bet is Pallante’s pitching. Feltner could give St. Louis an early advantage.\n\nColorado has the stronger finish available in Romano.';
    expect(fallbackReasonPair(card, 100).opening).toBe('Colorado has the stronger finish available in Romano.');
  });

  it('the argument leads (founder, Aug 19): a stance sentence opens, the stat-dense reason closes', () => {
    const card = [
      'The rubber match is set at PNC Park, with two arms carrying very different certainty.',
      'Skenes has held left-handed hitters to a .649 OPS, an important matchup against a lineup with five left-handed bats.',
      'I’m backing Pittsburgh on the moneyline because the starting-pitching advantage is substantial enough without asking for a run line.',
      'Jobe has worked only 8.2 innings in two starts, producing a 6.23 ERA.',
    ].join('\n\n');
    const pair = fallbackReasonPair(card, 400);
    expect(pair.opening.startsWith('I’m backing Pittsburgh')).toBe(true);
    expect(pair.closing.includes('8.2 innings') || pair.closing.includes('.649 OPS')).toBe(true);
    expect(pair.opening.includes('PNC Park')).toBe(false);
  });
});

describe('composer wiring', () => {
  it('selects verbatim sentences instead of writing angle/edge prose', () => {
    expect(composerSrc).toContain('VERBATIM_RULES');
    expect(composerSrc).toContain('isSafeReasonPair(');
    expect(composerSrc).toContain('reasonCandidates(');
    expect(composerSrc).toContain('fallbackReasonPair(');
    expect(composerSrc).not.toContain('PICK_HOOK_SCHEMA');
    expect(composerSrc).not.toContain('Write the hook for a single bet');
  });
});

describe('September 3–4 published copy regressions', () => {
  const tornRangers = 'Over his last three starts, he has worked 19.0 innings with 3 ER, 19 K and 0 BB, and his five home starts have produced a 1.20 ERA over 30.0 innings.';
  const tornBrewers = 'Bauers’ .869 OPS against right-handed pitching fits that opportunity, while Chourio and Contreras bring recent production from the other side.';
  const tornTech = 'In that uncertainty, Georgia Tech has the more dependable foundation for controlling the game.';
  const tornBullpen = 'Its bullpen owns a 3.10 ERA over the last 10 days and delivered five scoreless innings Wednesday; Chicago’s bullpen has a 7.58 ERA over that span, with Jacob Webb’s fresh right-forearm contusion adding uncertainty.';
  const safe = 'Cleveland owns the better bullpen, and that is the primary risk.';

  it.each([tornRangers, tornBrewers, tornTech, tornBullpen])('rejects the actual context-dependent published sentence: %s', (sentence) => {
    expect(isStandaloneSentence(sentence)).toBe(false);
    expect(reasonCandidates(sentence)).toEqual([]);
    expect(fallbackReasonPair(sentence, 278)).toBeNull();
    expect(isSafeReasonPair(sentence, { opening: sentence, closing: '' }, 278)).toBe(false);
  });

  it('does not treat later names or capitalized stats as the missing subject', () => {
    expect(isStandaloneSentence('Over his last three starts, ERA and WHIP fell against Detroit.')).toBe(false);
    expect(isStandaloneSentence('With 12 K and 2 BB, his control improved.')).toBe(false);
    expect(isStandaloneSentence('Vásquez has 12 K over his last two starts.')).toBe(true);
    expect(isStandaloneSentence('St. Louis has won three of its last four games.')).toBe(true);
  });

  it('keeps a useful risk sentence and named in-sentence references intact', () => {
    expect(isStandaloneSentence(safe)).toBe(true);
    expect(isStandaloneSentence('Detmers has allowed one run across his last 20 innings.')).toBe(true);
  });

  it('a single safe sentence survives both model selection and fallback without unsafe padding', () => {
    const card = `${tornRangers}\n\n${safe}\n\nThe price is -140.\n\nGary's Take`;
    expect(reasonCandidates(card)).toEqual([safe]);
    const pair = fallbackReasonPair(card, 278);
    expect(pair).toEqual({ opening: safe, closing: '' });
    expect(isSafeReasonPair(card, pair, 278)).toBe(true);
    expect(isSafeReasonPair(card, { opening: safe, closing: 'The price is -140.' }, 278)).toBe(false);
  });

  it('zero approved candidates cannot escape through the old unrestricted fallback', () => {
    const card = "Gary's Take\n\nThe price is -140.\n\nHe has a 2.10 ERA.";
    expect(fallbackReasonPair(card, 278)).toBeNull();
    expect(isSafeReasonPair(card, { opening: "Gary's Take", closing: '' }, 278)).toBe(false);
  });

  it('the final boundary rejects fragments, rewritten claims, duplicates and over-budget copy', () => {
    const card = `${safe} Detmers has allowed one run across his last 20 innings.`;
    expect(isSafeReasonPair(card, { opening: 'Detmers has allowed one run.', closing: '' }, 278)).toBe(false);
    expect(isSafeReasonPair(card, { opening: safe.replace('better', 'best'), closing: '' }, 278)).toBe(false);
    expect(isSafeReasonPair(card, { opening: safe, closing: safe }, 278)).toBe(false);
    expect(isSafeReasonPair(card, { opening: safe, closing: '' }, safe.length - 1)).toBe(false);
  });
});

describe('standalone-sentence gate (founder, Aug 26 — the Pirates tweet)', () => {
  it('drops the exact torn-context opener that reached the feed', () => {
    expect(isStandaloneSentence('But the price compensates for those advantages, while the starting-pitcher platoon matchup points toward Pittsburgh.')).toBe(false);
  });

  it('drops unresolved third-person sentences and keeps named ones', () => {
    expect(isStandaloneSentence('He has completed six innings once since returning.')).toBe(false);
    expect(isStandaloneSentence('Their bullpen coughed it up late again.')).toBe(false);
    expect(isStandaloneSentence('Chandler has allowed a 5.6% barrel rate and 38.3% hard-hit rate; Vásquez sits at 10.3% and 43.9%.')).toBe(true);
    expect(isStandaloneSentence('Holmes has been effective overall, but he has made only three starts since returning from an 85-day absence.')).toBe(true);
  });

  it('keeps Gary first-person stance sentences — I and my are never unresolved', () => {
    expect(isStandaloneSentence("I'm backing Arizona straight up.")).toBe(true);
    expect(isStandaloneSentence('My read is that Baltimore keeps this close through Bassitt.')).toBe(true);
  });

  it('price prose is price talk — the read reaches the feed, never the number', () => {
    const kept = reasonCandidates('The price compensates for those edges tonight. Milwaukee is 26-12 against left-handed starters.');
    expect(kept).toEqual(['Milwaukee is 26-12 against left-handed starters.']);
  });
});
