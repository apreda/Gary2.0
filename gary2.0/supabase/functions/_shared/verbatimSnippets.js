/**
 * Verbatim rationale snippets (founder directive, Aug 17 2026): pick tweets
 * carry ONLY Gary's own words — whole sentences copied character-for-character
 * from the stored pick rationale. The model may SELECT sentences; nothing may
 * write, edit, shorten, or paraphrase them. September 7 follow-up: select the
 * concrete facts themselves, without a thesis or narrator commentary. Exclude
 * unsuitable sentences whole; never strip qualifiers to manufacture a fact.
 */

const ABBREVIATION = /^(?:St|Jr|Sr|Mr|Mrs|Ms|Dr|vs|No|[ap]\.m)\.$/i;

/** Whole sentences of a rationale, abbreviation- and decimal-safe. */
export function splitSentences(text) {
  const out = [];
  for (const para of String(text ?? '').split(/\n+/)) {
    const t = para.trim();
    if (!t) continue;
    let start = 0;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch !== '.' && ch !== '!' && ch !== '?') continue;
      const next = t[i + 1];
      // "3.21 ERA" never has whitespace after the mid-number period.
      if (next !== undefined && !/\s/.test(next)) continue;
      const candidate = t.slice(start, i + 1).trim();
      const lastWord = candidate.match(/(\S+)$/)?.[1] ?? '';
      if (ABBREVIATION.test(lastWord)) continue;
      if (candidate) out.push(candidate);
      while (i + 1 < t.length && /\s/.test(t[i + 1])) i += 1;
      start = i + 1;
    }
    const tail = t.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out;
}

const normWs = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Is `snippet` an exact substring of `rationale`, whitespace aside? */
export function isVerbatimSnippet(rationale, snippet) {
  const s = normWs(snippet);
  return s.length > 0 && normWs(rationale).includes(s);
}

/**
 * Deterministic selection when the model's choice fails verification: the
 * earliest sentence paired with the latest distinct sentence that fit the
 * budget together; a lone fitting sentence when no pair fits; null when
 * nothing fits whole. Sentences are never cut — no ellipsis, ever.
 * @returns {{ opening: string, closing: string } | null}
 */
export function fallbackVerbatimPair(rationale, budget) {
  const sentences = splitSentences(rationale);
  for (const opening of sentences) {
    for (let j = sentences.length - 1; j >= 0; j--) {
      const closing = sentences[j];
      if (closing === opening) continue;
      if (opening.length + closing.length <= budget) return { opening, closing };
    }
  }
  const solo = sentences.find((s) => s.length <= budget);
  return solo ? { opening: solo, closing: '' } : null;
}

// ── REASON-ONLY selection (founder, Aug 17 eve) ─────────────────────────────
// The two tweet lines must be Gary's REASONS — never the scene-setting
// opener, never a sentence that merely restates the bet, stake, or odds
// (the injected pick line between them already says the bet).

