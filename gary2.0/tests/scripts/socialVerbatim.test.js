import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fallbackReasonPair,
  fallbackVerbatimPair,
  isConcreteFactSentence,
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

const september7Picks = JSON.parse(readFileSync(
  new URL('../fixtures/social-rationales-2026-09-07.json', import.meta.url), 'utf8',
));

describe('September 7 factual tweet wording', () => {
  it.each([
    'Minnesota’s rested late-inning group tips this close matchup for me.',
    'Minnesota’s rested late-inning group tips this close matchup.',
    'The Royals have a more favorable route through their pitching staff today.',
    'Cantillo’s recent walks are the deciding factor because of who can capitalize on them today.',
    'The deciding matchup is ECU’s established defensive front against Alabama’s new offensive line.',
    'Minnesota’s lineup is the reason tonight.',
    'Bradley gives Minnesota the stronger recent starting-pitcher case: 27 strikeouts against 7 walks over his last three starts.',
    'Every Angels reliever had yesterday off, which gives Los Angeles flexibility after his departure.',
    'Boston still has rested relief options, particularly Whitlock; this bet does not depend on Chapman being unavailable.',
    'San Diego has specific hitters who can make that inefficiency costly: Irvin has allowed a .815 OPS to right-handed batters, while France and Campusano carry .892 and .876 OPS against right-handed pitching.',
    'I expect SMU to score 35 points against Florida State.',
    'If SMU converts 50% of its third downs, Florida State could struggle to keep pace.',
    'Covering -49.5 requires that possession advantage to keep producing points throughout the game.',
    'An afternoon opener in Austin puts No. 5 Texas against a Texas State program beginning its Pac-12 era.',
    'Across the field, Oregon State begins a new coaching era at an 11 a.m. Central kickoff, with Braden Atkinson taking over the offense.',
    'A confirmed declaration that Bednar cannot pitch would make me reconsider the ticket, because Rodón’s recent length makes that closing option especially important.',
    'Ryan has not shown enough for me to dismiss the workload risk.',
    'Minnesota’s manager said, “The workload is the deciding factor for me.”',
    'Taylor and Smith both last pitched Friday, so Chicago has strong options.',
    'Bowlan also sat Sunday, so Philadelphia has options.',
    'McCarthy has a specific opening against Leahy’s most-used pitch: he has slugged .632 against four-seamers, while Leahy’s four-seamer has allowed a .438 xwOBA.',
    'New Mexico State converted 10 of 17 third downs, repeatedly finding quick slants, curls and outs against generous cushions.',
    'Atlanta hosts two substantial rebuilds, with Auburn beginning a new coaching era and Baylor unveiling a new quarterback and defensive system.',
    'Four starters return to operate under the same head coach in an offense built around option decisions.',
    'Lefties went 6-for-16 in his latest start and 6-for-14 the start before, with a homer in each.',
  ])('excludes commentary whole even when it is exact source text: %s', sentence => {
    expect(isConcreteFactSentence(sentence)).toBe(false);
    expect(reasonCandidates(sentence)).toEqual([]);
    expect(fallbackReasonPair(sentence, 400)).toBeNull();
    expect(isSafeReasonPair(sentence, { opening: sentence, closing: '' }, 400)).toBe(false);
  });

  it.each([
    'Gómez, Hoffman and Minter all sat Sunday after throwing seven, 17 and 18 pitches Saturday.',
    'Pearson and Cruz last pitched September 3, while Kimbrel sat Sunday after working Saturday.',
    'Law opens today after Garcia, Morillo, Ginkel and Loáisiga all pitched Saturday and Sunday.',
    'Drew Mestemaker, Caleb Hawkins and Wyatt Young played in Morris’ North Texas offense last season.',
    'Arizona’s confirmed lineup consists of right-handed and switch hitters.',
    'Sánchez has allowed a .737 OPS to right-handed hitters compared with .357 to lefties.',
    'Zeon Chriss-Gremillion brings 992 career rushing yards and 10 rushing touchdowns.',
    'Coastal surrendered 286 rushing yards against James Madison last season and has since rebuilt its defensive front with 12 newcomers among 16 linemen.',
    'Alabama replaced all five starters after finishing last season with 48 combined rushing yards against Georgia, Oklahoma and Indiana.',
    'Every Angels reliever had yesterday off.',
    'Washington brings back 11 defenders who started at least one game in 2025, when its defense finished the regular season No. 11 nationally against the run.',
  ])('keeps original observed facts with or without digits: %s', sentence => {
    expect(isConcreteFactSentence(sentence)).toBe(true);
    expect(reasonCandidates(sentence)).toEqual([sentence]);
    expect(fallbackReasonPair(sentence, 400)).toEqual({ opening: sentence, closing: '' });
    expect(isSafeReasonPair(sentence, { opening: sentence, closing: '' }, 400)).toBe(true);
  });
});

