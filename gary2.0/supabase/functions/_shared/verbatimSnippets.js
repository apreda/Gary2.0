/**
 * Verbatim rationale snippets (founder directive, Aug 17 2026): pick tweets
 * carry ONLY Gary's own words — whole sentences copied character-for-character
 * from the stored pick rationale. The model may SELECT sentences; nothing may
 * write, edit, shorten, or paraphrase them. The app and the feed are the same
 * Gary, word for word.
 */

const ABBREVIATION = /^(?:St|Jr|Sr|Mr|Mrs|Ms|Dr|vs|No)\.$/i;

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
const BACK_REFERENCE = /\b(?:that|those|these|this)\s+(?:uncertainty|opportunity|advantages?|edges?|risks?|matchup|split|splits|production|stretch|span|form|case|read|number|numbers)\b/i;
const STAT_ABBREVIATIONS = new Set(['ERA', 'WHIP', 'OPS', 'ER', 'K', 'BB', 'HR', 'RBI', 'AVG', 'OBP', 'SLG', 'MLB', 'NFL', 'NBA', 'NCAAF', 'AAA', 'AA']);
// Sentence-initial capitalization is ambiguous, so word[0] only counts as a
// name when it is not an ordinary sentence-starter ("Holmes has..." resolves
// a later "he"; "Their bullpen..." never does — TORN_OPENER catches those).
const STARTER_STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'over', 'with', 'without', 'if', 'when',
  'while', 'after', 'before', 'neither', 'both', 'nothing', 'there', 'what',
  'even', 'only', 'now', 'one', 'two', 'no', 'not', 'my', 'i',
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
  if (BACK_REFERENCE.test(t)) return false;
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
  if (!isStandaloneSentence(t)) return false;
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

/** The rationale's reason-bearing sentences, whole and in order. */
export function reasonCandidates(rationale) {
  return splitSentences(rationale).filter(isReasonSentence);
}

/** The final boundary shared by model selection and deterministic fallback. */
export function isSafeReasonPair(rationale, pair, budget) {
  if (!pair || typeof pair.opening !== 'string' || typeof pair.closing !== 'string') return false;
  if (!Number.isFinite(budget) || budget < 0) return false;
  const { opening, closing } = pair;
  const candidates = reasonCandidates(rationale).map(normWs);
  const safe = (sentence) => sentence.trim().length > 0
    && isReasonSentence(sentence) && candidates.includes(normWs(sentence));
  return safe(opening) && (closing === '' || (safe(closing) && normWs(opening) !== normWs(closing)))
    && opening.length + closing.length <= budget;
}

const digitGroups = (s) => (String(s).match(/\d[\d.,%]*/g) || []).length;

/** Gary's stance/thesis sentence class — the first-person read that says WHY
 *  the bet exists ("I'm backing… because", "My read is…"). Priced wager
 *  declarations are already excluded upstream by isReasonSentence. */
const STANCE = /\b(i(?:'|’)?m backing|i(?:'|’)?m taking|i(?:'|’)?ll take|my read|my ticket|i want|i trust|this sets up)\b/i;

/**
 * Deterministic reason pair — THE ARGUMENT LEADS (founder, Aug 19 2026: the
 * Skenes tweet led with a platoon fragment while the card's actual thesis
 * sat unquoted; stat density is not the argument). Opening = Gary's
 * stance/thesis sentence when one exists, else the first reason in card
 * order — always printed first. Closing = the most stat-dense OTHER reason
 * that fits: the evidence under the argument. Sentences are never cut;
 * nothing fitting returns null.
 * @returns {{ opening: string, closing: string } | null}
 */
export function fallbackReasonPair(rationale, budget) {
  const cands = reasonCandidates(rationale);
  // No safe reason is a visible copy failure, never permission to reintroduce
  // headings, stakes, prices, or context-dependent prose through a fallback.
  if (!cands.length) return null;
  const stanceIdx = cands.findIndex((s) => STANCE.test(s));
  // Opening preference: the stance sentence, then digit-bearing reasons in
  // card order (a digit-less non-stance sentence is usually atmosphere —
  // the scene-setter must stay a last resort), then everything else.
  const rest = cands.map((_, i) => i).filter((i) => i !== stanceIdx);
  const withDigits = rest.filter((i) => digitGroups(cands[i]) > 0);
  const noDigits = rest.filter((i) => digitGroups(cands[i]) === 0);
  const openingOrder = [...(stanceIdx >= 0 ? [stanceIdx] : []), ...withDigits, ...noDigits];
  for (const oi of openingOrder) {
    const opening = cands[oi];
    const evidence = cands
      .map((s, i) => ({ s, i, d: digitGroups(s) }))
      .filter((r) => r.i !== oi && opening.length + r.s.length <= budget)
      .sort((a, b) => (b.d - a.d) || (a.i - b.i));
    if (evidence.length) return { opening, closing: evidence[0].s };
  }
  const solo = cands.find((s) => s.length <= budget);
  return solo ? { opening: solo, closing: '' } : null;
}