const STAKE = /\$\s?\d/;
const ODDS = /[-+]\d{3,4}\b/;
// Price vocabulary beyond a bare odds token: "plus money", "the price
// compensates", "at that price", "the juice" — priced ARGUMENT is still
// price talk (founder, Aug 26: the feed carries the read, never the number).
const PRICE_TALK = /\b(?:plus|even)[- ]money\b|\bpric(?:e|es|ed|ing)\b|\bjuice\b/i;
const META_FILLER = /^(?:the|my) (?:assumptions?|judgments?|counterarguments?|unresolved facts?) (?:are|is) \w+[.!?]$/i;
// The rationale also records uncertainty and the analyst's decision process.
// Those are useful on the full card, but are not the reasons to quote in a
// pick tweet (founder, Sep 7). Exclude the whole sentence; never remove a
// qualifier to make an assumption sound like an established fact.
const META_ANALYSIS = /\b(?:my|our|the)(?: working| primary| key)? (?:assumptions?|assessments?|judgments?)\b|\bmy decision\b|\b(?:unresolved|unverified) (?:facts?|details?)\b|\bI(?:['’]m| am)?\s+assum(?:e|ing)\b|\bdeserves? (?:less|more) weight\b/i;
const EMPTY_REASON = /\b(?:specific|several|multiple) ways to\b/i;

// A sentence the FEED can carry must stand alone (founder, Aug 26: "he will
// say he or refer to someone and nobody knows who he is talking about").
// Two torn-context shapes, both excluded whole:
//  - a connective/anaphora OPENER ("But…", "Those advantages…", "He…") —
//    the sentence continues an argument the reader never saw;
//  - an unresolved pronoun: he/his/they/their with NO name in the sentence
//    itself (a capitalized word beyond position 0 counts as the name).
// First-person stays — "I'm", "my" is Gary himself, never unresolved.
const TORN_OPENER = /^(?:but|and|so|yet|still|also|plus|though|however|meanwhile|that|those|these|this|he|his|him|she|her|they|their|them|it|its)\b/i;
const THIRD_PERSON = /\b(?:he|his|him|she|her|they|their|them|it|its)\b/i;
// References to a previous paragraph do not become self-contained just because
// another player happens to be named later in the sentence (Sep 3–4 posts).
const BACK_REFERENCE = /\b(?:that|those|these|this)\s+(?:(?:late[- ]inning|early|offensive|defensive|returning|uneven|surrounding|recent|batting|particular|new|blocking|drive-sustaining)\s+){0,2}(?:uncertainty|opportunity|advantages?|edges?|risks?|matchup|split|splits|production|stretch|span|form|case|read|number|numbers|pieces|separation|route|judgment|difference|arms|order|continuity|reconstruction|front|combinations?|connections?|familiarity|options?|position|vulnerabilities|relationships?|lineup|problems?|games|wins|losses|outings|appearances|starts|group|pitcher)\b/i;
// "Those location problems" and "those opportunities" still point to missing
// text. Allow ordinary lowercase modifiers without treating "that New York
// has ..." (a named proposition) as a reference to an earlier paragraph.
const MODIFIED_BACK_REFERENCE = /\b(?:[Tt]hose|[Tt]hese|[Tt]hat|[Tt]his)\s+(?:[a-z][a-z-]*\s+){0,2}(?:problems|opportunities|assignments?|games|wins|losses|outings|appearances|starts|group|pitcher|inefficiency|disruptions)\b/;
const STAT_ABBREVIATIONS = new Set(['ERA', 'WHIP', 'OPS', 'ER', 'K', 'BB', 'HR', 'RBI', 'AVG', 'OBP', 'SLG', 'MLB', 'NFL', 'NBA', 'NCAAF', 'AAA', 'AA']);
// Sentence-initial capitalization is ambiguous, so word[0] only counts as a
// name when it is not an ordinary sentence-starter ("Holmes has..." resolves
// a later "he"; "Their bullpen..." never does — TORN_OPENER catches those).
const STARTER_STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'over', 'with', 'without', 'if', 'when',
  'while', 'after', 'before', 'neither', 'both', 'nothing', 'there', 'what',
  'even', 'only', 'now', 'one', 'two', 'no', 'not', 'my', 'i',
  'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'every', 'lefties', 'righties', 'left-handers', 'right-handers',
]);
function hasResolvingProperNoun(t) {
  const words = String(t).split(/\s+/).map((w) => w.replace(/^["'\u201C\u2018(]+/, ''));
  const namedWord = (w) => /^[A-ZÀ-ÖØ-Þ][\p{L}'\u2019.-]+/u.test(w)
    && !STAT_ABBREVIATIONS.has(w.replace(/[^A-Z]/g, ''));
  if (words.slice(1).some(namedWord)) return true;
  const first = words[0] || '';
  return namedWord(first) && !STARTER_STOPWORDS.has(first.toLowerCase());
}
export function isStandaloneSentence(sentence) {
  const t = String(sentence ?? '').trim();
  if (TORN_OPENER.test(t)) return false;
  if (BACK_REFERENCE.test(t) || MODIFIED_BACK_REFERENCE.test(t)) return false;
  // A name after "his/he" cannot resolve the opening subject. Statistical
  // abbreviations never count as names: ER/K/BB let the Sep 3 Rangers post pass.
  const pronoun = THIRD_PERSON.exec(t);
  if (pronoun && !hasResolvingProperNoun(t.slice(0, pronoun.index))) return false;
  return true;
}

/** A sentence that carries analysis rather than restating the wager.
 *  NO PRICE TALK (founder, Aug 26 2026 — supersedes the price-critique
 *  carve-out): a sentence carrying ANY odds token or price vocabulary never
 *  reaches the feed. The verbatim law forbids editing Gary's sentences, so
 *  priced sentences are EXCLUDED whole, never scrubbed. */
export function isReasonSentence(sentence) {
  const t = String(sentence ?? '');
  if (STAKE.test(t)) return false;
  if (ODDS.test(t) || PRICE_TALK.test(t)) return false;
  if (META_ANALYSIS.test(t) || META_FILLER.test(t.trim()) || EMPTY_REASON.test(t) || /\boffers? alternatives[.!?]$/i.test(t.trim())) return false;
  if (!isStandaloneSentence(t)) return false;
  // A free-floating signpost ("The relief assignments carry the most weight")
  // does not explain a pick. Keep a named team/player in every quoted reason;
  // the reader cannot infer which side a generic "the bullpen" belongs to.
  if (!hasResolvingProperNoun(t)) return false;
  // HEADINGS ARE NOT SENTENCES (Aug 24 2026): stored rationales carry section
  // labels ("Gary's Take") as bare unpunctuated lines, and splitSentences
  // keeps paragraph tails whole. During the Aug 21+ Gemini outage the
  // deterministic fallback ran every pick, and with a long opening the tiny
  // heading was often the only "closing" that fit the budget — so posts went
  // out reading `Royals ML -104 ⏎ Gary's Take`. A tweet line must be a real
  // sentence: it ends in terminal punctuation (closing quote/paren allowed).
  if (!/[.!?]["'”’)\]]?$/.test(t.trim())) return false;
  return true;
}

// Facts, not a second commentary layer (founder, Sep 7). Numbers alone are
// insufficient: kickoff times, rankings and projected outcomes are not the
// bullpen/performance/personnel evidence the reader came for.
const NARRATOR = /\b(?:I['’](?:m|ll|d|ve)|I (?:am|see|think|expect|like|trust|want|give|have|believe|prefer|still|also)|my|me|our)\b|\b(?:this|the) (?:bet|ticket|decision)\b|\bsupplied (?:dated-game |game )?(?:sample|accounts)\b/i;
const INTERPRETATION = /\b(?:advantage|edge|reason|argument|counterarguments?|deciding|assessment|assumption|judgment|opportunit(?:y|ies)|threats?|credible|plausible|favorable|important|matters?|warning|concern)\b|\btips? (?:this|the|a) (?:close )?(?:matchup|game|balance)\b|\b(?:more dependable foundation|particularly relevant|specific opening|generous cushions|cover(?:ing)? path|need(?:s)? context)\b|\b(?:gives?|giving|makes?|making)\b[^.!?]{0,90}\b(?:case|matchup|flexibility|options?|costly|dangerous)\b|\bso\b[^.!?]{0,50}\b(?:options|flexibility)\b/i;
const HYPOTHETICAL = /\b(?:would|could|should|might|will|likely|unlikely|expected|projected|needs?|requires?)\b|\bcan (?:make|give|help|produce|create|generate|capitalize|exploit)\b|^(?:if|unless|assuming)\b/i;
const SCENE_SETTING = /\b(?:kickoff|local start|start time|weather|forecast|temperature|wind|preseason ranking|coaching era|roster turnover|conference champions open)\b|\b[ap]\.m\./i;
const QUANTITY = /\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i;
const STAT_METRIC = /\b(?:ERA|WHIP|OPS|OBP|SLG|AVG|FIP|wRC|RBI|xwOBA)\b/;
const PERFORMANCE_METRIC = /\b(?:runs?|innings?|pitches|pitch count|at-bats?|hits?|homers?|home runs?|strikeouts?|walks?|barrels?|hard-hit|yards?|touchdowns?|sacks?|interceptions?|completions?|attempts?|carries|snaps?|turnovers?|points?|wins?|losses|starters?|starts?|rebounds?|assists?|possessions?|third downs?|fourth downs?)\b/i;
const OBSERVED_EVENT = /\b(?:pitched|threw|sat|rested|worked|played|replaced|returned|joined|lost|won|scored|allowed|held|hit|slugged|batted|struck out|walked|surrendered|completed|converted|rushed|caught|took over)\b|\b(?:starts? on the bench|lineup consists of|gets? [^.!?]{0,50} back|had (?:yesterday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|the day) off)\b/i;
const OBJECTION = /\b(?:argument against|case against|counterarguments?|counterweight|strongest counter|strongest answer|primary risk|obstacle|objections?)\b|\b(?:strongest|strong|primary) (?:covering|competing|opposing) (?:path|case)\b/i;

/** Reported performance, workload or personnel evidence, in Gary's own words. */
export function isConcreteFactSentence(sentence) {
  const t = String(sentence ?? '').trim();
  if (!isReasonSentence(t)) return false;
  if (NARRATOR.test(t) || INTERPRETATION.test(t) || HYPOTHETICAL.test(t) || SCENE_SETTING.test(t)) return false;
  return (QUANTITY.test(t) && (STAT_METRIC.test(t) || PERFORMANCE_METRIC.test(t))) || OBSERVED_EVENT.test(t);
}

/** Concrete evidence in source order, outside the explicitly opposing case. */
export function reasonCandidates(rationale) {
  return String(rationale ?? '').split(/\n+/)
    .filter(paragraph => !OBJECTION.test(paragraph))
    .flatMap(splitSentences).filter(isConcreteFactSentence);
}

/** The final boundary shared by model selection and deterministic fallback. */
export function isSafeReasonPair(rationale, pair, budget) {
  if (!pair || typeof pair.opening !== 'string' || typeof pair.closing !== 'string') return false;
  if (!Number.isFinite(budget) || budget < 0) return false;
  const { opening, closing } = pair;
  const candidates = reasonCandidates(rationale).map(normWs);
  const safe = (sentence) => sentence.trim().length > 0
    && isConcreteFactSentence(sentence) && candidates.includes(normWs(sentence));
  const sameParagraph = closing === '' || String(rationale ?? '').split(/\n+/)
    .some(p => normWs(p).includes(normWs(opening)) && normWs(p).includes(normWs(closing)));
  return safe(opening) && (closing === '' || (safe(closing) && normWs(opening) !== normWs(closing)))
    && sameParagraph && opening.length + closing.length <= budget;
}

/**
 * Facts lead (founder, Sep 7, supersedes thesis-first selection). Keep the
 * original evidence order and optionally the next fitting fact in the same
 * paragraph. One fact is complete; no commentary or unrelated padding is
 * required. Nothing fitting returns null, never permission to invent copy.
 * @returns {{ opening: string, closing: string } | null}
 */
export function fallbackReasonPair(rationale, budget) {
  const cands = reasonCandidates(rationale);
  // No safe reason is a visible copy failure, never permission to reintroduce
  // headings, stakes, prices, or context-dependent prose through a fallback.
  if (!cands.length) return null;
  const paragraphs = String(rationale ?? '').split(/\n+/).map(normWs).filter(Boolean);
  const paragraphOf = (sentence) => paragraphs.findIndex(p => p.includes(normWs(sentence)));
  for (let oi = 0; oi < cands.length; oi++) {
    const opening = cands[oi];
    if (opening.length > budget) continue;
    const closing = cands.slice(oi + 1).find(s => paragraphOf(s) === paragraphOf(opening)
      && opening.length + s.length <= budget) ?? '';
    return { opening, closing };
  }
  return null;
}