describe('September 7 published assumption-copy regressions', () => {
  it.each(september7Picks)('quotes actual bullpen facts without a thesis for $pick', ({ pick, rationale }) => {
    const expected = pick.startsWith('Royals') ? {
      opening: 'Law opens today after Garcia, Morillo, Ginkel and Loáisiga all pitched Saturday and Sunday.',
      closing: '',
    } : {
      opening: 'Gómez, Hoffman and Minter all sat Sunday after throwing seven, 17 and 18 pitches Saturday.',
      closing: 'Detroit’s relief work improved in Cleveland, but Jansen, Holton, Kinley and Sommers pitched Sunday, and Finnegan worked consecutive days.',
    };
    const pickLine = pick.replace(/ [-+]\d+$/, '');
    const budget = 278 - pickLine.length - 4;
    const pair = fallbackReasonPair(rationale, budget);
    expect(pair).toEqual(expected);
    expect(isSafeReasonPair(rationale, pair, budget)).toBe(true);
    expect([pair.opening, pickLine, pair.closing].join('\n\n').length).toBeLessThanOrEqual(278);
    for (const sentence of Object.values(pair).filter(Boolean)) expect(isVerbatimSnippet(rationale, sentence)).toBe(true);
  });

  it.each(september7Picks)('rejects the old assumption selection even when copied exactly for $pick', ({ rationale }) => {
    const assumption = splitSentences(rationale).find(s => s.startsWith('My assumption'));
    expect(isVerbatimSnippet(rationale, assumption)).toBe(true);
    expect(reasonCandidates(rationale)).not.toContain(assumption);
    expect(isSafeReasonPair(rationale, { opening: assumption, closing: '' }, 278)).toBe(false);
  });

  it.each([
    'A confirmed restrictive workload limit without an available bulk option would change my assessment.',
    'The workload is established; its effect on today’s deployment is my judgment.',
    'The unresolved detail most capable of changing this bet is Arizona’s pitching plan behind Law.',
    'Loáisiga threw 36 pitches across those games, Morillo 32 and Ginkel 26.',
    'I expect those location problems to give New York opportunities to reach base and push Miami into its bullpen.',
    'Mayo and Encarnacion-Strand make those opportunities dangerous.',
    'Boston’s recent pitching success came with different starters; I expect this assignment to give Los Angeles more offensive opportunities.',
    'The relief assignments carry the most weight.',
    'The opportunity extends into the middle innings.',
    'Soto and Benge have specific ways to capitalize.',
    'The working assumptions are that Holmes delivers a competitive normal start and Atlanta can use its principal late-inning options.',
    'A restrictive pitch limit for Tong would change my decision: an early handoff would put more pressure on New York’s relief options.',
    'Encarnacion-Strand’s platoon result covers only 52 at-bats, so it deserves less weight than Mayo’s 127-at-bat sample.',
  ])('keeps assessment language and missing context out of both selection paths: %s', sentence => {
    expect(reasonCandidates(sentence)).toEqual([]);
    expect(fallbackReasonPair(sentence, 278)).toBeNull();
    expect(isSafeReasonPair(sentence, { opening: sentence, closing: '' }, 278)).toBe(false);
  });

  it('uses a single complete bullpen fact without commentary before or after it', () => {
    const thesis = 'Minnesota’s rested late-inning group tips this close matchup for me.';
    const opening = 'Gómez, Hoffman and Minter all sat Sunday after throwing seven, 17 and 18 pitches Saturday.';
    const rationale = `${thesis} ${opening}\n\nI trust Ryan to get Minnesota into the sixth inning.`;
    expect(fallbackReasonPair(rationale, 266)).toEqual({ opening, closing: '' });
  });

  it('does not promote a denied advantage over an actual matchup reason', () => {
    const fact = 'Soto has slugged .619 against four-seam fastballs, while Benge has hit .325 against both four-seamers and sinkers.';
    const caveat = 'Miami still has Petersen and Faucher coming off an unused Sunday, so I’m assigning New York no automatic advantage simply because other Marlins relievers worked yesterday.';
    expect(fallbackReasonPair(`${fact}\n\n${caveat}`, 266)).toEqual({ opening: fact, closing: '' });
  });

  it('rejects a model selecting an explicit counterargument paragraph, including a factual solo', () => {
    const opening = 'Zeon Chriss-Gremillion brings 992 career rushing yards and 10 rushing touchdowns.';
    const closing = 'Duke recorded 40 sacks last season.';
    const rationale = `${opening}\n\nThe strongest counterargument is Duke’s pass rush. ${closing}`;
    expect(isSafeReasonPair(rationale, { opening, closing }, 266)).toBe(false);
    expect(isConcreteFactSentence(closing)).toBe(true);
    expect(reasonCandidates(rationale)).toEqual([opening]);
    expect(isSafeReasonPair(rationale, { opening: closing, closing: '' }, 266)).toBe(false);
    expect(fallbackReasonPair(rationale, 266)).toEqual({ opening, closing: '' });
  });
});

// Founder directive (Aug 17 2026): pick tweets use ONLY Gary's own words —
// whole sentences copied verbatim from the stored pick rationale. The model
// SELECTS sentences; it never writes, edits, shortens, or paraphrases.
// Sep 7 follow-up: select factual evidence without an editorial thesis.

const RATIONALE = [
  'Saturday night in Anaheim, the marine layer settling over the outfield and two last-place clubs playing loose.',
  'St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.',
  'These teams are too close for the Royals to be priced like a 41% proposition, so I’m taking the full plus-money swing.',
].join('\n\n');

describe('splitSentences', () => {
  it('keeps a morning or evening start abbreviation inside the whole sentence', () => {
    const morning = 'Across the field, Oregon State begins a new coaching era at an 11 a.m. local start.';
    const evening = 'Houston plays at 7 p.m. local time.';
    expect(splitSentences(`${morning} ${evening}`)).toEqual([morning, evening]);
    expect(reasonCandidates(`${morning} ${evening}`)).not.toContain('Across the field, Oregon State begins a new coaching era at an 11 a.m.');
  });
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

describe('September 5 natural-post context regression', () => {
  it.each([
    'I expect that continuity to produce enough unsuccessful Alabama possessions to make sustained separation difficult.',
    'I expect Cook to test whether that reconstruction has immediately corrected the run-defense problems.',
    'My judgment is that those connections help Auburn sustain possessions against Baylor’s reconstructed defense.',
    'I expect that familiarity to matter immediately.',
    'I expect those options to help the Bobcats keep answering across four quarters.',
    'I expect that front to make establishing JMU’s running game difficult enough to prevent comfortable, repeated scoring possessions.',
    'I expect this particular lineup to struggle to generate sustained offense against Messick.',
    'The unresolved fact is how those new blocking combinations handle Indiana’s front.',
  ])('rejects unresolved context even when another team or player is named: %s', sentence => {
    expect(isStandaloneSentence(sentence)).toBe(false);
    expect(isSafeReasonPair(sentence, { opening: sentence, closing: '' }, 280)).toBe(false);
  });

  it('keeps a named supporting fact whole while excluding the first-person argument', () => {
    const thesis = 'I’m taking Tulane’s points because its quarterback running threat targets a documented Duke problem.';
    const opening = 'Zeon Chriss-Gremillion brings 992 career rushing yards and 10 rushing touchdowns.';
    const rationale = `${thesis} ${opening}`;
    expect(reasonCandidates(rationale)).toEqual([opening]);
    expect(isSafeReasonPair(rationale, { opening, closing: '' }, 280)).toBe(true);
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
    expect(reasonCandidates('He cashes at plus money more often than not. Minnesota’s lineup is the reason tonight.'))
      .toEqual([]);
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

  it('uses the first fitting fact without promoting a later thesis or combining unrelated paragraphs', () => {
    const thesis = 'I’m backing Pittsburgh because the starting-pitching advantage is substantial enough without asking for a run line.';
    const card = ['Jobe has a 6.23 ERA.', 'Skenes has a .649 OPS allowed.', thesis].join('\n');
    expect(fallbackReasonPair(card, thesis.length)).toEqual({ opening: 'Jobe has a 6.23 ERA.', closing: '' });
  });

  it('uses a later fitting fact whole when the first fact exceeds the budget', () => {
    const first = 'Sánchez has allowed a .737 OPS to right-handed hitters compared with .357 to lefties.';
    const fact = 'Jobe has a 6.23 ERA.';
    expect(fallbackReasonPair([first, fact].join('\n'), 25))
      .toEqual({ opening: fact, closing: '' });
    expect(fallbackReasonPair('A showdown awaits.\nJobe has a 6.23 ERA.', 25))
      .toEqual({ opening: 'Jobe has a 6.23 ERA.', closing: '' });
  });

  it('quotes the original evidence instead of a third-person verdict or unrelated dense stats', () => {
    const thesis = 'Atlanta’s lineup has a more useful handedness advantage against Sánchez than Philadelphia’s has against Sale.';
    const evidence = 'Sánchez has allowed a .737 OPS to right-handed hitters compared with .357 to lefties.';
    const card = `${thesis} ${evidence}\n\nHarper has a 1.186 OPS, Turner a .630 OPS, and Schwarber an .899 OPS.`;
    expect(fallbackReasonPair(card, 265)).toEqual({ opening: evidence, closing: '' });
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
    const card = 'The strongest argument against the bet is Pallante’s pitching. Pallante has a 2.10 ERA.\n\nRomano last pitched September 3.';
    expect(fallbackReasonPair(card, 100)).toEqual({ opening: 'Romano last pitched September 3.', closing: '' });
  });

  it('keeps one factual sentence without padding from a different paragraph', () => {
    const card = [
      'The rubber match is set at PNC Park, with two arms carrying very different certainty.',
      'Skenes has held left-handed hitters to a .649 OPS.',
      'I’m backing Pittsburgh on the moneyline because the starting-pitching advantage is substantial enough without asking for a run line.',
      'Jobe has worked only 8.2 innings in two starts, producing a 6.23 ERA.',
    ].join('\n\n');
    const pair = fallbackReasonPair(card, 400);
    expect(pair.opening.startsWith('Skenes has held')).toBe(true);
    expect(pair.closing).toBe('');
    expect(pair.opening.includes('PNC Park')).toBe(false);
  });

  it('rejects two otherwise valid facts from different source paragraphs', () => {
    const opening = 'Sánchez has allowed a .737 OPS to right-handed hitters compared with .357 to lefties.';
    const closing = 'Soto has slugged .619 against four-seam fastballs.';
    const rationale = `${opening}\n\n${closing}`;
    expect(reasonCandidates(rationale)).toEqual([opening, closing]);
    expect(isSafeReasonPair(rationale, { opening, closing }, 278)).toBe(false);
    expect(fallbackReasonPair(rationale, 278)).toEqual({ opening, closing: '' });
  });

  it('preserves source order when two nearby facts fit', () => {
    const opening = 'Law opens today after Garcia, Morillo, Ginkel and Loáisiga all pitched Saturday and Sunday.';
    const closing = 'Morillo threw 32 pitches Saturday and Sunday.';
    const rationale = `${opening} ${closing}`;
    expect(fallbackReasonPair(rationale, 266)).toEqual({ opening, closing });
    expect(isSafeReasonPair(rationale, { opening, closing }, 266)).toBe(true);
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
  const safe = 'Cleveland’s bullpen has a 3.10 ERA over the last 10 days.';

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

  it('keeps a concrete bullpen fact and named in-sentence references intact', () => {
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
    expect(isSafeReasonPair(card, { opening: safe.replace('3.10', '2.10'), closing: '' }, 278)).toBe(false);
    expect(isSafeReasonPair(card, { opening: safe, closing: safe }, 278)).toBe(false);
    expect(isSafeReasonPair(card, { opening: safe, closing: '' }, safe.length - 1)).toBe(false);
  });
});

describe('standalone-sentence gate (founder, Aug 26 — the Pirates tweet)', () => {
  it('rejects the September 7 Athletics excerpt whose capitalized Across hides an unnamed pitcher', () => {
    const anonymous = 'Across his last five starts, he has a 2.40 ERA over 30.0 innings, with 33 strikeouts and nine walks.';
    const namedFact = 'Harris last pitched September 4, and Medina last pitched September 3.';
    const rationale = `Lopez’s improvement is the deciding factor for me. ${anonymous}\n\n${namedFact}`;
    expect(isStandaloneSentence(anonymous)).toBe(false);
    expect(reasonCandidates(rationale)).toEqual([namedFact]);
    expect(isSafeReasonPair(rationale, { opening: anonymous, closing: '' }, 261)).toBe(false);
    expect(fallbackReasonPair(rationale, 261)).toEqual({ opening: namedFact, closing: '' });
  });

  it('still accepts an Across sentence with a named subject before its pronoun', () => {
    const sentence = 'Across five starts, Lopez has worked 30 innings with his 2.40 ERA.';
    expect(isStandaloneSentence(sentence)).toBe(true);
    expect(isConcreteFactSentence(sentence)).toBe(true);
    expect(isStandaloneSentence('Across his five starts, Lopez has worked 30 innings.')).toBe(false);
  });

  it.each([
    'Graceffo last pitched September 2 and gives St. Louis an option for multiple innings; O’Brien last worked September 4, throwing 12 pitches.',
    'Burns’ slider carries a 52.0% whiff rate; his latest start produced seven strikeouts, one walk and two earned runs over 5⅔ innings.',
    'Williamson covered 5⅓ innings on 87 pitches in his return, allowing three earned runs.',
  ])('preserves the other naturally published September 7 factual excerpts: %s', (sentence) => {
    expect(isConcreteFactSentence(sentence)).toBe(true);
    expect(isSafeReasonPair(sentence, { opening: sentence, closing: '' }, 278)).toBe(true);
  });

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
